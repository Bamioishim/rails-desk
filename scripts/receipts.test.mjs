import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { appendFileReceipt, verifyReceiptFile } from "./receipts.mjs";

describe("append-only receipt file", () => {
  it("appends ordered mock receipts and verifies the complete chain", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "rails-desk-"));
    const file = path.join(dir, "receipts.jsonl");
    try {
      const one = await appendFileReceipt({ amount: 10, recipient: "Alex", reason: "invoice", filePath: file });
      const two = await appendFileReceipt({ amount: 25, recipient: "Alex", reason: "over cap", filePath: file });
      expect(one.execution).toBe("executed (mock)");
      expect(two.decision).toBe("refused");
      expect(two.execution).toBe("not executed");
      expect(two.previousHash).toBe(one.hash);
      expect(await verifyReceiptFile(file)).toEqual({ valid: true, brokenAt: null, count: 2 });
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it("identifies the first tampered entry and refuses further appends", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "rails-desk-"));
    const file = path.join(dir, "receipts.jsonl");
    try {
      await appendFileReceipt({ amount: 10, recipient: "Alex", reason: "one", filePath: file });
      await appendFileReceipt({ amount: 5, recipient: "Sam", reason: "two", filePath: file ¶»§q«^