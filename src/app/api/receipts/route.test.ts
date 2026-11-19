import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { GET, POST } from "./route";

const execFileAsync = promisify(execFile);
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

function request(body: unknown) {
  return new Request("http://localhost/api/receipts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("receipt API uses the same append-only file verifier", () => {
  it("writes an approved mock decision and GET reads the verified file chain", async () => {
    const response = await POST(request({
      proposal: { amount: 10, recipient: "Alex", reason: "Local test approval" },
      decision: "approved",
      decisionReason: "Approved after review.",
      rails,
    }));
    expect(response.status).toBe(201);
    const written = await response.json();
    expect(written.receipt).toMatchObject({ amount: 10, recipient: "Alex", decision: "approved", execution: "executed (mock)" });

    const read = await GET();
    const state = await read.json();
    expect(state.verification).toMatchObject({ valid: true, count: 1 });
    expect(state.receipts).toHaveLength(1);
    expect(state.receipts[0].hash).toBe(written.receipt.hash);
    const cli = await execFileAsync(process.execPath, [path.resolve("scripts/receipts.mjs"), "verify", "--file", process.env.RAILS_DESK_RECEIPTS_FILE!]);
    expect(cli.stdout.trim()).toBe("VALID · 1 entries");
  });

  it("enforces the cap and recipient allowlist on the server before mock execution", async () => {
    for (const proposal of [
      { amount: 21, recipient: "Alex", reason: "Over cap" },
      { amount: 10, recipient: "Mallory", reason: "Unknown recipient" },
    ]) {
      const response = await POST(request({ proposal, decision: "approved", rails }));
      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.receipt).toMatchObject({ decision: "refused", execution: "not executed" });
    }
    const state = await (await GET()).json();
    expect(state.verification).toMatchObject({ valid: true, count: 2 });
    expect(state.receipts.map((row: { decision: string }) => row.decision)).toEqual(["refused", "refused"]);
  });

  it("records an explicit user refusal in the same file chain", async () => {
    const response = await POST(request({
      proposal: { amount: 5, recipient: "Alex", reason: "Optional purchase" },
      decision: "refused",
      decisionReason: "User declined after review.",
      rails,
    }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.receipt).toMatchObject({ decision: "refused", decisionReason: "User declined after review.", execution: "not executed" });
    const state = await (await GET()).json();
    expect(state.verification).toMatchObject({ valid: true, count: 1 });
    expect(state.receipts[0].hash).toBe(body.receipt.hash);
  });

  it("records cancellation before execution in the same verified chain", async () => {
    const response = await POST(request({
      proposal: { amount: 5, recipient: "Sam", reason: "Cancel test" },
      decision: "cancelled",
      decisionReason: "Cancelled before mock execution.",
      rails,
    }));
    const body = await response.json();
    expect(body.receipt).toMatchObject({ decision: "cancelled", execution: "not executed" });
    expect(body.verification).toMatchObject({ valid: true, count: 1 });
  });
});
