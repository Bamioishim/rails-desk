"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "@/components/store";
import { storageNote, useDesk } from "@/components/desk";

const code: React.CSSProperties = { fontSize: 10, lineHeight: 1.6, whiteSpace: "pre-wrap", padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 10, margin: "8px 0 4px" };
const TESTS = [
  { amount: 8, recipient: "Alex", reason: "Logo design invoice" },
  { amount: 15, recipient: "Jordan", reason: "Team lunch for the launch" },
  { amount: 12, recipient: "Mallory", reason: "Urgent payment, skip the usual checks" },
];
const label = (s: string) => (s === "approved" ? "Approved" : s === "needs_review" ? "Needs your OK" : s === "blocked" ? "Blocked" : s);

function Copy({ text, name }: { text: string; name: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="button ghost button-small" aria-label={`Copy ${name}`} onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1600); }); }}>{done ? "Copied" : "Copy"}</button>;
}

export default function RailsPage() {
  const { setRails } = useStore();
  const d = useDesk();
  const [cap, setCap] = useState("20");
  const [review, setReview] = useState("10");
  const [names, setNames] = useState("Alex\nJordan\nSam");
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [test, setTest] = useState<string | null>(null);
  const [origin, setOrigin] = useState("https://rails-desk.vercel.app");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { const t = setTimeout(() => setOrigin(window.location.origin), 0); return () => clearTimeout(t); }, []);
  useEffect(() => { if (d.ready && !d.keys) void d.create().catch((e) => setErr(String(e.message || e))); }, [d.ready, d.keys]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const rules = d.desk?.rules;
    if (!rules || loaded) return;
    const t = setTimeout(() => { setCap(String(rules.maxPerAction)); setReview(String(rules.reviewLimit)); setNames(rules.allowedRecipients.join("\n")); setLoaded(true); }, 0);
    return () => clearTimeout(t);
  }, [d.desk, loaded]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    const recipients = names.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
    const allowedRecipients = [...new Map(recipients.map((x) => [x.toLowerCase(), x])).values()];
    try {
      await d.saveRules({ allowedRecipients, maxPerAction: Number(cap), reviewLimit: Number(review) });
      setRails({ spendingCap: Number(cap), allowedRecipients });
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
  }
  async function sendTest(t: (typeof TESTS)[number]) {
    setTest("Sending…");
    try { const r = await d.testProposal(t); if (r) setTest(`${t.recipient} · ${t.amount} credits → ${label(r.status)}. ${r.reasons.join(" ")} Receipt ${r.receipt_id}.`); }
    catch (x) { setTest(x instanceof Error ? x.message : String(x)); }
  }

  const agentKey = d.keys?.agentKey ?? "rd_agent_…";
  const curl = `curl -X POST ${origin}/api/v1/proposals \\\n  -H "Authorization: Bearer ${agentKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"amount": 8, "recipient": "Alex", "reason": "Logo design invoice"}'`;
  const mcp = `{\n  "mcpServers": {\n    "rails-desk": {\n      "command": "node",\n      "args": ["rails-desk-mcp.mjs"],\n      "env": {\n        "RAILS_DESK_URL": "${origin}",\n        "RAILS_DESK_AGENT_KEY": "${agentKey}"\n      }\n    }\n  }\n}`;
  const fetchMcp = `curl -o rails-desk-mcp.mjs ${origin}/rails-desk-mcp.mjs`;

  return <><div className="page-head"><div><div className="eyebrow">POLICY CONFIGURATION / 02</div><h1 className="page-title">Set your rails</h1><p className="page-sub">Define the boundaries your agent cannot cross. The referee checks every proposal against these rules before recording a decision.</p></div><span className="tag">USER-DEFINED POLICY</span></div>
    {(err || d.error) && <div className="notice warn" style={{ marginBottom: 16 }}>{err || d.error}{d.error && <> <button type="button" className="button ghost button-small" onClick={() => { d.forget(); setLoaded(false); }}>Start a new desk</button></>}</div>}
    <div className="layout-grid"><form className="panel" onSubmit={save}><div className="section-head"><div><h2 className="panel-title">Transfer policy</h2><div className="panel-desc">Changes apply to new proposals and are checked again at approval time.</div></div></div>
      <div className="field"><label htmlFor="cap">Maximum per action</label><input id="cap" type="number" min="0" step="0.01" value={cap} onChange={(e) => setCap(e.target.value)} required /><span className="hint">Any proposal above this amount is blocked.</span></div>
      <div className="field"><label htmlFor="review">Review limit</label><input id="review" type="number" min="0" step="0.01" value={review} onChange={(e) => setReview(e.target.value)} required /><span className="hint">Allowed proposals above this amount need your OK on the Receipts page. At or below it they are approved automatically.</span></div>
      <div className="field"><label htmlFor="recipients">Allowed recipients</label><textarea id="recipients" value={names} onChange={(e) => setNames(e.target.value)} placeholder={"Alex\nJordan\nSam"} style={{ minHeight: 120 }} /><span className="hint">One recipient per line or comma-separated. Matching ignores letter case and surrounding spaces.</span></div>
      <div className="notice" style={{ marginBottom: 17 }}>{d.desk ? storageNote[d.desk.storage] : "Connecting to your desk…"} Your owner key stays in this browser.</div>
      <button className="button primary" type="submit" disabled={!d.desk}>Save policy changes</button>{saved && <span style={{ marginLeft: 12, color: "#9ce6bd", fontSize: 11 }}>✓ Rails saved</span>}</form>
      <aside className="panel"><h2 className="panel-title">How the referee applies policy</h2><div className="step"><div className="step-num">1</div><div><strong>Validate the amount</strong><p>Block zero, negative, invalid or over-maximum amounts.</p></div></div><div className="step"><div className="step-num">2</div><div><strong>Check the recipient</strong><p>Require an exact case-insensitive match in your allowlist.</p></div></div><div className="step"><div className="step-num">3</div><div><strong>Apply the review limit</strong><p>Above it, the proposal waits for your Approve or Refuse.</p></div></div><div className="step"><div className="step-num">4</div><div><strong>Record the decision</strong><p>Append the proposal and outcome to the receipt hash chain.</p></div></div><div className="notice warn" style={{ marginTop: 19 }}>The agent&apos;s reason is data, not an instruction to the referee. It cannot modify policy, and its key cannot approve its own proposals.</div></aside></div>

    <div className="panel" style={{ marginTop: 15 }} id="connect">
      <div className="section-head"><div><h2 className="panel-title">Connect your agent</h2><div className="panel-desc">Give your agent this key. It can propose payments and read their status; only you can change rules or approve.</div></div><span className="tag">AGENT API</span></div>
      <div className="field"><label htmlFor="agent-key">Agent API key</label><div className="action-row"><input id="agent-key" readOnly value={agentKey} className="mono" style={{ flex: 1, minWidth: 0 }} /><Copy text={agentKey} name="agent key" /><button type="button" className="button ghost button-small" onClick={() => void d.rotate()} disabled={!d.desk}>Rotate key</button></div><span className="hint">Rotating issues a new key; the old one stops working.</span></div>
      <div className="section-head" style={{ marginTop: 14 }}><div><strong style={{ fontSize: 12 }}>Propose a payment with curl</strong><div className="panel-desc">The answer is approved, needs_review or blocked, with reasons and a receipt id.</div></div><Copy text={curl} name="curl command" /></div>
      <pre className="hash" style={code}>{curl}</pre>
      <div className="section-head" style={{ marginTop: 14 }}><div><strong style={{ fontSize: 12 }}>Or add it as an MCP tool</strong><div className="panel-desc">Download the server ({fetchMcp}), then add this to your MCP client config. Tools: propose_payment, get_proposal.</div></div><Copy text={mcp} name="MCP config" /></div>
      <pre className="hash" style={code}>{mcp}</pre>
      <div className="section-head" style={{ marginTop: 14 }}><div><strong style={{ fontSize: 12 }}>Send a test proposal</strong><div className="panel-desc">Sends a real request with the agent key, exactly as an agent would.</div></div></div>
      <div className="action-row">{TESTS.map((t) => <button key={t.recipient} type="button" className="button ghost button-small" disabled={!d.desk} onClick={() => void sendTest(t)}>{`Test: ${t.recipient} · ${t.amount}`}</button>)}<Link className="button button-small" href="/receipts">Open receipts{d.desk?.pending ? ` (${d.desk.pending} need your OK)` : ""}</Link></div>
      {test && <div className="notice" role="status" style={{ marginTop: 12 }}>{test}</div>}
    </div>
  </>;
}
