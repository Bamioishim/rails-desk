import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

export const GENESIS_HASH = "0".repeat(64);
export const DEFAULT_FILE = path.resolve(process.cwd(), "data/receipts.jsonl");
const DEFAULT_RAILS = { spendingCap: 20, allowedRecipients: ["Alex", "Jordan", "Sam"] };
const writeQueues = new Map();

export function hashReceipt(base) {
  return createHash("sha256").update(JSON.stringify(base), "utf8").digest("hex");
}

function verifyReceipts(receipts) {
  let previousHash = GENESIS_HASH;
  for (let i = 0; i < receipts.length; i++) {
    const { hash, ...base } = receipts[i];
    if (base.index !== i + 1 || base.previousHash !== previousHash || typeof hash !== "string" || hashReceipt(base) !== hash) {
      return { valid: false, brokenAt: i + 1, count: receipts.length, error: "index, link or hash mismatch" };
    }
    previousHash = hash;
  }
  return { valid: true, brokenAt: null, count: receipts.length };
}

export async function readReceiptFile(filePath = DEFAULT_FILE) {
  let raw;
  try {
    raw = await readFile(/*turbopackIgnore: true*/ filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return { receipts: [], verification: { valid: true, brokenAt: null, count: 0 } };
    throw error;
  }
  const lines = raw.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const receipts = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      receipts.push(JSON.parse(lines[i]));
    } catch {
      return { receipts, verification: { valid: false, brokenAt: i + 1, count: lines.length, error: "invalid JSON" } };
    }
  }
  return { receipts, verification: verifyReceipts(receipts) };
}

export async function verifyReceiptFile(filePath = DEFAULT_FILE) {
  return (await readReceiptFile(filePath)).verification;
}

function serializeWrite(filePath, operation) {
  const previous = writeQueues.get(filePath) ?? Promise.resolve();
  const current = previous.then(operation, operation);
  writeQueues.set(filePath, current.catch(() => {}));
  return current;
}

export function appendFileReceipt({
  amount,
  recipient,
  reason,
  decision: requestedDecision,
  decisionReason: requestedReason,
  filePath = DEFAULT_FILE,
  rails = DEFAULT_RAILS,
}) {
  const resolvedPath = path.resolve(/*turbopackIgnore: true*/ filePath);
  return serializeWrite(resolvedPath, async () => {
    const state = await readReceiptFile(resolvedPath);
    if (!state.verification.valid) {
      throw new Error(`Refusing to append: chain is broken at entry ${state.verification.brokenAt}`);
    }
    if (typeof recipient !== "string" || !recipient.trim()) throw new Error("Recipient is required.");
    if (typeof reason !== "string") throw new Error("Reason must be text.");
    if (!["approved", "refused", "cancelled", undefined].includes(requestedDecision)) {
      throw new Error("Decision must be approved, refused or cancelled.");
    }

    const allowed = Array.isArray(rails.allowedRecipients) &&
      rails.allowedRecipients.some((name) => typeof name === "string" && name.trim().toLowerCase() === recipient.trim().toLowerCase());
    let policyReason = "Proposal is within the configured rails.";
    if (!Number.isFinite(amount) || amount <= 0) policyReason = "Amount must be greater than zero.";
    else if (amount > Number(rails.spendingCap)) policyReason = `Amount exceeds the spending cap of ${rails.spendingCap}.`;
    else if (!allowed) policyReason = "Recipient is not on the allowed list.";

    const policyRefused = policyReason !== "Proposal is within the configured rails.";
    const decision = requestedDecision === "cancelled" || requestedDecision === "refused"
      ? requestedDecision
      : policyRefused ? "refused" : "approved";
    const decisionReason = policyRefused && decision === "refused"
      ? policyReason
      : (requestedReason ?? (decision === "cancelled" ? "Cancelled before execution." : decision === "refused" ? "Refused during review." : "Approved and executed (mock) after passing the configured rails."));
    const previousHash = state.receipts.at(-1)?.hash ?? GENESIS_HASH;
    const base = {
      index: state.receipts.length + 1,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      action: "transfer",
      amount,
      recipient: recipient.trim(),
      reason,
      decision,
      decisionReason,
      execution: decision === "approved" ? "executed (mock)" : "not executed",
      previousHash,
    };
    const receipt = { ...base, hash: hashReceipt(base) };
    await mkdir(path.dirname(resolvedPath), { recursive: true });
    await appendFile(resolvedPath, JSON.stringify(receipt) + "\n", { encoding: "utf8", flag: "a" });
    return receipt;
  });
}
