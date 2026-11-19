export type Rails = { spendingCap: number; allowedRecipients: string[] };
export type Proposal = { id: string; amount: number; recipient: string; reason: string; createdAt: string };
export type Decision = "approved" | "refused" | "cancelled";
export type Receipt = {
  index: number; id: string; timestamp: string; action: "transfer"; amount: number;
  recipient: string; reason: string; decision: Decision; decisionReason: string;
  execution: "executed (mock)" | "not executed"; previousHash: string; hash: string;
};
export const DEFAULT_RAILS: Rails = { spendingCap: 20, allowedRecipients: ["Alex", "Jordan", "Sam"] };
export const GENESIS_HASH = "0".repeat(64);

export function checkProposal(proposal: Pick<Proposal, "amount" | "recipient">, rails: Rails) {
  if (!Number.isFinite(proposal.amount) || proposal.amount <= 0) return { decision: "refused" as const, reason: "Amount must be greater than zero." };
  if (proposal.amount > rails.spendingCap) return { decision: "refused" as const, reason: `Amount exceeds the spending cap of ${rails.spendingCap}.` };
  const allowed = rails.allowedRecipients.some((name) => name.trim().toLowerCase() === proposal.recipient.trim().toLowerCase());
  if (!allowed) return { decision: "refused" as const, reason: "Recipient is not on the allowed list." };
  return { decision: "approved" as const, reason: "Proposal is within the configured rails." };
}
export async function hashReceipt(receipt: Omit<Receipt, "hash">) {
  const payload = JSON.stringify(receipt);
  const bytes = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function appendReceipt(existing: Receipt[], proposal: Proposal, decision: Decision, decisionReason: string): Promise<Receipt[]> {
  const previousHash = existing.at(-1)?.hash ?? GENESIS_HASH;
  const base: Omit<Receipt, "hash"> = {
    index: existing.length + 1, id: crypto.randomUUID(), timestamp: new Date().toISOString(),
    action: "transfer", amount: proposal.amount, recipient: proposal.recipient, reason: proposal.reason,
    decision, decisionReason, execution: decision === "approved" ? "executed (mock)" : "not executed", previousHash,
  };
  const receipt = { ...base, hash: await hashReceipt(base) };
  return [...existing, receipt];
}
export async function verifyChain(receipts: Receipt[]) {
  let previousHash = GENESIS_HASH;
  for (let i = 0; i < receipts.length; i++) {
    const { hash, ...base } = receipts[i];
    if (base.index !== i + 1 || base.previousHash !== previousHash) return { valid: false, brokenAt: i + 1 };
    if (await hashReceipt(base) !== hash) return { valid: false, brokenAt: i + 1 };
    previousHash = hash;
  }
  return { valid: true, brokenAt: null };
}
