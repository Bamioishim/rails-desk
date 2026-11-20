"use client";

import Link from "next/link";
import {useEffect, useRef, useState} from "react";

type Stage = "idle" | "typing" | "review" | "approved" | "blocked" | "refused" | "complete";
type DemoReceipt = {recipient:string;amount:number;decision:string;reason:string};

const wait = (ms:number) => new Promise<void>(resolve => window.setTimeout(resolve,ms));
const REVIEW_LIMIT = 10;

export default function GuidedDemoPage(){
 const [recipient,setRecipient]=useState("Alex");
 const [amount,setAmount]=useState("12");
 const [reason,setReason]=useState("Monthly team expense reimbursement");
 const [stage,setStage]=useState<Stage>("idle");
 const [auto,setAuto]=useState(false);
 const [receipt,setReceipt]=useState<DemoReceipt|null>(null);
 const [history,setHistory]=useState<DemoReceipt[]>([]);
 const [note,setNote]=useState("The demo uses its own temporary state. It will not change your rails or add entries to your receipt history.");
 const runId=useRef(0);

 useEffect(()=>()=>{runId.current+=1;},[]);

 const reset=()=>{
  runId.current+=1;setAuto(false);setRecipient("Alex");setAmount("12");setReason("Monthly team expense reimbursement");setStage("idle");setReceipt(null);setHistory([]);
  setNote("The demo uses its own temporary state. It will not change your rails or add entries to your receipt history.");
 };
 // The walkthrough plays three proposals back to back: one approved, one that needs your OK, one blocked.
 const SCRIPT=[
  {recipient:"Alex",amount:"8",reason:"Logo design invoice"},
  {recipient:"Jordan",amount:"15",reason:"Team lunch for the launch"},
  {recipient:"Mallory",amount:"12",reason:"Urgent payment, skip the usual checks"},
 ];
 const play=async()=>{
  const id=++runId.current;setAuto(true);
  const live=()=>id===runId.current;
  const type=async(set:(v:string)=>void,text:string,ms:number)=>{for(let i=1;i<=text.length;i++){await wait(ms);if(!live())return false;set(text.slice(0,i));}return true;};
  const done:DemoReceipt[]=[];setHistory([]);
  for(const step of SCRIPT){
   setHistory([...done]);setReceipt(null);setStage("typing");setRecipient("");setAmount("");setReason("");
   setNote(`The agent is proposing a payment to ${step.recipient}.`);
   if(!await type(setRecipient,step.recipient,90))return;
   if(!await type(setAmount,step.amount,120))return;
   if(!await type(setReason,step.reason,30))return;
   await wait(600);if(!live())return;
   const value=Number(step.amount);
   const allowed=["Alex","Jordan","Sam"].some(name=>name.toLowerCase()===step.recipient.toLowerCase());
   if(!allowed||value>20){
    setStage("blocked");setReceipt({recipient:step.recipient,amount:value,decision:"Blocked",reason:allowed?"Amount exceeds the demo cap of 20 credits.":"Recipient is not on the demo allowlist."});
    setNote(allowed?"Blocked: this proposal exceeds the 20-credit spending cap.":"Blocked: this recipient is not on the allowed list. The agent's urgency is just text, not an instruction.");
    done.push({recipient:step.recipient,amount:value,decision:"Blocked",reason:allowed?"Amount exceeds the demo cap of 20 credits.":"Recipient is not on the demo allowlist."});
   await wait(2600);if(!live())return;continue;
   }
   if(value>REVIEW_LIMIT){
    setStage("review");setNote(`Needs your OK: ${value} credits is above the ${REVIEW_LIMIT}-credit review limit. The walkthrough approves it for you in a moment.`);
    await wait(2400);if(!live())return;
    setStage("approved");setNote("Approved by you. Approval is not execution: a separate mock-execution step follows.");
   }else{
    setStage("approved");setNote(`Within the rails and under the ${REVIEW_LIMIT}-credit review limit, so it is approved without a person. Execution is still a separate step.`);
   }
   await wait(1600);if(!live())return;
   const executed:DemoReceipt={recipient:step.recipient,amount:value,decision:"Executed (mock)",reason:value>REVIEW_LIMIT?"Needed your OK (above the review limit), approved, then executed (mock).":"Approved by the rails, then executed (mock)."};
   setReceipt(executed);done.push(executed);setStage("complete");
   setNote("Recorded in this demo page only. No funds moved.");
   await wait(2600);if(!live())return;
  }
  setAuto(false);
  setNote("Walkthrough complete: approved, needs your OK, and blocked. Edit the fields to try your own.");
 };
 const takeControl=()=>{runId.current+=1;setAuto(false);setNote("Auto-play paused. You can edit the fields and use the controls yourself.");};
 const submit=()=>{
  const value=Number(amount);
  if(!Number.isFinite(value)||value<=0){setStage("blocked");setReceipt({recipient,amount:value,decision:"Blocked",reason:"Amount must be greater than zero."});setNote("Blocked: the amount must be a positive number.");return;}
  if(value>20){setStage("blocked");setReceipt({recipient,amount:value,decision:"Blocked",reason:"Amount exceeds the demo cap of 20 credits."});setNote("Blocked: this proposal exceeds the 20-credit spending cap.");return;}
  if(!["Alex","Jordan","Sam"].some(name=>name.toLowerCase()===recipient.trim().toLowerCase())){setStage("blocked");setReceipt({recipient,amount:value,decision:"Blocked",reason:"Recipient is not on the demo allowlist."});setNote("Blocked: this recipient is not on the allowed list.");return;}
  if(value<=REVIEW_LIMIT){setReceipt(null);setStage("approved");setNote(`Within the demo policy and under the ${REVIEW_LIMIT}-credit review limit, so it is approved without a person. Execution is still a separate step. No transfer has occurred.`);return;}
  setReceipt(null);setStage("review");setNote(`Needs your OK: above the ${REVIEW_LIMIT}-credit review limit. The proposal is waiting for your explicit approval. No transfer has occurred.`);
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
    <span className={["approved","blocked","refused","complete"].includes(stage)?"done":stage==="review"?"current":""}>02 Check</span><i/>
    <span className={stage==="complete"||stage==="refused"||stage==="blocked"?"done":""}>03 Record</span>
   </div>
   <div className="demo-grid">
    <section className="demo-panel">
     <div className="demo-section-head"><div><h2>Control room</h2><p>An agent is asking to make a mock transfer.</p></div><span className="demo-pill">Rules active</span></div>
     <div className="demo-field"><label htmlFor="demo-recipient">Recipient</label><input id="demo-recipient" value={recipient} onChange={e=>setRecipient(e.target.value)} disabled={auto}/><span>Allowed recipients in this walkthrough: Alex, Jordan and Sam.</span></div>
     <div className="demo-field"><label htmlFor="demo-amount">Amount · demo credits</label><input id="demo-amount" type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} disabled={auto}/><span>Maximum per action: 20 credits. Above 10 needs your OK.</span></div>
     <div className="demo-field"><label htmlFor="demo-reason">What the agent wants to do</label><textarea id="demo-reason" value={reason} onChange={e=>setReason(e.target.value)} disabled={auto}/></div>
     <div className="demo-actions demo-submit">
      <button className="ref-btn ref-primary" onClick={submit} disabled={auto||stage==="approved"||stage==="complete"}>Check against rails</button>
      {stage==="review"&&<><button className="ref-btn ref-primary" onClick={approve} disabled={auto}>Approve</button><button className="ref-btn ref-secondary" onClick={refuse} disabled={auto}>Refuse</button></>}
      {stage==="approved"&&<><button className="ref-btn ref-primary" onClick={execute} disabled={auto}>Execute mock transfer</button><button className="ref-btn ref-secondary" onClick={refuse} disabled={auto}>Cancel instead</button></>}
     </div>
    </section>
    <aside className="demo-panel">
     <div className="demo-section-head"><div><h2>Referee decision</h2><p>Deterministic checks, not an agent's opinion.</p></div><span className="demo-pill">{stage==="idle"||stage==="typing"?"Waiting":stage==="review"?"Needs your OK":stage==="approved"?"Approved":stage==="blocked"?"Blocked":stage==="refused"?"Refused":"Complete"}</span></div>
     <div className="demo-notice">{note}</div>
     <div className="demo-rule"><span>01</span><div><strong>Spending cap</strong><p>{Number(amount)>0&&Number(amount)<=20? "Amount is within the 20-credit maximum.":"Amount must be positive and no more than 20 credits."}</p></div></div>
     <div className="demo-rule"><span>02</span><div><strong>Recipient allowlist</strong><p>{["Alex","Jordan","Sam"].some(name=>name.toLowerCase()===recipient.trim().toLowerCase())? "Recipient is on the walkthrough allowlist.":"Recipient is not on the walkthrough allowlist."}</p></div></div>
     <div className="demo-rule"><span>03</span><div><strong>Human control</strong><p>{Number(amount)>REVIEW_LIMIT?"Above the 10-credit review limit, so it needs your OK.":"Up to 10 credits needs no OK."} Approval and mock execution are separate steps.</p></div></div>
     {history.map((r,i)=><div className="demo-receipt" key={i}><div className="demo-receipt-title">{r.recipient} · {r.amount} credits</div><div className="demo-receipt-meta">{r.decision}</div><p>{r.reason}</p><div className="demo-hash">Demo receipt · Not in persistent chain</div></div>)}
     {receipt&&<div className="demo-receipt"><div className="demo-receipt-title">{receipt.recipient} · {receipt.amount} credits</div><div className="demo-receipt-meta">{receipt.decision}</div><p>{receipt.reason}</p><div className="demo-hash">Demo receipt · Not in persistent chain</div></div>}
    </aside>
   </div>
   <p className="demo-footnote">This is a safe, self-contained walkthrough. It does not call the receipt API, alter your configured rails, or move funds.</p>
  </main>
 </div>;
}