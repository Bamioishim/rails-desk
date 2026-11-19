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
  const payload = JSON.stringif¶»§q«^