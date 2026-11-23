import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer, type Server } from "node:http";
import { createInterface, type Interface } from "node:readline";
import { afterEach, describe, expect, it } from "vitest";

let child: ChildProcessWithoutNullStreams | undefined;
let lines: Interface | undefined;
let server: Server | undefined;

function rpc(id: number, method: string, params: unknown = {}) {
  const process = child;
  const reader = lines;
  if (!process || !reader) throw new Error("MCP process is not running.");
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeout = setTimeout(() => { reader.off("line", onLine); reject(new Error(`MCP request ${id} timed out`)); }, 3000);
    const onLine = (line: string) => {
      try {
        const message = JSON.parse(line) as Record<string, unknown>;
        if (message.id !== id) return;
        clearTimeout(timeout);
        lines?.off("line", onLine);
        resolve(message);
      } catch { /* ignore non-JSON output */ }
    };
    reader.on("line", onLine);
    process.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

afterEach(async () => {
  child?.kill();
  lines?.close();
  if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
  child = undefined; lines = undefined; server = undefined;
});

describe("Rails Desk MCP stdio integration", () => {
  it("lists tools and forwards agent proposals and status reads to the authenticated API", async () => {
    const calls: { method: string; url?: string; authorization?: string; body?: unknown }[] = [];
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => { raw += chunk; });
      req.on("end", () => {
        const body = raw ? JSON.parse(raw) : undefined;
        calls.push({ method: req.method || "", url: req.url, authorization: req.headers.authorization, body });
        res.setHeader("Content-Type", "application/json");
        if (req.method === "POST" && req.url === "/api/v1/proposals") {
          res.statusCode = 201;
          res.end(JSON.stringify({ id: "prop_test123", status: "needs_review", receipt_id: "rcpt_test123" }));
        } else if (req.method === "GET" && req.url === "/api/v1/proposals/prop_test123") {
          res.end(JSON.stringify({ id: "prop_test123", status: "needs_review", awaiting_review: true }));
        } else {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: "Not found" }));
        }
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Could not start mock API.");
    child = spawn(process.execPath, ["public/rails-desk-mcp.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, RAILS_DESK_URL: `http://127.0.0.1:${address.port}`, RAILS_DESK_AGENT_KEY: "rd_agent_12345678_test_secret_1234567890" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    lines = createInterface({ input: child.stdout });

    const initialized = await rpc(1, "initialize", { protocolVersion: "2025-06-18" });
    expect(initialized.result).toMatchObject({ serverInfo: { name: "rails-desk", version: "1.0.0" } });

    const listed = await rpc(2, "tools/list");
    const tools = (listed.result as { tools: { name: string }[] }).tools;
    expect(tools.map((tool) => tool.name)).toEqual(["propose_payment", "get_proposal"]);

    const proposed = await rpc(3, "tools/call", { name: "propose_payment", arguments: { amount: 15, recipient: "Jordan", reason: "Team lunch" } });
    const proposalText = (proposed.result as { content: { text: string }[] }).content[0].text;
    expect(JSON.parse(proposalText)).toMatchObject({ id: "prop_test123", status: "needs_review" });

    const read = await rpc(4, "tools/call", { name: "get_proposal", arguments: { id: "prop_test123" } });
    const readText = (read.result as { content: { text: string }[] }).content[0].text;
    expect(JSON.parse(readText)).toMatchObject({ awaiting_review: true });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "/api/v1/proposals",
      authorization: "Bearer rd_agent_12345678_test_secret_1234567890",
      body: { amount: 15, recipient: "Jordan", reason: "Team lunch", agent: "mcp" },
    });
    expect(calls[1]).toMatchObject({ method: "GET", url: "/api/v1/proposals/prop_test123" });
  });
});
