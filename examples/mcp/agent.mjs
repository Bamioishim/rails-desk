#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const base = process.env.RAILS_DESK_URL;
const key = process.env.RAILS_DESK_AGENT_KEY;
if (!base || !key) {
  console.error("Set RAILS_DESK_URL and RAILS_DESK_AGENT_KEY.");
  process.exit(1);
}

const serverPath = fileURLToPath(new URL("../../public/rails-desk-mcp.mjs", import.meta.url));
const child = spawn(process.execPath, [serverPath], {
  env: { ...process.env, RAILS_DESK_URL: base, RAILS_DESK_AGENT_KEY: key },
  stdio: ["pipe", "pipe", "inherit"],
});
const lines = createInterface({ input: child.stdout });
let nextId = 1;
const pending = new Map();

lines.on("line", (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message || "MCP request failed"));
    else if (message.result?.isError) reject(new Error(message.result.content?.[0]?.text || "MCP tool failed"));
    else resolve(message.result);
  }
});

function request(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`MCP request timed out: ${method}`));
    }, 15000);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timeout); resolve(value); },
      reject: (error) => { clearTimeout(timeout); reject(error); },
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

function toolText(result) {
  const raw = result.content?.find((part) => part.type === "text")?.text;
  if (!raw) throw new Error("MCP tool returned no text content.");
  return JSON.parse(raw);
}

try {
  await request("initialize", { protocolVersion: "2025-06-18", capabilities: {} });
  const listed = await request("tools/list");
  console.log("Available Rails Desk tools:", listed.tools.map((tool) => tool.name).join(", "));

  const proposed = toolText(await request("tools/call", {
    name: "propose_payment",
    arguments: { amount: 15, recipient: "Jordan", reason: "MCP example test invoice" },
  }));
  console.log("Proposal:", JSON.stringify(proposed, null, 2));
  if (!proposed.id) throw new Error("Proposal response did not include an id.");

  const deadline = Date.now() + 120000;
  let current = proposed;
  while (current.awaiting_review && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    current = toolText(await request("tools/call", {
      name: "get_proposal",
      arguments: { id: proposed.id },
    }));
    console.log("Current status:", current.final_status || current.status);
  }
  console.log("Final proposal state:", JSON.stringify(current, null, 2));
  if (current.awaiting_review) {
    console.log("Still awaiting owner review. Open the Rails Desk Receipts page to approve or refuse it.");
  } else {
    console.log("Owner review is complete. This is a recorded decision, not a blockchain settlement.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  child.kill();
  lines.close();
}
