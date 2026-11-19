"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Stage = "idle" | "typing" | "review" | "approved" | "refused" | "complete";
type DemoReceipt = { recipient: string; amount: number; decision: string; reason: string };

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export default function GuidedDemoPage() {
  const [recipient, setRecipient] = useState("Alex");
  const [amount, setAmount] = useState("12");
  const [reason, setReason] = useState("Monthly team expense reimbursement");
  const [stage, setStage] = useState<Stage>("idle");
  const [auto, setAuto] = useState(false);
  const [receipt, setReceipt] = useState<DemoReceipt | null>(null);
  const [note, setNote] = useState("This walkthrough runs in an isolated demo. Your configured rails and receipt history stay untouched.");
  const runId = useRef(0);

  useEffect(() => () => { runId.current += 1; }, []);

  const reset = () => {
    runId.current += 1;
    setAuto(false);
    setRecipient("Alex");
    setAmount("12");
    setReason("Monthly team expense reimbursement");
    setStage("idle");
    setReceipt(null);
    setNote("This walkthrough runs in an isolated demo. Your configured rails and receipt history stay untouched.");
  };

  const play = async () => {
    const id = ++runId.current;
    setAuto(true);
    setReceipt(null);
    setStage("typing");
    setRecipient("");
    setAmount("");
    setReason("");
    for (let i = 1; i <= "Alex".length; i++) {
      await wait(95);
      if (id !== runId.current) return;
      setRecipient("Alex".slice(0, i));
    }
    for (let i = 1; i <= "12".length; i++) {
      await wait(120);
      if (id !== runId.current) return;
      setAmount("12".slice(0, i));
    }
    const demoReason = "Monthly team expense reimbursement";
    for (let i = 1; i <= demoReason.length; i++) {
      await wait(32);
      if (id !== runId.current) return;
      setReason(demoReason.slice(0, i));
    }
    await wait(650);
    if (id !== runId.current) return;
    setStage("review");
    setNote("The referee checks the amount and exact recipient against the active demo policy. The proposal reason is treated as untrusted input.");
    await wait(1400);
    if (id !== runId.current) return;
    setStage("approved");
    setNote("The proposal passes the demo rails. Approval and execution are separate steps, so the walkthrough now records a clearly labelled mock outcome.");
    await wait(1200);
    if (id !== runId.current) return;
    setReceipt({ recipient: "Alex", amount: 12, decision: "Executed (mock)", reason: "Approved after passing the demo policy checks." });
    setStage("complete");
    setAuto(false);
    setNote("Demo complete. This illustrative receipt exists only in this page's memory. No funds moved and no persistent receipt was written.");
  };

  const takeControl = () => {
    runId.current += 1;
    setAuto(false);
    setNote("Auto-play paused. Edit the proposal and use the controls to explore the decision flow yourself.");
  };

  const submit = () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setStage("refused");
      setReceipt({ recipient, amount: value, decision: "Refused", reason: "Amount must be greater than zero." });
      setNote("Blocked: the amount must be a positive number.");
      return;
    }
    if (value > 20) {
      setStage("refused");
      setReceipt({ recipient, amount: value, decision: "Refused", reason: "Amount exceeds the demo cap of 20 credits." });
      setNote("Blocked: this proposal exceeds the 20-credit spending cap.");
      return;
    }
    if (!["Alex", "Jordan", "Sam"].some((name) => name.toLowerCase() === recipient.trim().toLowerCase())) {
      setStage("refused");
      setReceipt({ recipient, amount: value, decision: "Refused", reason: "Recipient is not on the demo allowlist." });
      setNote("Blocked: this recipient is not on the allowed list.");
      return;
    }
    setReceipt(null);
    setStage("review");
    setNote("Within the demo policy. The proposal is waiting for your explicit approval. No transfer has occurred.");
  };

  const approve = () => {
    setStage("approved");
    setNote("Approved in the walkthrough. This still does not execute anything.");
  };
  const execute = () => {
    setReceipt({ recipient, amount: Number(amount), decision: "Executed (mock)", reason: "Manually completed in the isolated demo." });
    setStage("complete");
    setNote("Recorded in this demo page only. No funds moved and no persistent receipt was written.");
  };
  const refuse = () => {
    setStage("refused");
    setReceipt({ recipient, amount: Number(amount), decision: "Refused", reason: "Manually refused in the isolated demo." });
    setNote("Refusal shown in the walkthrough only. Nothing was sent.");
  };

  const allowed = ["Alex", "Jordan", "Sam"].some((name) => name.toLowerCase() === recipient.trim().toLowerCase());
  const withinCap = Number(amount) > 0 && Number(amount) <= 20;

  return (
    <>
      <section className="home-hero">
        <div className="hero-kicker"><i /> INTERACTIVE WALKTHROUGH <span>·</span> ISOLATED DEMO</div>
        <h1 className="hero-title">See your rails <em>decide.</em></h1>
        <p className="hero-copy">Watch an agent propose a mock transfer, see the referee check your rules, then take control of the decision. This uses the same Rails Desk control-room layout.</p>
        <div className="hero-actions">
          <button className="button" onClick={() => void play()} disabled={auto}>▶ {auto ? "Playing walkthrough" : "Play walkthrough"}</button>
          <button className="button ghost" onClick={reset}>Restart demo</button>
          <Link href="/propose" className="button ghost">Open the app</Link>
        </div>
        <div className="hero-metrics"><span><strong>20</strong> max demo credits</span><span><strong>3</strong> allowed recipients</span><span><strong>0</strong> real transfers</span></div>
      </section>

      <section className="prompt-stage">
        <h2 className="stage-title">The control room, live.</h2>
        <div className="prompt-window">
          <div className="prompt-window-head">
            <div className="prompt-window-brand"><b>R</b> Rails Desk <span style={{ fontWeight: 400, color: "#a39286" }}> / Guided control room</span></div>
            <span className="local-status"><i /> Isolated demo</span>
          </div>
          <div className="prompt-window-body">
            <aside className="prompt-sidebar">
              <div className="prompt-sidebar-label">YOUR WORKSPACE</div>
              <div className="prompt-side-item active">◉ New proposal<small>Review an agent action</small></div>
              <div className="prompt-side-item">⌘ Policy rails<small>20 credits · 3 recipients</small></div>
              <div className="prompt-side-item">▤ Receipt chain<small>Demo-only outcome</small></div>
              <div className="demo-sidebar-note">Demo data only. Your real policy and receipt history are not connected.</div>
            </aside>
            <div className="prompt-main">
              <div className="prompt-bubble">Can I send a transfer for review?</div>
              <div className="prompt-response">
                <div className="prompt-response-head"><span>Referee preview</span><span className={stage === "refused" ? "status-pill refused" : "status-pill"}>{stage === "idle" || stage === "typing" ? "Waiting" : stage === "review" ? "Needs your OK" : stage === "refused" ? "Blocked" : stage === "approved" ? "Approved" : "Recorded · mock"}</span></div>
                <p><span className="prompt-check">✓</span> Spending cap: up to 20 demo credits</p>
                <p><span className="prompt-check">✓</span> Recipient must be on the demo allowlist</p>
                <p><span className="prompt-check">✓</span> Approval and mock execution are separate</p>
                <div className={stage === "refused" ? "notice warn" : "notice"} style={{ marginTop: 13 }}>{note}</div>
              </div>

              <div className="demo-form">
                <div className="field"><label htmlFor="demo-recipient">Recipient</label><input id="demo-recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} disabled={auto} /><span className="hint">Allowed: Alex, Jordan and Sam.</span></div>
                <div className="field"><label htmlFor="demo-amount">Transfer amount · demo credits</label><input id="demo-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={auto} /><span className="hint">Maximum per action: 20 credits.</span></div>
                <div className="field"><label htmlFor="demo-reason">Reason from the agent</label><textarea id="demo-reason" value={reason} onChange={(e) => setReason(e.target.value)} disabled={auto} /></div>
                <div className="prompt-input">
                  <span>Simulated proposal · no funds move</span>
                  <button className="button button-small" onClick={submit} disabled={auto || stage === "approved" || stage === "complete"}>Check against rails</button>
                </div>
                {stage === "review" && <div className="action-row"><button className="button" onClick={approve}>Approve proposal</button><button className="button danger" onClick={refuse}>Refuse</button></div>}
                {stage === "approved" && <div className="action-row"><button className="button" onClick={execute}>Execute mock transfer</button><button className="button danger" onClick={refuse}>Cancel instead</button></div>}
                {stage === "refused" && <div className="action-row"><button className="button ghost" onClick={reset}>Try another proposal</button></div>}
                {stage === "complete" && <div className="action-row"><button className="button ghost" onClick={reset}>Run it again</button></div>}
              </div>
            </div>
          </div>
        </div>
        <div className="stage-steps"><span>① <b>Agent proposes</b></span><span>② <b>Rails check</b></span><span>③ <b>You decide</b></span><span>④ <b>Mock receipt</b></span></div>
      </section>

      <section className="demo-result">
        <div className="demo-result-head"><div><div className="section-eyebrow">DECISION RECORD</div><h2>{receipt ? "Demo receipt" : "What gets recorded"}</h2></div><span className="tag">{receipt ? "DEMO ONLY" : "PREVIEW"}</span></div>
        {receipt ? <div className="demo-receipt"><div><strong>{receipt.recipient} · {Number.isFinite(receipt.amount) ? receipt.amount : "Invalid"} credits</strong><span>{receipt.decision}</span></div><p>{receipt.reason}</p><small>DEMO RECEIPT · NOT IN THE PERSISTENT CHAIN</small></div> : <p className="demo-result-copy">When the walkthrough reaches its final step, a sample outcome appears here. It stays in this page's temporary state and never enters your real receipt chain.</p>}
        <div className="demo-policy-grid"><div><b>01</b><strong>Spending cap</strong><span className={withinCap ? "policy-pass" : "policy-fail"}>{withinCap ? "Within 20 credits" : "Outside allowed amount"}</span></div><div><b>02</b><strong>Recipient allowlist</strong><span className={allowed ? "policy-pass" : "policy-fail"}>{allowed ? "Recipient is allowed" : "Recipient is not allowed"}</span></div><div><b>03</b><strong>Human control</strong><span>Approval is separate from execution</span></div></div>
        <p className="demo-footnote">This is a safe, self-contained walkthrough. It does not call the receipt API, change your configured rails, or move funds.</p>
      </section>
    </>
  );
}
