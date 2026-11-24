#!/usr/bin/env node
// Rails Desk MCP server (stdio, no dependencies). Gives an agent two tools:
//   propose_payment { amount, recipient, reason }  -> approved | needs_review | blocked
//   get_proposal    { id }                          -> current status (e.g. after you review it)
// Env: RAILS_DESK_URL (e.g. https://rails-desk.vercel.app), RAILS_DESK_AGENT_KEY (rd_agent_...).
import { createInterface } from "node:readline";

const BASE = (process.env.RAILS_DESK_URL || "").replace(/\/$/, "");
const KEY = process.env.RAILS_DESK_AGENT_KEY || "";
const tools = [
  { name: "propose_payment", description: "Propose a payment to the Rails Desk referee. It returns approved, needs_review (a person must OK it) or blocked, with reasons and a receipt id. Approved means policy approval only, not payment settlement; only the owner can initiate a testnet transfer. Never treat needs_review or blocked as paid.", inputSchema: { type: "object", properties: { amount: { type: "number", description: "Amount in credits" }, recipient: { type: "string" }, reason: { type: "string", description: "Why the payment is needed" } }, required: ["amount", "recipient", "reason"] } },
  { name: "get_proposal", description: "Read a proposal's current status, e.g. whether a needs_review payment was approved or refused.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
];

async function call(name, args) {
  if (!BASE || !KEY) throw new Error("Set RAILS_DESK_URL and RAILS_DESK_AGENT_KEY.");
  const res = name === "propose_payment"
    ? await fetch(`${BASE}/api/v1/proposals`, { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...args, agent: "mcp" }) })
    : await fetch(`${BASE}/api/v1/proposals/${encodeURIComponent(args.id)}`, { headers: { Authorization: `Bearer ${KEY}` } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
createInterface({ input: process.stdin }).on("line", async (line) => {
  let msg; try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;
  if (id === undefined) return; // notifications
  try {
    if (method === "initialize") return send({ id, result: { protocolVersion: params?.protocolVersion || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "rails-desk", version: "1.0.0" } } });
    if (method === "ping") return send({ id, result: {} });
    if (method === "tools/list") return send({ id, result: { tools } });
    if (method === "tools/call") {
      try { const out = await call(params.name, params.arguments || {}); return send({ id, result: { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] } }); }
      catch (e) { return send({ id, result: { isError: true, content: [{ type: "text", text: String(e.message || e) }] } }); }
    }
    send({ id, error: { code: -32601, message: `Unknown method ${method}` } });
  } catch (e) { send({ id, error: { code: -32603, message: String(e) } }); }
});
