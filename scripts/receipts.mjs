#!/usr/bin/env node
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const GENESIS_HASH = "0".repeat(64);
const DEFAULT_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/receipts.jsonl");

export function hashReceipt(base) {
  return createHash("sha256").update(JSON.stringify(base), "utf8").digest("hex");
}

export async function verifyReceiptFile(filePath = DEFAULT_FILE) {
  let raw;
  try { raw = await readFile(filePath, "utf8"); }
  catch (error) {
    if (error.code === "ENOENT") return { valid: true, brokenAt: null, count: 0 };
    throw error;
  }
  const lines = raw.split("\n");
  if (lines.at(-1) === "") lines.pop();
  let previousHash = GENESIS_HASH;
  for (let i = 0; i < lines.length; i++) {
    let receipt;
    try { receipt = JSON.parse(lines[i]); }
    catch { return { valid: false, brokenAt: i + 1, count: lines.length, error: "invalid JSON" }; }
    const { hash, ...base } = receipt;
    if (base.index !== i + 1 || base.previousHash !== previousHash || typeof hash !== "string" || hashReceipt(base) !== hash) {
      return { valid: false, brokenAt: i + 1, count: lines.length, error: "index, link or hash mismatch" };
    }
    previousHash = hash;
  }
  return { valid: true, brokenAt: null, count: lines.length };
}

export async function appendFileReceipt({ amount, recipient, reason, filePath = DEFAULT_FILE, rails = { spendingCap: 20, allowedRecipients: ["Alex", "Jordan", "Sam"] } }) {
  const verified = await verifyReceiptFile(filePath);
  if (!verified.valid) throw new Error(`Refusing to append: chain is broken at entry ${verified.brokenAt}`);
  const allowed = rails.allowedRecipients.some((name) => name.trim().toLowerCase() === recipient.trim().toLowerCase());
  let decision = "approved";
  let decisionReason = "Proposal is within the configured rails.";
  if (!Number.isFinite(amount) || amount <= 0) { decision = "refused"; decisionReason = "Amount must be greater than zero."; }
  else if (amount > rails.spendingCap) { decision = "refused"; decisionReason = `Amount exceeds the spending cap of ${rails.spendingCap}.`; }
  else if (!allowed) { decision = "refused"; decisionReason = "Recipient is not on the allowed list."; }
  const previousHash = verified.count ? (await readFile(filePath, "utf8")).trimEnd().split("\n").at(-1) && JSON.parse((await readFile(filePath, "utf8")).trimEnd().split("\n").at(-1)).hash : GENESIS_HASH;
  const base = {
    index: verified.count + 1,
    id: `local-${Date.now()}-${process.pid}`,
    timestamp: new Date().toISOString(),
    action: "transfer",
    amount,
    recipient,
    reason,
    decision,
    decisionReason,
    execution: decision === "approved" ? "executed (mock)" : "not executed",
    previousHash
  };
  const receipt = { ...base, hash: hashReceipt(base) };
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, JSON.stringify(receipt) + "\n", { encoding: "utf8", flag: "a" });
  return receipt;
}

async function main(argv) {
  const [command, ...args] = argv;
  const get = (flag) => { const i = args.indexOf(flag); return i < 0 ? undefined : args[i + 1]; };
  const filePath = path.resolve(get("--file") ?? DEFAULT_FILE);
  if (command === "verify") {
    const result = await verifyReceiptFile(filePath);
    console.log(result.valid ? `VALID · ${result.count} entries` : `BROKEN · first broken entry: ${result.brokenAt} (${result.error})`);
    if (!result.valid) process.exitCode = 1;
    return;
  }
  if (command === "append") {
    const amount = Number(get("--amount"));
    const recipient = get("--recipient");
    const reason = get("--reason");
    if (!Number.isFinite(amount) || !recipient || reason === undefined) throw new Error('Usage: receipts:append -- --amount 10 --recipient Alex --reason "purpose" [--file path]');
    const receipt = await appendFileReceipt({ amount, recipient, reason, filePath });
    console.log(`${receipt.decision.toUpperCase()} · ${receipt.execution} · receipt #${receipt.index} · ${receipt.hash}`);
    return;
  }
  console.log("Rails Desk receipt log\n  node scripts/receipts.mjs verify [--file path]\n  node scripts/receipts.mjs append --amount 10 --recipient Alex --reason \"purpose\" [--file path]");
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
