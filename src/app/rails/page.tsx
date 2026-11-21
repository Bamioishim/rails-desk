"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "@/components/store";
import { useDesk } from "@/components/desk";

const code: React.CSSProperties = { fontSize: 10, lineHeight: 1.6, whiteSpace: "pre-wrap", padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 10, margin: "8px 0 4px" };
const label = (s: string) => (s === "approved" ? "Approved" : s === "needs_review" ? "Needs your approval" : s === "blocked" ? "Blocked" : s === "refused" ? "Refused" : s);
const decisionMessage = (recipient: string, status: string, reasons: string[] = []) => {
  if (status === "approved") return `${recipient} approved. Within your limits.`;
  if (status === "needs_review") return `${recipient} needs your approval. Above your review limit.`;
  const reason = reasons.find((x) => !x.startsWith("Not reached")) || "This proposal did not meet your rules.";
  return `${recipient} blocked. ${reason}`;
};
const decisionClass = (status: string) => status === "approved" ? "tag green" : status === "needs_review" ? "tag neutral" : "tag red";

function Copy({ text, name }: { text: string; name: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="button ghost button-small" aria-label={`Copy ${name}`} onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1600); }); }}>{done ? "Copied" : "Copy"}</button>;
}

export default function RailsPage() {
  const { setRails } = useStore();
  const d = useDesk(4000);
  const [cap, setCap] = useState("20");
  const [review, setReview] = useState("10");
  const [names, setNames] = useState("Alex\nJordan\nSam");
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [test, setTest] = useState<string | null>(null);
  const [proposalRecipient, setProposalRecipient] = useState("Alex");
  const [proposalAmount, setProposalAmount] = useState("8");
  const [proposalReason, setProposalReason] = useState("Invoice payment");
  const [submitting, setSubmitting] = useState(false);
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
  async function submitProposal(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setTest(null);
    try {
      const r = await d.submitProposal({ recipient: proposalRecipient.trim(), amount: Number(proposalAmount), reason: proposalReason.trim() });
      if (r) setTest(decisionMessage(proposalRecipient, r.status, r.reasons));
      await d.refresh();
    } catch (x) { setTest(x instanceof Error ? x.message : String(x)); }
    finally { setSubmitting(false); }
  }


  const agentKey = d.keys?.agentKey ?? "rd_agent_…";
  const curl = `curl -X POST ${origin}/api/v1/proposals \\\n  -H "Authorization: Bearer ${agentKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"amount": 8, "recipient": "Alex", "reason": "Logo design invoice"}'`;
  const mcp = `{\n  "mcpServers": {\n    "rails-desk": {\n      "command": "node",\n      "args": ["rails-desk-mcp.mjs"],\n      "env": {\n        "RAILS_DESK_URL": "${origin}",\n        "RAILS_DESK_AGENT_KEY": "${agentKey}"\n      }\n    }\n  }\n}`;
  const fetchMcp = `curl -o rails-desk-mcp.mjs ${origin}/rails-desk-mcp.mjs`;

  return <><div className="page-head"><div><div className="eyebrow">POLICY CONFIGURATION</div><h1 className="page-title">Set your rails</h1><p className="page-sub">Define the boundaries your agent cannot cross. The referee checks every proposal against these rules before recording a decision.</p></div><span className="tag">USER-DEFINED POLICY</span></div>
    {(err || d.error) && <div className="notice warn" style={{ marginBottom: 16 }}>{err || d.error}{d.error && <> <button type="button" className="button ghost button-small" onClick={() => { d.forget(); setLoaded(false); }}>Start a new desk</button></>}</div>}
    <section className="panel" style={{ marginBottom: 15 }} id="new-proposal">
      <div className="section-head"><div><h2 className="panel-title">Submit a payment proposal</h2><div className="panel-desc">This sends a real proposal to Rails Desk. Your rules decide whether it is approved, blocked, or sent to you for review. No funds are transferred.</div></div><span className="tag">LIVE PROPOSAL</span></div>
      <form onSubmit={submitProposal}>
        <div className="layout-grid">
          <div className="field"><label htmlFor="proposal-recipient">Recipient</label><input id="proposal-recipient" value={proposalRecipient} onChange={(e) => setProposalRecipient(e.target.value)} placeholder="Who should receive it?" required /></div>
          <div className="field"><label htmlFor="proposal-amount">Amount (credits)</label><input id="proposal-amount" type="number" min="0.01" step="0.01" value={proposalAmount} onChange={(e) => setProposalAmount(e.target.value)} required /></div>
        </div>
        <div className="field"><label htmlFor="proposal-reason">Payment context</label><input id="proposal-reason" value={proposalReason} onChange={(e) => setProposalReason(e.target.value)} placeholder="What is this payment for?" /></div>
        <div className="action-row"><button className="button primary" type="submit" disabled={!d.desk || submitting || !proposalRecipient.trim() || !(Number(proposalAmount) > 0)}>{submitting ? "Checking proposal…" : "Submit proposal"}</button><Link className="button button-small" href="/receipts">Open review & receipts</Link></div>
        {test && <div className={`notice ${test.startsWith(proposalRecipient + " blocked") ? "warn" : ""}`} role="status" style={{ marginTop: 12 }}>{test}</div>}
      </form>
    </section>

    <div className="layout-grid"><form className="panel" onSubmit={save}><div className="section-head"><div><h2 className="panel-title">Transfer policy</h2><div className="panel-desc">Changes apply to new proposals and are checked again at approval time.</div></div></div>
      <div className="field"><label htmlFor="cap">Maximum per action</label><input id="cap" type="number" min="0" step="0.01" value={cap} onChange={(e) => setCap(e.target.value)} required /><span className="hint">Any proposal above this amount is blocked.</span></div>
      <div className="field"><label htmlFor="review">Review limit</label><input id="review" type="number" min="0" step="0.01" value={review} onChange={(e) => setReview(e.target.value)} required /><span className="hint">Allowed proposals above this amount need your OK on the Receipts page. At or below it they are approved automatically.</span></div>
      <div className="field"><label htmlFor="recipients">Allowed recipients</label><textarea id="recipients" value={names} onChange={(e) => setNames(e.target.value)} placeholder={"Alex\nJordan\nSam"} style={{ minHeight: 120 }} /><span className="hint">One recipient per line or comma-separated. Matching ignores letter case and surrounding spaces.</span></div>
      
      <button className="button primary" type="submit" disabled={!d.desk}>Save policy changes</button>{saved && <span style={{ marginLeft: 12, color: "var(--green)", fontSize: 12 }}>✓ Rails saved</span>}</form>
      <aside className="panel"><h2 className="panel-title">How the referee applies policy</h2><div className="step"><div className="step-num">1</div><div><strong>Validate the amount</strong><p>Block zero, negative, invalid or over-maximum amounts.</p></div></div><div className="step"><div className="step-num">2</div><div><strong>Check the recipient</strong><p>Require an exact case-insensitive match in your allowlist.</p></div></div><div className="step"><div className="step-num">3</div><div><strong>Apply the review limit</strong><p>Above it, the proposal waits for your Approve or Refuse.</p></div></div><div className="step"><div className="step-num">4</div><div><strong>Record the decision</strong><p>Append the proposal and outcome to the receipt hash chain.</p></div></div></aside></div>

    <div className="panel" style={{ marginTop: 15 }} id="connect">
      <div className="section-head"><div><h2 className="panel-title">Connect your agent</h2><div className="panel-desc">Give your agent this key. It can propose payments and read their status; only you can change rules or approve.</div></div><span className="tag">AGENT API</span></div>
      <div className="field"><label htmlFor="agent-key">Agent API key</label><div className="action-row"><input id="agent-key" readOnly value={agentKey} className="mono" style={{ flex: 1, minWidth: 0 }} /><Copy text={agentKey} name="agent key" /><button type="button" className="button ghost button-small" onClick={() => void d.rotate()} disabled={!d.desk}>Rotate key</button></div><span className="hint">Rotating issues a new key; the old one stops working.</span></div>
      <div className="section-head" style={{ marginTop: 14 }}><div><strong style={{ fontSize: 12 }}>Propose a payment with curl</strong><div className="panel-desc">The answer is approved, needs_review or blocked, with reasons and a receipt id.</div></div><Copy text={curl} name="curl command" /></div>
      <pre className="hash" style={code}>{curl}</pre>
      <div className="section-head" style={{ marginTop: 14 }}><div><strong style={{ fontSize: 12 }}>Or add it as an MCP tool</strong><div className="panel-desc">Download the server ({fetchMcp}), then add this to your MCP client config. Tools: propose_payment, get_proposal.</div></div><Copy text={mcp} name="MCP config" /></div>
      <pre className="hash" style={code}>{mcp}</pre>

    </div>

    <section className="panel" style={{ marginTop: 15 }} id="control-room">
      <div className="section-head"><div><div className="eyebrow">OPEN APP / CONTROL ROOM</div><h2 className="panel-title">Live activity</h2><div className="panel-desc">Server-recorded proposal decisions and demo activity. Refreshes every 4 seconds while this page is open.</div></div><span className="tag">{d.desk?.receipts.length ?? 0} EVENTS</span></div>
      {d.desk ? <>
        <div className="action-row" style={{ marginBottom: 14 }}><span className="tag">MAX {d.desk.rules.maxPerAction} CREDITS</span><span className="tag">REVIEW ABOVE {d.desk.rules.reviewLimit}</span><span className="tag">{d.desk.rules.allowedRecipients.length} ALLOWED RECIPIENTS</span><span className="tag">{d.desk.pending} PENDING REVIEW</span><Link className="button button-small" href="/receipts">View all receipts →</Link></div>
        <div className="section-head"><div><strong style={{ fontSize: 12 }}>Recent activity</strong><div className="panel-desc">The newest 12 events from your persistent receipt chain.</div></div><button type="button" className="button ghost button-small" onClick={() => void d.refresh()}>Refresh now</button></div>
        {d.desk.receipts.length === 0 ? <div className="empty">No activity yet. Connect an agent or run a demo walkthrough to see events here.</div> : <div className="receipt-list">{d.desk.receipts.slice().reverse().slice(0, 12).map((r) => <div className="receipt-row" key={r.id}><div><div className="receipt-title">{r.source === "demo" ? "Demo · " : "App · "}{r.event.replaceAll("_", " ")}</div><div className="receipt-meta">{new Date(r.at).toLocaleString()} · {r.recipient} · {r.amount} credits · {decisionMessage(r.recipient, r.outcome, [r.detail])}</div></div><span className={decisionClass(r.outcome)}>{label(r.outcome)}</span></div>)}</div>}
        <div className="section-head" style={{ marginTop: 18 }}><div><strong style={{ fontSize: 12 }}>Recent proposals</strong><div className="panel-desc">What your connected agent has submitted.</div></div></div>
        {d.desk.proposals.length === 0 ? <div className="empty">No proposals submitted yet. Submit one using the proposal form above or connect an external agent.</div> : <div className="receipt-list">{d.desk.proposals.slice().reverse().slice(0, 8).map((p) => <div className="receipt-row" key={p.id}><div><div className="receipt-title">{p.recipient} · {p.amount} credits</div><div className="receipt-meta">{new Date(p.createdAt).toLocaleString()} · {decisionMessage(p.recipient, p.review ? p.review.decision : p.status, p.reasons)}</div></div><span className={decisionClass(p.review ? p.review.decision : p.status)}>{label(p.review ? p.review.decision : p.status)}</span></div>)}</div>}
      </> : <div className="empty">Connecting to your desk and loading the control room…</div>}
    </section>
  </>;
}
