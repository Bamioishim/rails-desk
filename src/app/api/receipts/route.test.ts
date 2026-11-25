import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GET, POST } from "./route";
import { appendFileReceipt } from "../../../lib/file-receipts.mjs";

const rails = { spendingCap: 20, allowedRecipients: ["Alex", "Jordan", "Sam"] };
let tempDir = "";
let previousPath: string | undefined;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "rails-desk-route-"));
  previousPath = process.env.RAILS_DESK_RECEIPTS_FILE;
  process.env.RAILS_DESK_RECEIPTS_FILE = path.join(tempDir, "receipts.jsonl");
});

afterEach(async () => {
  if (previousPath === undefined) delete process.env.RAILS_DESK_RECEIPTS_FILE;
  else process.env.RAILS_DESK_RECEIPTS_FILE = previousPath;
  await rm(tempDir, { recursive: true, force: true });
});

describe("legacy receipt API is read-only", () => {
  it("returns an empty verified history when no file exists", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      receipts: [],
      verification: { valid: true, brokenAt: null, count: 0 },
    });
  });

  it("continues to return existing file-backed history and its verification", async () => {
    const filePath = process.env.RAILS_DESK_RECEIPTS_FILE!;
    const written = await appendFileReceipt({
      amount: 10,
      recipient: "Alex",
      reason: "Historical demo fixture",
      decision: "approved",
      decisionReason: "Approved in the earlier demo flow.",
      rails,
      filePath,
    });

    const response = await GET();
    expect(response.status).toBe(200);
    const state = await response.json();
    expect(state.receipts).toHaveLength(1);
    expect(state.receipts[0]).toMatchObject({
      hash: written.hash,
      decision: "approved",
      execution: "executed (mock)",
    });
    expect(state.verification).toMatchObject({ valid: true, count: 1 });
  });

  it("rejects POST with 405 and leaves the file-backed history unchanged", async () => {
    const response = await POST();
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      error: "The legacy file-backed receipt endpoint is read-only.",
    });

    const read = await GET();
    const state = await read.json();
    expect(state.receipts).toEqual([]);
    expect(state.verification).toMatchObject({ valid: true, count: 0 });
  });
});
