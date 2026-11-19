#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendFileReceipt, verifyReceiptFile, readReceiptFile, hashReceipt, GENESIS_HASH, DEFAULT_FILE } from "../src/lib/file-receipts.mjs";

export { appendFileReceipt, verifyReceiptFile, readReceiptFile, hashReceipt, GENESIS_HASH, DEFAULT_FILE };

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
    if (!Number.isFinite(amount) || !recipient || reason === undefined) {
      throw new Error('Usage: receipts:append -- --amount 10 --recipient Alex --reason "purpose" [--file path]');
    }
    const receipt = await appendFileReceipt({ amount, recipient, reason, filePath });
    console.log(`${receipt.decision.toUpperCase()} · ${receipt.execution} · receipt #${receipt.index} · ${receipt.hash}`);
    return;
  }
  console.log('Rails Desk receipt log\n  node scripts/receipts.mjs verify [--file path]\n  node scripts/receipts.mjs append --amount 10 --recipient Alex --reason "purpose" [--file path]');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
