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

export async function appendFileReceipt({ amount, recipient, reason, filePath = DEFAULT_FI¶»§q«^