import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { POST as createDesk } from "../desks/route";
import { GET as readDesk, PUT as updateDesk } from "../desk/route";
import { POST as proposePayment } from "../proposals/route";
import { GET as readProposal } from "../proposals/[id]/route";
import { POST as decideProposal } from "../proposals/[id]/decision/route";

const ENV_KEYS = [
  "RAILS_DESK_DATA_DIR",
  "RAILS_DESK_RATE_LIMIT",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "VERCEL",
];

let tempDir = "";
let previousEnv: Map<string, string | undefined>;

function jsonRequest(pathname: string, method: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://rails-desk.test${pathname}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("Rails Desk API approval flow", () => {
  beforeEach(async () => {
    previousEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
    tempDir = await mkdtemp(path.join(os.tmpdir(), "rails-desk-api-flow-"));
    process.env.RAILS_DESK_DATA_DIR = tempDir;
    process.env.RAILS_DESK_RATE_LIMIT = "off";
    for (const key of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "VERCEL"]) {
      delete process.env[key];
    }
  });

  afterEach(async () => {
    for (const [key, value] of previousEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  it("runs agent proposal → policy review → owner approval → verified receipt through the API routes", async () => {
    const created = await createDesk(jsonRequest("/api/v1/desks", "POST", { name: "API flow test" }));
    expect(created.status).toBe(201);
    const createdBody = await created.json() as { desk: { id: string }; agentKey: string };
    expect(createdBody.agentKey).toMatch(/^rd_agent_/);
    expect(createdBody.desk.id).toBeTruthy();

    const setCookie = created.headers.get("set-cookie");
    expect(setCookie).toContain("rails_desk_owner=");
    const ownerCookie = setCookie!.split(";")[0];

    const rules = {
      allowedRecipients: ["Alex", "Jordan"],
      maxPerAction: 50,
      reviewLimit: 10,
      dailySpendCap: 100,
    };
    const savedRules = await updateDesk(
      jsonRequest("/api/v1/desk", "PUT", { rules }, { Cookie: ownerCookie }),
    );
    expect(savedRules.status).toBe(200);
    expect((await savedRules.json()).rules).toMatchObject(rules);

    const proposed = await proposePayment(
      jsonRequest("/api/v1/proposals", "POST", {
        amount: 15,
        recipient: "Jordan",
        reason: "API integration approval test",
        agent: "integration-test-agent",
      }, { Authorization: `Bearer ${createdBody.agentKey}` }),
    );
    expect(proposed.status).toBe(201);
    const proposal = await proposed.json();
    expect(proposal).toMatchObject({
      status: "needs_review",
      awaiting_review: true,
      recipient: "Jordan",
      amount: 15,
    });
    expect(proposal.receipt_id).toMatch(/^rcpt_/);

    const pending = await readProposal(
      new Request(`http://rails-desk.test/api/v1/proposals/${proposal.id}`, {
        headers: { Authorization: `Bearer ${createdBody.agentKey}` },
      }),
      { params: Promise.resolve({ id: proposal.id }) },
    );
    expect(pending.status).toBe(200);
    expect((await pending.json()).awaiting_review).toBe(true);

    const agentApproval = await decideProposal(
      jsonRequest(`/api/v1/proposals/${proposal.id}/decision`, "POST", { decision: "approve" }, {
        Authorization: `Bearer ${createdBody.agentKey}`,
      }),
      { params: Promise.resolve({ id: proposal.id }) },
    );
    expect(agentApproval.status).toBe(403);

    const ownerApproval = await decideProposal(
      jsonRequest(`/api/v1/proposals/${proposal.id}/decision`, "POST", {
        decision: "approve",
        note: "Reviewed by the owner in the API integration test.",
      }, { Cookie: ownerCookie }),
      { params: Promise.resolve({ id: proposal.id }) },
    );
    expect(ownerApproval.status).toBe(200);
    expect(await ownerApproval.json()).toMatchObject({
      id: proposal.id,
      final_status: "approved",
      awaiting_review: false,
      review: { decision: "approved" },
    });

    const finalProposal = await readProposal(
      new Request(`http://rails-desk.test/api/v1/proposals/${proposal.id}`, {
        headers: { Authorization: `Bearer ${createdBody.agentKey}` },
      }),
      { params: Promise.resolve({ id: proposal.id }) },
    );
    expect((await finalProposal.json()).final_status).toBe("approved");

    const deskResponse = await readDesk(
      new Request("http://rails-desk.test/api/v1/desk", { headers: { Cookie: ownerCookie } }),
    );
    expect(deskResponse.status).toBe(200);
    const desk = await deskResponse.json();
    expect(desk.receipts.map((receipt: { outcome: string }) => receipt.outcome)).toEqual(["needs_review", "approved"]);
    expect(desk.verification).toMatchObject({ valid: true, brokenAt: null });
  });
});
