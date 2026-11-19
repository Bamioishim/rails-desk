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
  for(let i=1;i<="Alex".length;i++){await wait(95);if(id!==runId.current)return;setRecipient("Alex".slice(0,i));}
  for(let i=1;i<="12".length;i++){await wait(120);if(id!==runId.current)return;setAmount("12".slice(0,i));}
  const demoReason="Monthly team expense reimbursement";
  for(let i=1;i<=demoReason.length;i++){await wait(32);if(id!==runId.current)return;setReason(demoReason.slice(0,i));}
  await wait(650);if(id!==runId.current)return;setStage("review");
  setNote("The referee checks the amount and exact recipient against the active policy. The reason is treated as untrusted data.");
  await wait(1400);if(id!==runId.current)return;setStage("approved");
  setNote("The proposal is within the demo rails. Approval is not execution: a separate explicit mock-execution step is required.");
  await wait(1200);if(id!==runId.current)return;setReceipt({recipient:"Alex",amount:12,decision:"Executed (mock)",reason:"Approved after passing the demo policy checks."});setStage("complete");setAuto(false);
  setNote("Demo complete. This illustrative receipt exists only in this page's memory and is not part of your real receipt chain.");
 };
 const takeControl=()=>{runId.current+=1;setAuto(false);setNote("Auto-play paused. You can edit the fields and use the controls yourself.");};
 const submit=()=>{
  const value=Number(amount);
  if(!Number.isFinite(value)||value<=0){setStage("refused");setReceipt({recipient,amount:value,decision:"Refused",reason:"Amount must be greater than zero."});setNote("Blocked: the amount must be a positive number.");return;}
  if(value>20){setStage("refused");setReceipt({recipient,amount:value,decision:"Refused",reason:"Amount exceeds the demo cap of 20 credits."});setNote("Blocked: this proposal exceeds the 20-credit spending cap.");return;}
  if(!["Alex","Jordan","Sam"].some(name=>name.toLowerCase()===recipient.trim().toLowerCase())){setStage("refused");setReceipt({recipient,amount:value,decision:"Refused",reason:"Recipient is not on the demo allowlist."});setNote("Blocked: this recipient is not on the allowed list.");return;}
  setReceipt(null);setStage("review");setNote("Within the demo policy. The proposal is waiting for your explicit approval. No transfer has occurred.");
 };
 const approve=()=>{setStage("approved");setNote("Approved in the walkthrough. This still does not execute anything.");};
 const execute=()=>{setReceipt({recipient,amount:Number(amount),decision:"Executed (mock)",reason:"Manually completed in the isolated demo."});setStage("complete");setNote("Recorded in this demo page only. No funds moved and no persistent receipt was written.");};
 const refuse=()=>{setStage("refused");setReceipt({recipient,amount:Number(amount),decision:"Refused",reason:"Manually refused in the isolated demo."});setNote("Refusal shown in the walkthrough only. Nothing was sent.");};

 return <div className="reference-home demo-home">
  <header className="ref-nav">
   <div className="ref-wrap ref-nav-in">
    <Link className="ref-brand" href="/"><img src="/rails-desk-mark.svg" alt=""/>rails desk</Link>
    <nav className="ref-links">
     <Link href="/#about">About</Link><Link href="/#features">Features</Link><Link href="/#how">How it works</Link><Link href="/#questions">Questions</Link>
    </nav>
    <Link className="ref-btn ref-primary ref-nav-btn" href="/demo">Play the demo</Link>
   </div>
  </header>
  <main className="demo-wrap">
   <div className="demo-head">
    <div><p className="demo-eyebrow">Interactive walkthrough</p><h1 className="demo-title">See the rails in action.</h1><p className="demo-lead">A guided run through the same proposal, policy and decision pattern. You can take over at any point.</p></div>
    <Link href="/" className="ref-btn ref-secondary">Exit demo</Link>
   </div>
   <div className="demo-toolbar">
    <div><span className="demo-pill">Isolated demo</span><span className="demo-toolbar-copy">No shared policy or receipt data is changed.</span></div>
    <div className="demo-actions">
     <button className="ref-btn ref-primary" onClick={()=>void play()} disabled={auto}>{auto?"Playing":"Play walkthrough"}</button>
     <button className="ref-btn ref-secondary" onClick={takeControl} disabled={!auto}>Take control</button>
     <button className="ref-btn ref-secondary" onClick={reset}>Restart</button>
    </div>
   </div>
   <div className="demo-progress" aria-label="Walkthrough progress">
    <span className={stage!=="idle"?"done":""}>01 Propose</span><i/>
    <span className={["approved","refused","complete"].includes(stage)?"done":stage==="review"?"current":""}>02 Check</span><i/>
    <span className={stage==="complete"||stage==="refused"?"done":""}>03 Record</span>
   </div>
   <div className="demo-grid">
    <section className="demo-panel">
     <div className="demo-section-head"><div><h2>Control room</h2><p>An agent is asking to make a mock transfer.</p></div><span className="demo-pill">Rules active</span></div>
     <div className="demo-field"><label htmlFor="demo-recipient">Recipient</label><input id="demo-recipient" value={recipient} onChange={e=>setRecipient(e.target.value)} disabled={auto}/><span>Allowed recipients in this walkthrough: Alex, Jordan and Sam.</span></div>
     <div className="demo-field"><label htmlFor="demo-amount">Amount · demo credits</label><input id="demo-amount" type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} disabled={auto}/><span>Maximum per action: 20 credits.</span></div>
     <div className="demo-field"><label htmlFor="demo-reason">What the agent wants to do</label><textarea id="demo-reason" value={reason} onChange={e=>setReason(e.target.value)} disabled={auto}/></div>
     <div className="demo-actions demo-submit">
      <button className="ref-btn ref-primary" onClick={submit} disabled={auto||stage==="approved"||stage==="complete"}>Check against rails</button>
      {stage==="review"&&<><button className="ref-btn ref-primary" onClick={approve} disabled={auto}>Approve</button><button className="ref-btn ref-secondary" onClick={refuse} disabled={auto}>Refuse</button></>}
      {stage==="approved"&&<><button className="ref-btn ref-primary" onClick={execute} disabled={auto}>Execute mock transfer</button><button className="ref-btn ref-secondary" onClick={refuse} disabled={auto}>Cancel instead</button></>}
     </div>
    </section>
    <aside className="demo-panel">
     <div className="demo-section-head"><div><h2>Referee decision</h2><p>Deterministic checks, not an agent's opinion.</p></div><span className="demo-pill">{stage==="idle"||stage==="typing"?"Waiting":stage==="review"?"Review":stage==="approved"?"Approved":stage==="refused"?"Refused":"Complete"}</span></div>
     <div className="demo-notice">{note}</div>
     <div className="demo-rule"><span>01</span><div><strong>Spending cap</strong><p>{Number(amount)>0&&Number(amount)<=20? "Amount is within the 20-credit maximum.":"Amount must be positive and no more than 20 credits."}</p></div></div>
     <div className="demo-rule"><span>02</span><div><strong>Recipient allowlist</strong><p>{["Alex","Jordan","Sam"].some(name=>name.toLowerCase()===recipient.trim().toLowerCase())? "Recipient is on the walkthrough allowlist.":"Recipient is not on the walkthrough allowlist."}</p></div></div>
     <div className="demo-rule"><span>03</span><div><strong>Human control</strong><p>Approval and mock execution are separate steps.</p></div></div>
     {receipt&&<div className="demo-receipt"><div className="demo-receipt-title">{receipt.recipient} · {receipt.amount} credits</div><div className="demo-receipt-meta">{receipt.decision}</div><p>{receipt.reason}</p><div className="demo-hash">Demo receipt · Not in persistent chain</div></div>}
    </aside>
   </div>
   <p className="demo-footnote">This is a safe, self-contained walkthrough. It does not call the receipt API, alter your configured rails, or move funds.</p>
  </main>
 </div>;
}