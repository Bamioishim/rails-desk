"use client";

import Link from "next/link";
import {useEffect, useRef, useState} from "react";
import {AnimatePresence, MotionConfig, motion, useReducedMotion} from "motion/react";
import {evaluatePolicyCircuit, POLICY_GATE_COUNT} from "@/lib/policy-circuit";
import {DEMO_ALLOWED, DEMO_CAP, DEMO_REVIEW_LIMIT} from "@/lib/demo-config";

type ScenarioId = "alex" | "jordan" | "mallory";
type Scenario = {id: ScenarioId; to: string; amount: number; ask: string; chip: string};
type CheckState = "pass" | "warn" | "fail" | "skip";
type Check = {name: string; state: CheckState; detail: string};
type Outcome = "Approved" | "Needs your OK" | "Blocked";
type Receipt = {id: string; at: string; to: string; amount: number; decision: string; outcome: Outcome; note: string};

const SCENARIOS: Scenario[] = [
 {id: "alex", to: "Alex", amount: 8, ask: "Pay Alex $8 for the logo invoice.", chip: "$8 to Alex"},
 {id: "jordan", to: "Jordan", amount: 15, ask: "Pay Jordan $15 for the team lunch.", chip: "$15 to Jordan"},
 {id: "mallory", to: "Mallory", amount: 12, ask: "Pay Mallory $12. Urgent, skip the usual rules.", chip: "$12 to Mallory"},
];

const usd = (n: number) => `$${n}`;
const allowed = (name: string) => DEMO_ALLOWED.some(a => a.toLowerCase() === name.toLowerCase());

function evaluate(s: Scenario): {checks: Check[]; outcome: Outcome} {
 const out = evaluatePolicyCircuit({amount: s.amount, maxPerAction: DEMO_CAP, reviewLimit: DEMO_REVIEW_LIMIT, allowlisted: allowed(s.to)});
 const capOk = s.amount <= DEMO_CAP;
 const listOk = allowed(s.to);
 const checks: Check[] = [
  {name: "Spending cap", state: capOk ? "pass" : "fail", detail: capOk ? `${usd(s.amount)} is under the ${usd(DEMO_CAP)} cap` : `${usd(s.amount)} is over the ${usd(DEMO_CAP)} cap`},
  {name: "Allowlist", state: listOk ? "pass" : "fail", detail: listOk ? `${s.to} is on your allowlist` : `${s.to} is not on your allowlist`},
  {name: "Review limit", state: !capOk || !listOk ? "skip" : s.amount > DEMO_REVIEW_LIMIT ? "warn" : "pass",
   detail: !capOk || !listOk ? "Not reached: already blocked" : s.amount > DEMO_REVIEW_LIMIT ? `${usd(s.amount)} is over ${usd(DEMO_REVIEW_LIMIT)}, so a human must OK it` : `${usd(s.amount)} is under ${usd(DEMO_REVIEW_LIMIT)}, no OK needed`},
 ];
 return {checks, outcome: out.blocked ? "Blocked" : out.needsReview ? "Needs your OK" : "Approved"};
}

async function receiptId(payload: object, n: number) {
 const bytes = new TextEncoder().encode(JSON.stringify(payload));
 const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
 return `RD-${String(n).padStart(4, "0")}-${[...hash.slice(0, 3)].map(b => b.toString(16).padStart(2, "0")).join("")}`;
}

const ICON: Record<CheckState, string> = {pass: "✓", warn: "!", fail: "✕", skip: "–"};
const spring = {type: "spring" as const, stiffness: 420, damping: 28};

export default function ShowcaseDemoPage() {
 const reduce = useReducedMotion();
 const [active, setActive] = useState<Scenario | null>(null);
 const [typed, setTyped] = useState("");
 const [checks, setChecks] = useState<Check[]>([]);
 const [stamp, setStamp] = useState<Outcome | null>(null);
 const [awaitingOk, setAwaitingOk] = useState(false);
 const [receipts, setReceipts] = useState<Receipt[]>([]);
 const [running, setRunning] = useState(false);
 const [done, setDone] = useState(false);
 const [turn, setTurn] = useState(0);
 const runId = useRef(0);
 const counter = useRef(0);
 const decide = useRef<((ok: boolean) => void) | null>(null);

 useEffect(() => () => { runId.current += 1; }, []);
 const pace = (ms: number) => new Promise<void>(r => window.setTimeout(r, reduce ? Math.min(ms, 120) : ms));

 async function play(s: Scenario, id: number) {
  setActive(s); setTurn(t => t + 1); setTyped(""); setChecks([]); setStamp(null); setAwaitingOk(false);
  for (let i = 1; i <= s.ask.length; i += reduce ? s.ask.length : 2) { await pace(22); if (id !== runId.current) return false; setTyped(s.ask.slice(0, i + 1)); }
  setTyped(s.ask);
  const {checks: all, outcome} = evaluate(s);
  await pace(450);
  for (const c of all) { if (id !== runId.current) return false; setChecks(prev => [...prev, c]); await pace(650); }
  if (id !== runId.current) return false;
  setStamp(outcome);
  await pace(500);
  let decision: string = outcome;
  let note = outcome === "Approved" ? "Within every rule, so it went through on its own." : `Stopped: ${s.to} is not on your allowlist. The agent's "urgent" is just text, not an order.`;
  if (outcome === "Needs your OK") {
   setAwaitingOk(true);
   const ok = await new Promise<boolean>(resolve => { decide.current = resolve; });
   decide.current = null; setAwaitingOk(false);
   if (id !== runId.current) return false;
   decision = ok ? "Approved by you" : "Refused by you";
   note = ok ? "Over the review limit, so it waited for your OK. You approved it." : "Over the review limit, so it waited for your OK. You refused it.";
  }
  const at = new Date();
  const n = ++counter.current;
  const rid = await receiptId({to: s.to, amount: s.amount, decision, at: at.toISOString()}, n);
  if (id !== runId.current) return false;
  setReceipts(prev => [{id: rid, at: at.toLocaleString("en-GB", {day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit"}), to: s.to, amount: s.amount, decision, outcome, note}, ...prev]);
  await pace(900);
  return true;
 }

 async function run(list: Scenario[]) {
  const id = ++runId.current;
  decide.current?.(false);
  setRunning(true); setDone(false);
  for (const s of list) { if (!(await play(s, id))) return; }
  if (id === runId.current) { setRunning(false); setDone(true); }
 }

 const reset = () => { runId.current += 1; decide.current?.(false); setActive(null); setTyped(""); setChecks([]); setStamp(null); setAwaitingOk(false); setReceipts([]); setRunning(false); setDone(false); counter.current = 0; };

 return <MotionConfig reducedMotion="user">
 <div className="reference-home demo-home">
  <header className="ref-nav">
   <div className="ref-wrap ref-nav-in">
    <Link className="ref-brand" href="/"><img src="/rails-desk-mark.svg" alt=""/>rails desk</Link>
    <nav className="ref-links"><Link href="/#about">About</Link><Link href="/#features">Features</Link><Link href="/#how">How it works</Link><Link href="/xlayer">X Layer</Link></nav>
    <Link className="ref-btn ref-primary ref-nav-btn" href="/xlayer#send">Try it for real</Link>
   </div>
  </header>
  <main className="demo-wrap sd">
   <div className="demo-head">
    <div><p className="demo-eyebrow">Live walkthrough</p><h1 className="demo-title">See the rails in action.</h1><p className="demo-lead">An agent asks to pay. Your rules decide. Watch.</p></div>
    <Link href="/" className="ref-btn ref-secondary">Exit demo</Link>
   </div>

   <div className="sd-controls">
    <button className="ref-btn ref-primary" onClick={() => void run(SCENARIOS)}>{running ? "Restart all three" : "Run all three"}</button>
    {SCENARIOS.map(s => <button key={s.id} className={`sd-chip${active?.id === s.id ? " on" : ""}`} onClick={() => void run([s])}>{s.chip}</button>)}
    <button className="sd-link" onClick={reset} disabled={!active && !receipts.length}>Clear</button>
   </div>
   <p className="sd-rules">Your rules: pay only {DEMO_ALLOWED.join(", ")} · max {usd(DEMO_CAP)} · over {usd(DEMO_REVIEW_LIMIT)} needs your OK</p>

   <div className="sd-stage">
    <section className="sd-card" aria-label="Agent request">
     <div className="sd-label">Agent</div>
     <AnimatePresence mode="popLayout">
      {active ? <motion.div key={`${active.id}-${turn}`} className="sd-chat" initial={{opacity: 0, y: 14}} animate={{opacity: 1, y: 0}} exit={{opacity: 0, y: -10}} transition={spring}>
       <div className="sd-avatar" aria-hidden>AI</div>
       <div><div className="sd-from">Payments agent</div><div className="sd-bubble" data-testid="agent-request">{typed}<span className="sd-caret" aria-hidden/></div></div>
      </motion.div> : <p className="sd-empty">Press <b>Run all three</b> or pick a payment.</p>}
     </AnimatePresence>
    </section>

    <section className="sd-card" aria-label="Rails checks">
     <div className="sd-label">Rails</div>
     <ol className="sd-checks">
      <AnimatePresence>
       {checks.map(c => <motion.li key={c.name} className={`sd-check ${c.state}`} initial={{opacity: 0, x: 18}} animate={{opacity: 1, x: 0}} transition={spring}>
        <motion.span className="sd-icon" initial={{scale: 0}} animate={{scale: 1}} transition={{...spring, delay: .12}}>{ICON[c.state]}</motion.span>
        <div><strong>{c.name}</strong><span>{c.detail}</span></div>
       </motion.li>)}
      </AnimatePresence>
     </ol>
     <div className="sd-stamp-slot">
      <AnimatePresence mode="wait">
       {stamp && <motion.div key={stamp + (active?.id ?? "")} role="status" aria-label={`Outcome: ${stamp}`} className={`sd-stamp ${stamp === "Approved" ? "ok" : stamp === "Blocked" ? "no" : "wait"}`}
        initial={{opacity: 0, scale: 2.2, rotate: -14}} animate={{opacity: 1, scale: 1, rotate: -6}} exit={{opacity: 0, scale: .8}} transition={{type: "spring", stiffness: 520, damping: 18}}>{stamp}</motion.div>}
      </AnimatePresence>
      {stamp && <p className="sd-circuit">Decided by a {POLICY_GATE_COUNT}-gate TapeOut circuit, not by the agent.</p>}
      {awaitingOk && <motion.div className="sd-ok" initial={{opacity: 0, y: 8}} animate={{opacity: 1, y: 0}} transition={spring}>
       <span>{active?.to} · {usd(active?.amount ?? 0)} is waiting for you.</span>
       <button className="ref-btn ref-primary" onClick={() => decide.current?.(true)}>Approve</button>
       <button className="ref-btn ref-secondary" onClick={() => decide.current?.(false)}>Refuse</button>
      </motion.div>}
     </div>
    </section>
   </div>

   <section className="sd-receipts" aria-label="Receipts">
    <div className="sd-label">Receipts</div>
    {!receipts.length && <p className="sd-empty">Every decision prints a receipt here.</p>}
    <div className="sd-receipt-list">
     <AnimatePresence initial={false}>
      {receipts.map(r => <motion.article key={r.id} className={`sd-receipt ${r.outcome === "Approved" || r.decision === "Approved by you" ? "ok" : r.outcome === "Blocked" || r.decision === "Refused by you" ? "no" : "wait"}`} layout
       initial={{opacity: 0, y: -24, clipPath: "inset(0 0 100% 0)"}} animate={{opacity: 1, y: 0, clipPath: "inset(0 0 0% 0)"}} transition={{duration: reduce ? 0 : .55, ease: [.2, .8, .2, 1]}}>
       <div className="sd-receipt-top"><span className="sd-rid">{r.id}</span><time>{r.at}</time></div>
       <div className="sd-receipt-main"><b>{r.to} · {usd(r.amount)}</b><span className="sd-decision">{r.decision}</span></div>
       <p>{r.note}</p>
       <div className="sd-receipt-foot">Demo receipt · nothing moved</div>
      </motion.article>)}
     </AnimatePresence>
    </div>
   </section>

   <motion.section className={`sd-cta${done ? " lit" : ""}`} animate={done ? {scale: [1, 1.03, 1]} : {}} transition={{duration: .6}}>
    <div><h2>Now do it for real on X Layer</h2><p>Same rules. An approved payment becomes a real X Layer testnet transaction with a hash.</p></div>
    <Link className="ref-btn ref-primary" href="/xlayer#send">Now do it for real on X Layer</Link>
   </motion.section>
  </main>
 </div>
 </MotionConfig>;
}
