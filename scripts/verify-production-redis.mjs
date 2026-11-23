const base = (process.env.RAILS_DESK_URL || "https://rails-desk.vercel.app").replace(/\\/$/, "");
async function request(path, init = {}) {
  const response = await fetch(base + path, { ...init, cache: "no-store", headers: { "content-type": "application/json", ...(init.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((init.method || "GET") + " " + path + " returned " + response.status + ": " + JSON.stringify(body));
  return { response, body };
}

const created = await request("/api/v1/desks", { method: "POST", body: JSON.stringify({ name: "Production Redis smoke test" }) });
const ownerKey = created.body.ownerKey;
const agentKey = created.body.agentKey;
const cookie = created.response.headers.get("set-cookie")?.split(";")[0];
if (!agentKey || (!ownerKey && !cookie)) throw new Error("Desk creation did not return an agent key and owner session.");
const ownerHeaders = cookie ? { cookie } : { authorization: "Bearer " + ownerKey };

const proposal = await request("/api/v1/proposals", {
  method: "POST",
  headers: { authorization: "Bearer " + agentKey },
  body: JSON.stringify({ amount: 15, recipient: "Jordan", reason: "Automated production Redis persistence check", agent: "production-smoke-test" }),
});
if (proposal.body.status !== "needs_review" || !proposal.body.receipt_id) throw new Error("Expected a pending-review proposal with a receipt.");

for (let read = 1; read <= 2; read++) {
  const result = await request("/api/v1/desk", { headers: ownerHeaders });
  const desk = result.body;
  if (desk.storage !== "redis") throw new Error("Production reports storage=" + desk.storage + ", not redis.");
  if (!desk.verification?.valid) throw new Error("Production receipt chain did not verify.");
  const receipt = desk.receipts?.find((item) => item.id === proposal.body.receipt_id);
  if (!receipt) throw new Error("Receipt " + proposal.body.receipt_id + " was missing on fresh read #" + read + ".");
  const item = desk.proposals?.find((entry) => entry.id === proposal.body.id);
  if (!item || item.status !== "needs_review" || item.review) throw new Error("Synthetic proposal was not left pending review.");
  process.stdout.write("Fresh read #" + read + ": storage=redis, receipt=" + receipt.id + ", chain=valid, status=needs_review\n");
}
process.stdout.write("PASS: production Redis receipt persistence verified. No approval or funds movement occurred.\n");
