"use client";

import Link from "next/link";
import {useEffect, useRef, useState} from "react";

type Stage = "idle" | "typing" | "review" | "approved" | "refused" | "complete";
type DemoReceipt = {recipient:string;amount:number;decision:string;reason:string};

const wait = (ms:number) => new Promise<void>(resolve => window.setTimeout(resolve,ms));

export default function GuidedDemoPage(){
 const [recipient,setRecipient]=useState("Alex");
 const [amount,setAmount]=useState("12");
 const [reason,setReason]=useState("Monthly team expense reimbursement");
 const [stage,setStage]=useState<Stage>("idle");
 const [auto,setAuto]=useState(false);
 const [receipt,setReceipt]=useState<DemoReceipt|null>(null);
 const [note,setNote]=useState("The demo uses its own temporary state. It will not change your rails or add entries to your receipt history.");
 const runId=useRef(0);

 useEffect(()=>()=>{runId.current+=1;},[]);

 const reset=()=>{
  runId.current+=1;setAuto(false);setRecipient("Alex");setAmount("12");setReason("Monthly team expense reimbursement");setStage("idle");setReceipt(null);
  setNote("The demo uses its own temporary state. It will not change your rails or add entries to your receipt history.");
 };
 const play=async()=>{
  const id=++runId.current;setAuto(true);setReceipt(null);setStage("typing");
  setRecipient("");setAmount("");setReason("");
  await wait(450);if(id!==runId.current)return;setRecipient("Alex");
  await wait(450);if(id!==runId.current)return;setAmount("12");
  await wait(450);if(id!==runId.current)return;setReason("Monthly team expense reimbursement");
  await wait(700);if(id!==runId.current)return;setStage("review");
  setNote("The referee checks the amount and exact recipient against the active policy. The reason is treated as untrusted data.");
  await wait(1400);if(id!==runId.current)return;setStage("approved");
  setNote("The proposal is within the demo rails. Approval is not execution: a separate explicit mock-execution step is required.");
  await wait(1200);if(id!==runId.current)return;setReceipt({recipient:"Alex",amount:12,decision:"Executed (mock)",reason:"Approved after passing the demo policy checks."});setStage("complete");setAuto(false);
  setNote("Demo complete. This illustrative receipt exists only in this page's memory and is not part of your real receipt chain.");
 };
 const takeControl=()=>{runId.current+=1;setAuto(false);setNote("Auto-play paused. You can edit the fields and use the controls yourself.");};
 const submit=()=>{setReceipt(null);setStage("review");setNote("Preview only: Alex is allowed and 12 is below the demo cap of 20. No transfer has occurred.");};
 const approve=()=>{setStage("approved");setNote("Approved in the walkthrough. This still does not execute anything.");};
 const execute=()=>{setReceipt({recipient,amount:Number(amount),decision:"Executed (mock)",reason:"Manually completed in the isolated demo."});setStage("complete");setNote("Recorded in this demo page only. No funds moved and no persistent receipt was written.");};
 const refuse=()=>{setStage("refused");setReceipt({recipient,amount:Number(amount),decision:"Refused",reason:"Manually refused in the isolated demo."});setNote("Refusal shown in the walkthrough only. Nothing was sent.");};

 return <div className="guided-demo">
  <div className="page-head"><div><div className="eyebrow">INTERACTIVE WALKTHROUGH / 01</div><h1 className="page-title">See the rails in action.</h1><p className="page-sub">A guided run through the same proposal, policy and decision pattern. You can take over at any point.</p></div><Link href="/propose" className="button ghost">← Exit demo</Link></div>
  <div className="demo-toolbar"><div><span className="tag">ISOLATED DEMO</span><span className="demo-toolbar-copy">No shared policy or receipt data is changed.</span></div><div className="action-row" style={{marginTop:0}}><button className="button button-small" onClick={()=>void play()} disabled={auto}>▶ {auto?"Playing":"Play walkthrough"}</button><button className="button ghost button-small" onClick={takeControl} disabled={!auto}>Take control</button><button className="button ghost button-small" onClick={reset}>Restart</button></div></div>
  <div className="demo-progress" aria-label="Walkthrough progress"><span className={stage!=="idle"?"done":""}>01 · Propose</span><i/><span className={["approved","refused","complete"].includes(stage)?"done":stage==="review"?"current":""}>02 · Check</span><i/><span className={stage==="complete"||stage==="refused"?"done":""}>03 · Record</span></div>
  <div className="layout-grid demo-grid">
   <section className="panel">
    <div className="section-head"><div><h2 className="panel-title">Control room</h2><div className="panel-desc">An agent is asking to make a mock transfer.</div></div><span className="tag">RULES ACTIVE</span></div>
    <div className="field"><label htmlFor="demo-recipient">Recipient</label><input id="demo-recipient" value={recipient} onChange={e=>setRecipient(e.target.value)} disabled={auto}/><span className="hint">Allowed recipients in this walkthrough: Alex, Jordan and Sam.</span></div>
    <div className="field"><label htmlFor="demo-amount">Amount · demo credits</label><input id="demo-amount" type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} disabled={auto}/><span className="hint">Maximum per action: 20 credits.</span></div>
    <div className="field"><label htmlFor="demo-reason">What the agent wants to do</label><textarea id="demo-reason" value={reason} onChange={e=>setReason(e.target.value)} disabled={auto}/></div>
    <div className="action-row">
     <button className="button" onClick={submit} disabled={auto||stage==="approved"||stage==="complete"}>Check against rails</button>
     {stage==="review"&&<><button className="button" onClick={approve} disabled={auto}>Approve</button><button className="button danger" onClick={refuse} disabled={auto}>Refuse</button></>}
     {stage==="approved"&&<><button className="button" onClick={execute} disabled={auto}>Execute mock transfer</button><button className="button danger" onClick={refuse} disabled={auto}>Cancel instead</button></>}
    </div>
   </section>
   <aside className="panel">
    <div className="section-head"><div><h2 className="panel-title">Referee decision</h2><div className="panel-desc">Deterministic checks, not an agent's opinion.</div></div><span className={stage==="refused"?"tag red":"tag"}>{stage==="idle"||stage==="typing"?"WAITING":stage==="review"?"REVIEW":stage==="approved"?"APPROVED":stage==="refused"?"REFUSED":"COMPLETE"}</span></div>
    <div className={stage==="refused"?"notice warn":"notice"}>{note}</div>
    <div className="rule-row"><span className="rule-icon">01</span><div><strong>Spending cap</strong><p>12 credits is within the 20-credit maximum.</p></div></div>
    <div className="rule-row"><span className="rule-icon">02</span><div><strong>Recipient allowlist</strong><p>Alex is explicitly allowed in this walkthrough.</p></div></div>
    <div className="rule-row"><span className="rule-icon">03</span><div><strong>Human control</strong><p>Approval and mock execution are separate steps.</p></div></div>
    {receipt&&<div className="proposal-card"><div className="receipt-title">{receipt.recipient} · {receipt.amount} credits</div><div className="receipt-meta">{receipt.decision}</div><p style={{marginTop:9}}>{receipt.reason}</p><div className="hash" style={{marginTop:10}}>DEMO RECEIPT · NOT IN PERSISTENT CHAIN</div></div>}
   </aside>
  </div>
  <p className="demo-footnote">This is a safe, self-contained walkthrough. It does not call the receipt API, alter your configured rails, or move funds.</p>
 </div>;
}
