import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { loadVersioned, saveRaw, storageMode, StoreBusyError, withLock } from "./desk-store";

export type Rules = { allowedRecipients: string[]; maxPerAction: number; reviewLimit: number; dailySpendCap: number };
export type Status = "approved" | "needs_review" | "blocked";
export type Check = { rule: "amount" | "max_per_action" | "allowlist" | "review_limit" | "daily_spend_cap"; passed: boolean; detail: string };
export type PolicySnapshot = { rules: Rules; checks: Check[] };
export type Proposal = {
  id: string; createdAt: string; amount: number; recipient: string; reason: string; agent: string;
  status: Status; checks: Check[]; reasons: string[]; policySnapshot?: PolicySnapshot;
  review: null | { decision: "approved" | "refused"; at: string; note?: string; policySnapshot?: PolicySnapshot };
  /** Opaque legacy data retained in storage; never exposed or acted on. */
  settlement?: unknown;
  receiptIds: string[];
  /** Set when a pending review exceeds the 24-hour decision window. */
  expiredAt?: string;
};
export type DeskReceipt = {
  index: number; id: string; at: string; proposalId: string; event: string;
  source?: "app" | "demo";
  outcome: "approved" | "needs_review" | "blocked" | "refused"; amount: number; recipient: string; detail: string;
  /** Immutable rules and checks used for this event. Older receipts may not have a snapshot. */
  policySnapshot?: PolicySnapshot;
  previousHash: string; hash: string;
};
type Desk = {
  version: 1; id: string; name: string; createdAt: string;
  ownerKeyHash: string; agentKeyHash: string; agentKeyHint: string;
  ownerSessions?: { tokenHash: string; createdAt: string; expiresAt: string }[];
  rules: Rules; proposals: Proposal[]; receipts: DeskReceipt[]; demoReceipts?: DeskReceipt[];
  /** Opaque legacy data retained in storage; never exposed or acted on. */
  anchors?: unknown[];
};

export const DEFAULT_RULES: Rules = { allowedRecipients: ["Alex", "Jordan", "Sam"], maxPerAction: 20, reviewLimit: 10, dailySpendCap: 100 };
const GENESIS = "0".repeat(64);
const MAX_PROPOSALS = 500;
export const PENDING_REVIEW_TTL_MS = 24 * 60 * 60 * 1000;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const token = (n = 24) => randomBytes(n).toString("base64url");
const newId = (prefix: string) => `${prefix}_${randomBytes(9).toString("hex")}`;

export class DeskError extends Error { constructor(message: string, readonly status: number) { super(message); } }

function equalHash(a: string, b: string) {
  const x = Buffer.from(a, "hex"), y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Keys look like rd_owner_<deskId>_<secret> and rd_agent_<deskId>_<secret>. Only hashes are stored. */
function parseKey(key: string | null) {
  const m = key?.match(/^rd_(owner|agent|session)_([a-z0-9]{8,40})_([A-Za-z0-9_-]{20,})$/);
  if (!m) throw new DeskError("Missing or malformed API key. Send Authorization: Bearer <key>.", 401);
  return { role: m[1] as "owner" | "agent" | "session", deskId: m[2], key: key! };
}
export function bearer(request: Request) { return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? null; }

async function load(deskId: string): Promise<{ desk: Desk; rev: string }> {
  const { raw, rev } = await loadVersioned(deskId);
  if (!raw) throw new DeskError("Desk not found. It may have been cleared from temporary storage; create a new desk.", 404);
  return { desk: JSON.parse(raw) as Desk, rev };
}
async function authed(key: string | null, need: "owner" | "agent" | "any") {
  const k = parseKey(key);
  if (need === "owner" && k.role === "agent") throw new DeskError("This action needs the owner credential, not the agent key.", 403);
  const { desk, rev } = await load(k.deskId);
  const candidateHash = sha(k.key);
  const ok = k.role === "owner"
    ? equalHash(candidateHash, desk.ownerKeyHash)
    : k.role === "agent"
      ? equalHash(candidateHash, desk.agentKeyHash)
      : (desk.ownerSessions ?? []).some((session) => equalHash(candidateHash, session.tokenHash) && Date.parse(session.expiresAt) > Date.now());
  if (!ok) throw new DeskError("Invalid or expired owner session.", 401);
  return { desk, role: k.role, rev };
}

/**
 * Read-modify-write one desk atomically: per-desk lock (local + Redis), then a
 * compare-and-set save on the revision that was read. A lost race is retried on fresh
 * state, so two proposals can never both extend the same receipt (no chain fork).
 */
async function mutate<T>(key: string | null, need: "owner" | "any", fn: (desk: Desk) => T | Promise<T>): Promise<T> {
  const { deskId } = parseKey(key);
  return withLock(deskId, async () => {
    for (let attempt = 0; ; attempt++) {
      const { desk, rev } = await authed(key, need);
      const result = await fn(desk);
      try { await saveRaw(desk.id, JSON.stringify(desk), rev); return result; }
      catch (e) { if (!(e instanceof StoreBusyError) || attempt >= 4) throw e; }
    }
  });
}

export function cleanRules(input: unknown): Rules {
  const r = (input ?? {}) as Partial<Rules>;
  const names = Array.isArray(r.allowedRecipients) ? r.allowedRecipients.map((x) => String(x).trim()).filter(Boolean).slice(0, 200) : [];
  const uniq = [...new Map(names.map((n) => [n.toLowerCase(), n.slice(0, 80)])).values()];
  const max = Number(r.maxPerAction), review = Number(r.reviewLimit), daily = Number(r.dailySpendCap ?? DEFAULT_RULES.dailySpendCap);
  if (!Number.isFinite(max) || max < 0) throw new DeskError("maxPerAction must be a number of 0 or more.", 400);
  if (!Number.isFinite(review) || review < 0) throw new DeskError("reviewLimit must be a number of 0 or more.", 400);
  if (!Number.isFinite(daily) || daily < 0) throw new DeskError("dailySpendCap must be a number of 0 or more.", 400);
  return { allowedRecipients: uniq, maxPerAction: Math.round(max * 100) / 100, reviewLimit: Math.round(Math.min(review, max) * 100) / 100, dailySpendCap: Math.round(daily * 100) / 100 };
}

export function evaluate(amount: number, recipient: string, rules: Rules): { status: Status; checks: Check[] } {
  const checks: Check[] = [];
  const positive = Number.isFinite(amount) && amount > 0;
  checks.push({ rule: "amount", passed: positive, detail: positive ? `Amount ${amount} is a positive number.` : "Amount must be greater than zero." });
  const underMax = positive && amount <= rules.maxPerAction;
  checks.push({ rule: "max_per_action", passed: underMax, detail: underMax ? `${amount} is within the ${rules.maxPerAction} maximum.` : `${amount} is over the ${rules.maxPerAction} maximum per action.` });
  const listed = rules.allowedRecipients.some((n) => n.toLowerCase() === recipient.trim().toLowerCase());
  checks.push({ rule: "allowlist", passed: listed, detail: listed ? `${recipient} is on the allowed list.` : `${recipient} is not on the allowed list.` });
  const blocked = !positive || !underMax || !listed;
  const underReview = amount <= rules.reviewLimit;
  checks.push({ rule: "review_limit", passed: blocked ? true : underReview, detail: blocked ? "Not reached: already blocked." : underReview ? `${amount} is within the ${rules.reviewLimit} review limit.` : `${amount} is above the ${rules.reviewLimit} review limit, so it needs your OK.` });
  return { status: blocked ? "blocked" : underReview ? "approved" : "needs_review", checks };
}

function snapshotPolicy(rules: Rules, checks: Check[]): PolicySnapshot {
  return { rules: { ...DEFAULT_RULES, ...rules, allowedRecipients: [...rules.allowedRecipients] }, checks: checks.map((check) => ({ ...check })) };
}

function dailyCommittedSpend(desk: Desk, now = new Date(), excludeProposalId?: string) {
  const windowStart = now.getTime() - 24 * 60 * 60 * 1000;
  return desk.proposals.reduce((sum, proposal) => {
    if (proposal.id === excludeProposalId) return sum;
    const active = !proposal.expiredAt && (proposal.status === "approved" ||
      (proposal.status === "needs_review" && (!proposal.review || proposal.review.decision === "approved")));
    if (!active) return sum;
    // Pending proposals reserve budget from creation; reviewed approvals count from approval time.
    const committedAt = Date.parse(
      proposal.status === "needs_review" && proposal.review?.decision === "approved"
        ? proposal.review.at
        : proposal.createdAt,
    );
    // Pending proposals keep their reservation until approved or refused, even if
    // the review itself takes longer than 24 hours.
    const stillPending = proposal.status === "needs_review" && !proposal.review;
    return stillPending || (Number.isFinite(committedAt) && committedAt > windowStart && committedAt <= now.getTime())
      ? sum + proposal.amount
      : sum;
  }, 0);
}

function trimProposals(proposals: Proposal[], now = Date.now()) {
  const windowStart = now - 24 * 60 * 60 * 1000;
  const retained = proposals.filter((proposal) => {
    const pending = proposal.status === "needs_review" && !proposal.review && !proposal.expiredAt;
    if (pending) return true;
    const active = !proposal.expiredAt && (proposal.status === "approved" ||
      (proposal.status === "needs_review" && proposal.review?.decision === "approved"));
    if (!active) return false;
    const committedAt = Date.parse(
      proposal.status === "needs_review" && proposal.review?.decision === "approved"
        ? proposal.review.at
        : proposal.createdAt,
    );
    return Number.isFinite(committedAt) && committedAt > windowStart && committedAt <= now;
  });
  const retainedIds = new Set(retained.map((proposal) => proposal.id));
  const history = proposals.filter((proposal) => !retainedIds.has(proposal.id)).slice(-MAX_PROPOSALS);
  return [...history, ...retained].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

function appendDemoReceipt(desk: Desk, r: Omit<DeskReceipt, "index" | "id" | "at" | "previousHash" | "hash">) {
  const chain = desk.demoReceipts ?? (desk.demoReceipts = []);
  const previousHash = chain.at(-1)?.hash ?? GENESIS;
  const base = { index: (chain.at(-1)?.index ?? 0) + 1, id: newId("demo"), at: new Date().toISOString(), ...r, source: "demo" as const, previousHash };
  const receipt: DeskReceipt = { ...base, hash: sha(JSON.stringify(base)) };
  chain.push(receipt);
  if (chain.length > MAX_PROPOSALS * 2) desk.demoReceipts = chain.slice(-MAX_PROPOSALS * 2);
  return receipt;
}

function appendReceipt(desk: Desk, r: Omit<DeskReceipt, "index" | "id" | "at" | "previousHash" | "hash">) {
  const previousHash = desk.receipts.at(-1)?.hash ?? GENESIS;
  const base = { index: (desk.receipts.at(-1)?.index ?? 0) + 1, id: newId("rcpt"), at: new Date().toISOString(), ...r, previousHash };
  const receipt: DeskReceipt = { ...base, hash: sha(JSON.stringify(base)) };
  desk.receipts.push(receipt);
  if (desk.receipts.length > MAX_PROPOSALS * 2) desk.receipts = desk.receipts.slice(-MAX_PROPOSALS * 2);
  return receipt;
}

function expirePendingProposals(desk: Desk, now = new Date()) {
  const cutoff = now.getTime() - PENDING_REVIEW_TTL_MS;
  for (const proposal of desk.proposals) {
    if (proposal.status !== "needs_review" || proposal.review || proposal.expiredAt) continue;
    const createdAt = Date.parse(proposal.createdAt);
    if (!Number.isFinite(createdAt) || createdAt > cutoff) continue;
    proposal.expiredAt = now.toISOString();
    const receipt = appendReceipt(desk, {
      proposalId: proposal.id,
      event: "review_expired",
      outcome: "refused",
      amount: proposal.amount,
      recipient: proposal.recipient,
      detail: "The 24-hour owner review window expired. This proposal can no longer be approved.",
      policySnapshot: proposal.policySnapshot,
    });
    proposal.receiptIds.push(receipt.id);
  }
}

export function publicDesk(desk: Desk) {
  const { ownerKeyHash: _o, agentKeyHash: _a, anchors: _legacyAnchors, ...rest } = desk;
  void _o; void _a; void _legacyAnchors;
  const proposals = desk.proposals.map(({ settlement: _legacySettlement, ...proposal }) => {
    void _legacySettlement;
    return proposal;
  });
  return { ...rest, proposals, demoReceipts: desk.demoReceipts ?? [], demoVerification: verifyDeskChain(desk.demoReceipts ?? []), storage: storageMode(), pending: desk.proposals.filter((p) => p.status === "needs_review" && !p.review && !p.expiredAt).length };
}
export function publicProposal(p: Proposal) {
  const final = p.expiredAt ? "expired" : p.review ? p.review.decision : p.status;
  return { id: p.id, status: p.status, final_status: final, awaiting_review: p.status === "needs_review" && !p.review && !p.expiredAt, expired_at: p.expiredAt ?? null, amount: p.amount, recipient: p.recipient, reason: p.reason, reasons: p.reasons, checks: p.checks, policy_snapshot: p.policySnapshot ?? null, receipt_id: p.receiptIds[0], receipt_ids: p.receiptIds, review: p.review, created_at: p.createdAt };
}

export async function createDesk(name?: string) {
  const id = randomBytes(8).toString("hex");
  const ownerKey = `rd_owner_${id}_${token()}`;
  const agentKey = `rd_agent_${id}_${token()}`;
  const desk: Desk = { version: 1, id, name: (name || "My desk").slice(0, 60), createdAt: new Date().toISOString(), ownerKeyHash: sha(ownerKey), agentKeyHash: sha(agentKey), agentKeyHint: agentKey.slice(-4), rules: DEFAULT_RULES, proposals: [], receipts: [], demoReceipts: [] };
  await saveRaw(id, JSON.stringify(desk));
  return { desk: publicDesk(desk), ownerKey, agentKey };
}

export async function getDesk(key: string | null) { return mutate(key, "owner", (desk) => { expirePendingProposals(desk); return publicDesk(desk); }); }

export async function updateRules(key: string | null, rules: unknown) {
  return mutate(key, "owner", (desk) => { desk.rules = cleanRules(rules); return desk; }).then(publicDesk);
}

export async function rotateAgentKey(key: string | null) {
  return mutate(key, "owner", (desk) => {
    const agentKey = `rd_agent_${desk.id}_${token()}`;
    desk.agentKeyHash = sha(agentKey); desk.agentKeyHint = agentKey.slice(-4);
    return { agentKey };
  });
}

export async function rotateOwnerKey(key: string | null) {
  return mutate(key, "owner", (desk) => {
    const ownerKey = `rd_owner_${desk.id}_${token()}`;
    desk.ownerKeyHash = sha(ownerKey);
    // Credential rotation revokes every existing browser session. The caller must
    // establish a fresh session with the returned owner key before continuing.
    desk.ownerSessions = [];
    return { ownerKey };
  });
}

const OWNER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OWNER_SESSION_LIMIT = 10;

/** Issue a random, revocable browser session; only its SHA-256 hash is persisted. */
export async function createOwnerSession(ownerKey: string) {
  const sessionToken = await mutate(ownerKey, "owner", (desk) => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OWNER_SESSION_TTL_MS).toISOString();
    desk.ownerSessions = (desk.ownerSessions ?? []).filter((session) => Date.parse(session.expiresAt) > now.getTime()).slice(-(OWNER_SESSION_LIMIT - 1));
    const value = `rd_session_${desk.id}_${token()}`;
    desk.ownerSessions.push({ tokenHash: sha(value), createdAt: now.toISOString(), expiresAt });
    return value;
  });
  return sessionToken;
}

/** Revoke exactly the browser session presented by the caller. */
export async function revokeOwnerSession(sessionToken: string | null) {
  const parsed = parseKey(sessionToken);
  if (parsed.role !== "session") return false;
  return mutate(sessionToken, "owner", (desk) => {
    const before = desk.ownerSessions?.length ?? 0;
    const digest = sha(sessionToken!);
    desk.ownerSessions = (desk.ownerSessions ?? []).filter((session) => !equalHash(session.tokenHash, digest));
    return (desk.ownerSessions.length < before);
  });
}

export async function propose(key: string | null, body: unknown) {
  parseKey(key);
  const b = (body ?? {}) as Record<string, unknown>;
  const amount = Number(b.amount);
  const recipient = typeof b.recipient === "string" ? b.recipient.trim().slice(0, 80) : "";
  const reason = typeof b.reason === "string" ? b.reason.slice(0, 500) : "";
  const agent = typeof b.agent === "string" ? b.agent.slice(0, 60) : "agent";
  if (!recipient) throw new DeskError("recipient (string) is required.", 400);
  if (b.amount === undefined || b.amount === null || Number.isNaN(amount)) throw new DeskError("amount (number) is required.", 400);
  return mutate(key, "any", (desk) => {
    expirePendingProposals(desk);
    const { status: initialStatus, checks } = evaluate(amount, recipient, { ...DEFAULT_RULES, ...desk.rules });
    const committed = dailyCommittedSpend(desk);
    const dailyCap = desk.rules.dailySpendCap ?? DEFAULT_RULES.dailySpendCap;
    const withinDaily = committed + amount <= dailyCap;
    checks.push({ rule: "daily_spend_cap", passed: initialStatus === "blocked" || withinDaily, detail: initialStatus === "blocked" ? "Not reached: already blocked." : withinDaily ? `${committed} already committed + ${amount} proposed is within the daily cap of ${dailyCap}.` : `Daily spend cap of ${dailyCap} would be exceeded (${committed} already committed + ${amount} proposed).` });
    const status: Status = initialStatus === "blocked" || !withinDaily ? "blocked" : initialStatus;
    const policySnapshot = snapshotPolicy({ ...DEFAULT_RULES, ...desk.rules }, checks);
    const proposal: Proposal = { id: newId("prop"), createdAt: new Date().toISOString(), amount, recipient, reason, agent, status, checks, reasons: checks.filter((c) => !c.passed || (c.rule === "review_limit" && status === "needs_review")).map((c) => c.detail), policySnapshot, review: null, receiptIds: [] };
    if (status === "approved") proposal.reasons = ["Within every rule, so it is approved without a person."];
    const receipt = appendReceipt(desk, { proposalId: proposal.id, event: "decided_by_rails", outcome: status, amount, recipient, detail: proposal.reasons.join(" "), policySnapshot });
    proposal.receiptIds.push(receipt.id);
    desk.proposals.push(proposal);
    // Never trim an active reservation or spend record inside the cap window.
    desk.proposals = trimProposals(desk.proposals);
    return publicProposal(proposal);
  });
}

export async function getProposal(key: string | null, id: string) {
  return mutate(key, "any", (desk) => {
    expirePendingProposals(desk);
    const p = desk.proposals.find((x) => x.id === id);
    if (!p) throw new DeskError("Proposal not found.", 404);
    return publicProposal(p);
  });
}

export async function decide(key: string | null, id: string, decision: unknown, note?: unknown) {
  if (decision !== "approve" && decision !== "refuse") throw new DeskError('decision must be "approve" or "refuse".', 400);
  parseKey(key);
  const result = await mutate(key, "owner", (desk) => {
    expirePendingProposals(desk);
    const p = desk.proposals.find((x) => x.id === id);
    if (!p) throw new DeskError("Proposal not found.", 404);
    if (p.expiredAt) return { expired: true as const };
    if (p.status !== "needs_review") throw new DeskError(`This proposal was ${p.status} by the rails; only proposals that need review can be decided.`, 409);
    if (p.review) throw new DeskError(`Already ${p.review.decision}.`, 409);
    // Re-check against the current rules: a payment blocked by today's rules cannot be approved.
    const recheck = evaluate(p.amount, p.recipient, { ...DEFAULT_RULES, ...desk.rules });
    const committedWithoutProposal = dailyCommittedSpend(desk, new Date(), p.id);
    const dailyCap = desk.rules.dailySpendCap ?? DEFAULT_RULES.dailySpendCap;
    const withinDaily = committedWithoutProposal + p.amount <= dailyCap;
    recheck.checks.push({ rule: "daily_spend_cap", passed: recheck.status === "blocked" || withinDaily, detail: recheck.status === "blocked" ? "Not reached: already blocked." : withinDaily ? `${committedWithoutProposal} already committed + ${p.amount} proposed is within the daily cap of ${dailyCap}.` : `Daily spend cap of ${dailyCap} would be exceeded (${committedWithoutProposal} already committed + ${p.amount} proposed).` });
    if (decision === "approve" && (recheck.status === "blocked" || !withinDaily)) throw new DeskError("The current rules block this payment, so it cannot be approved.", 409);
    const policySnapshot = snapshotPolicy({ ...DEFAULT_RULES, ...desk.rules }, recheck.checks);
    p.review = { decision: decision === "approve" ? "approved" : "refused", at: new Date().toISOString(), note: typeof note === "string" ? note.slice(0, 200) : undefined, policySnapshot };
    const r = appendReceipt(desk, { proposalId: p.id, event: decision === "approve" ? "approved_by_owner" : "refused_by_owner", outcome: decision === "approve" ? "approved" : "refused", amount: p.amount, recipient: p.recipient, detail: decision === "approve" ? "Approved by you after review." : "Refused by you after review.", policySnapshot });
    p.receiptIds.push(r.id);
    return { expired: false as const, proposal: publicProposal(p) };
  });
  if (result.expired) throw new DeskError("The 24-hour owner review window expired. This proposal can no longer be approved.", 409);
  return result.proposal;
}



export async function recordDemoEvent(key: string | null, input: unknown) {
  const body = (input ?? {}) as Record<string, unknown>;
  const recipient = typeof body.recipient === "string" ? body.recipient.trim().slice(0, 80) : "";
  const amount = Number(body.amount);
  const detail = typeof body.detail === "string" ? body.detail.slice(0, 500) : "";
  const outcome = body.outcome;
  if (!recipient || !Number.isFinite(amount) || !["approved", "needs_review", "blocked", "refused"].includes(String(outcome)) || !detail) {
    throw new DeskError("A valid demo recipient, amount, outcome and detail are required.", 400);
  }
  return mutate(key, "owner", (desk) => appendDemoReceipt(desk, {
    proposalId: typeof body.demoId === "string" ? body.demoId.slice(0, 80) : "demo",
    event: "demo_activity",
    outcome: outcome as DeskReceipt["outcome"],
    amount,
    recipient,
    detail,
  }));
}

export function verifyDeskChain(receipts: DeskReceipt[]) {
  for (let i = 0; i < receipts.length; i++) {
    const { hash, ...base } = receipts[i];
    if (i > 0 && base.previousHash !== receipts[i - 1].hash) return { valid: false, brokenAt: base.index };
    if (sha(JSON.stringify(base)) !== hash) return { valid: false, brokenAt: base.index };
  }
  return { valid: true, brokenAt: null };
}
