export type FileDecision = "approved" | "refused" | "cancelled";
export type FileReceipt = {
  index: number;
  id: string;
  timestamp: string;
  action: "transfer";
  amount: number;
  recipient: string;
  reason: string;
  decision: FileDecision;
  decisionReason: string;
  execution: "executed (mock)" | "not executed";
  previousHash: string;
  hash: string;
};
export type FileVerification = {
  valid: boolean;
  brokenAt: number | null;
  count: number;
  error?: string;
};
export const GENESIS_HASH: string;
export const DEFAULT_FILE: string;
export function hashReceipt(base: Omit<FileReceipt, "hash">): string;
export function readReceiptFile(filePath?: string): Promise<{ receipts: FileReceipt[]; verification: FileVerification }>;
export function verifyReceiptFile(filePath?: string): Promise<FileVerification>;
export function appendFileReceipt(input: {
  amount: number;
  recipient: string;
  reason: string;
  decision?: FileDecision;
  decisionReason?: string;
  filePath?: string;
  rails?: { spendingCap: number; allowedRecipients: string[] };
}): Promise<FileReceipt>;
