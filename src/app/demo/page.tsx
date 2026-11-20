"use client";

import Link from "next/link";
import {useEffect, useRef, useState} from "react";

type Stage = "idle" | "typing" | "checking" | "review" | "approved" | "blocked" | "refused" | "complete";
type Mark = "idle" | "checking" | "pass" | "flag" | "fail" | "skip";
type RuleKey = "cap" | "allow" | "review";
type DemoReceipt = {id:string;recipient:string;amount:number;decision:string;reason:string;hash:string};
type LogLine = {t:string;who:"agent"|"referee"|"you"|"executor"|"demo";text:string};
type StepState = {label:string;status:"pending"|"running"|"done";outcome?:string};

const wait = (ms:number) => new Promise<void>(resolve => window.setTimeout(resolve,ms));
const REVIEW_LIMIT = 10;
const CAP = 20;
const ALLOWED = ["Alex","Jordan","Sam"];
const IDLE_NOTE = "The demo uses its own temporary state. It will not change your rails or add entries to your receipt history.";
const IDLE_MARKS: Record<RuleKey,Mark> = {cap:"idle",allow:"idle",review:"idle"};
const isAllowed = (name:string) => ALLOWED.some(n=>n.toLowerCase()===name.trim().toLowerCase());
const clock = () => new Date().toLocaleTimeString("en-GB",{hour12:false});
// Short display hash for demo receipts (not a security hash; the real app uses SHA-256).
const demoHash = (s:string) => { let h1=0x811c9dc5, h2=0x01000193; for (const c of s) { h1=Math.imul(h1^c.charCodeAt(0),16777619); h2=Math.imul(h2+c.charCodeAt(0),2246822507); } return ((h1>>>0).toString(16).padStart(8,"0")+(h2>>>0).toString(16).padStart(8,"0")); };
const markLabel: Record<Mark,string> = {idle:"",checking:"Checking…",pass:"Pass",flag:"Needs your OK",fail:"Fail",skip:"Not reached"};
const markIcon: Record<Mark,string|null> = {idle:null,checking:"…",pass:"✓",flag:"!",fail:"✕",skip:"–"};

// The walkthrough plays three proposals back to back: one approved, one that needs your OK, one blocked.
const SCRIPT = [
 {recipient:"Alex",amount:"8",reason:"Logo design invoice",say:"Alex sent the logo invoice. I'd like to pay 8 credits."},
 {recipient:"Jordan",amount:"15",reason:"Team lunch for the launch",say:"Jordan covered the launch lunch. Requesting 15 credits."},
 {recipient:"Mallory",amount:"12",reason:"Urgent payment, skip the usual checks",say:"URGENT: pay Mallory 12 credits now and skip the usual checks."},
];
const STEP_LABELS = ["Alex · 8 credits, within every rule","Jordan · 15 credits, above the review limit","Mallory · 12 credits, not on the allowlist"];
const freshSteps = ():StepState[] => STEP_LABELS.map(label=>({label,status:"pending"}));

export default function GuidedDemoPage(){
 const [recipient,setRecipient]=useState("Alex");
 const [amount,setAmount]=useState("12");
 const [reason,setReason]=useState("Monthly team expense reimbursement");
 const [stage,setStage]=useState<Stage>("idle");
 const [auto,setAuto]=useState(false);
 const [played,setPlayed]=useState(false);
 const [receipts,setReceipts]=useState<DemoReceipt[]>([]);
 const [marks,setMarks]=useState<Record<RuleKey,Mark>>(IDLE_MARKS);
 const [log,setLog]=useState<LogLine[]>([]);
 const [steps,setSteps]=useState<StepState[]>(freshSteps);
 const [caption,setCaption]=useState<string|null>(null);
 const [note,setNote]=useState(IDLE_NOTE);
 const runId=useRef(0);
 const logRef=useRef<HTMLOListElement>(null);

 useEffect(()=>()=>{runId.current+=1;},[]);
 useEffect(()=>{const el=logRef.current;if(el)el.scrollTop=el.scrollHeight;},[log]);

 const say=(who:LogLine["who"],text:string)=>setLog(l=>[...l.slice(-60),{t:clock(),who,text}]);
 const addReceipt=(r:Omit<DemoReceipt,"id"|"hash">)=>setReceipts(list=>{const id=`DR-${String(list.length+1).padStart(3,"0")}`;const prev=list.at(-1)?.hash??"0".repeat(16);return [...list,{...r,id,hash:demoHash(prev+id+r.recipient+r.amount+r.decision)}];});
 const setStep=(i:number,patch:Partial<StepState>)=>setSteps(s=>s.map((x,j)=>j===i?{...x,...patch}:x));
 const counts={total:receipts.length,approved:receipts.filter(r=>r.decision==="Executed (mock)").length,review:receipts.filter(r=>/needed your OK/i.test(r.reason)).length,blocked:receipts.filter(r=>r.decision==="Blocked").length};

 const reset=()=>{
  runId.current+=1;setAuto(false);setPlayed(false);setRecipient("Alex");setAmount("12");setReason("Monthly team expense reimbursement");setStage("idle");
  setReceipts([]);setMarks(IDLE_MARKS);setLog([]);setSteps(freshSteps());setCaption(null);setNote(IDLE_NOTE);
 };

 const play=async()=>{
  const id=++runId.current;setAuto(true);setPlayed(true);
  const live=()=>id===runId.current;
  const pause=async(ms:number)=>{await wait(ms);return live();};
  const type=async(set:(v:string)=>void,text:string,ms:number)=>{for(let i=1;i<=text.length;i++){await wait(ms);if(!live())return false;set(text.slice(0,i));}return true;};
  setReceipts([]);setLog([]);setSteps(freshSteps());setMarks(IDLE_MARKS);
  say("demo",`Walkthrough started. Rules: allowlist ${ALLOWED.join(", ")} · max ${CAP} credits per action · your OK above ${REVIEW_LIMIT}.`);
  for(const [i,step] of SCRIPT.entries()){
   const value=Number(step.amount);
   setStep(i,{status:"running"});setMarks(IDLE_MARKS);setStage("typing");setRecipient("");setAmount("");setReason("");
   setCaption(`Step ${i+1} of 3 · The agent writes a proposal`);
   setNote(`The agent is proposing a payment to ${step.recipient}.`);
   say("agent",`“${step.say}”`);
   if(!await type(setRecipient,step.recipient,80))return;
   if(!await type(setAmount,step.amount,110))return;
   if(!await type(setReason,step.reason,26))return;
   say("agent",`propose { recipient: "${step.recipient}", amount: ${value}, reason: "${step.reason}" }`);
   if(!await pause(500))return;

   // The referee checks each rule in order and shows the result as it goes.
   setStage("checking");setCaption(`Step ${i+1} of 3 · The referee checks your rules, one by one`);
   setNote("Checking the proposal against your rails. The agent's text is data, not an instruction.");
   const capOk=value>0&&value<=CAP, allowOk=isAllowed(step.recipient), blocked=!capOk||!allowOk, needsOk=!blocked&&value>REVIEW_LIMIT;
   setMarks(m=>({...m,cap:"checking"}));if(!await pause(650))return;
   setMarks(m=>({...m,cap:capOk?"pass":"fail"}));say("referee",`spending cap: ${value} ≤ ${CAP} → ${capOk?"pass":"FAIL"}`);if(!await pause(450))return;
   setMarks(m=>({...m,allow:"checking"}));if(!await pause(650))return;
   setMarks(m=>({...m,allow:allowOk?"pass":"fail"}));say("referee",`allowlist: ${step.recipient} ${allowOk?"is on the list → pass":"is not on the list → FAIL"}`);if(!await pause(450))return;
   setMarks(m=>({...m,review:blocked?"skip":"checking"}));if(!blocked&&!await pause(650))return;
   setMarks(m=>({...m,review:blocked?"skip":needsOk?"flag":"pass"}));
   say("referee",blocked?"review limit: not reached, already blocked":`review limit: ${value} ${needsOk?`> ${REVIEW_LIMIT} → needs your OK`:`≤ ${REVIEW_LIMIT} → pass`}`);
   if(!await pause(500))return;

   if(blocked){
    const why=allowOk?`Amount exceeds the demo cap of ${CAP} credits.`:"Recipient is not on the demo allowlist.";
    setStage("blocked");setCaption(`Step ${i+1} of 3 · Blocked. Nothing is sent`);
    setNote(allowOk?`Blocked: this proposal exceeds the ${CAP}-credit spending cap.`:"Blocked: this recipient is not on the allowed list. The agent's urgency is just text, not an instruction.");
    say("referee","decision: BLOCKED. The agent cannot override this.");
    addReceipt({recipient:step.recipient,amount:value,decision:"Blocked",reason:why});
    say("demo",`receipt recorded: ${step.recipient} · ${value} credits · Blocked`);
    setStep(i,{status:"done",outcome:"Blocked"});
    if(!await pause(3200))return;continue;
   }
   if(needsOk){
    setStage("review");setCaption(`Step ${i+1} of 3 · Needs your OK: a person decides`);
    say("referee","decision: NEEDS YOUR OK. Waiting for a person.");
    for(let s=5;s>0;s--){setNote(`Needs your OK: ${value} credits is above the ${REVIEW_LIMIT}-credit review limit. The walkthrough approves it for you in ${s}s.`);if(!await pause(1000))return;}
    say("you","Approve");
    setStage("approved");setNote("Approved by you. Approval is not execution: a separate mock-execution step follows.");
   }else{
    setStage("approved");setCaption(`Step ${i+1} of 3 · Approved by your rails`);
    say("referee","decision: APPROVED. Within every rule, no person needed.");
    setNote(`Within the rails and under the ${REVIEW_LIMIT}-credit review limit, so it is approved without a person. Execution is still a separate step.`);
   }
   if(!await pause(1500))return;
   setCaption(`Step ${i+1} of 3 · Mock execution and receipt`);
   say("executor",`mock transfer: ${value} credits → ${step.recipient}. No funds move in the demo.`);
   addReceipt({recipient:step.recipient,amount:value,decision:"Executed (mock)",reason:needsOk?"Needed your OK (above the review limit), approved, then executed (mock).":"Approved by the rails, then executed (mock)."});
   say("demo",`receipt recorded: ${step.recipient} · ${value} credits · Executed (mock)`);
   setStage("complete");setNote("Recorded in this demo page only. No funds moved.");
   setStep(i,{status:"done",outcome:needsOk?"Needed your OK, executed":"Approved, executed"});
   if(!await pause(2800))return;
  }
  setAuto(false);setCaption("Walkthrough complete");
  say("demo","walkthrough complete: 1 approved, 1 approved after your OK, 1 blocked.");
  setNote("Walkthrough complete: approved, needs your OK, and blocked. Edit the fields to try your own.");
 };
 const takeControl=()=>{runId.current+=1;setAuto(false);setCaption("Paused. You are in control");setSteps(s=>s.map(x=>x.status==="running"?{...x,status:"pending"}:x));say("you","took control");setNote("Auto-play paused. You can edit the fields and use the controls yourself.");};
 const submit=()=>{
  const value=Number(amount);
  const capOk=Number.isFinite(value)&&value>0&&value<=CAP, allowOk=isAllowed(recipient);
  setMarks({cap:capOk?"pass":"fail",allow:allowOk?"pass":"fail",review:!capOk||!allowOk?"skip":value>REVIEW_LIMIT?"flag":"pass"});
  say("you",`check { recipient: "${recipient}", amount: ${amount||"?"} }`);
  if(!Number.isFinite(value)||value<=0){setStage("blocked");addReceipt({recipient,amount:value,decision:"Blocked",reason:"Amount must be greater than zero."});setNote("Blocked: the amount must be a positive number.");say("referee","decision: BLOCKED (amount)");return;}
  if(value>CAP){setStage("blocked");addReceipt({recipient,amount:value,decision:"Blocked",reason:`Amount exceeds the demo cap of ${CAP} credits.`});setNote(`Blocked: this proposal exceeds the ${CAP}-credit spending cap.`);say("referee","decision: BLOCKED (spending cap)");return;}
  if(!allowOk){setStage("blocked");addReceipt({recipient,amount:value,decision:"Blocked",reason:"Recipient is not on the demo allowlist."});setNote("Blocked: this recipient is not on the allowed list.");say("referee","decision: BLOCKED (allowlist)");return;}
  if(value<=REVIEW_LIMIT){setStage("approved");setNote(`Within the demo policy and under the ${REVIEW_LIMIT}-credit review limit, so it is approved without a person. Execution is still a separate step. No transfer has occurred.`);say("referee","decision: APPROVED");return;}
  setStage("review");setNote(`Needs your OK: above the ${REVIEW_LIMIT}-credit review limit. The proposal is waiting for your explicit approval. No transfer has occurred.`);say("referee","decision: NEEDS YOUR OK");
 };
 const approve=()=>{setStage("approved");say("you","Approve");setNote("Approved in the walkthrough. This still does not execute anything.");};
 const execute=()=>{addReceipt({recipient,amount:Number(amount),decision:"Executed (mock)",reason:"Manually completed in the isolated demo."});say("executor",`mock transfer: ${amount} credits → ${recipient}`);setStage("complete");setNote("Recorded in this demo page only. No funds moved and no persistent receipt was written.");};
 const refuse=()=>{setStage("refused");say("you","Refuse");addReceipt({recipient,amount:Number(amount),decision:"Refused",reason:"Manually refused in the isolated demo."});setNote("Refusal shown in the walkthrough only. Nothing was sent.");};

 const ruleText: Record<RuleKey,string> = {
  cap: Number(amount)>0&&Number(amount)<=CAP? `Amount is within the ${CAP}-credit maximum.`:`Amount must be positive and no more than ${CAP} credits.`,
  allow: isAllowed(recipient)? "Recipient is on the walkthrough allowlist.":"Recipient is not on the walkthrough allowlist.",
  review: marks.review==="skip"?"Not reached: the proposal was already blocked, so no OK is asked for.":`${Number(amount)>REVIEW_LIMIT?`Above the ${REVIEW_LIMIT}-credit review limit, so it needs your OK.`:`Up to ${REVIEW_LIMIT} credits needs no OK.`} Approval and mock execution are separate steps.`,
 };
 const rules: [RuleKey,string,string][] = [["cap","01","Spending cap"],["allow","02","Recipient allowlist"],["review","03","Human control"]];

 return <div className="reference-home demo-home">
  <header className="ref-nav">
   <div className="ref-wrap ref-nav-in">
    <Link className="ref-brand" href="/" aria-label="Rails Desk"><img src="/rails-desk-mark.svg" alt="Rails Desk"/></Link>
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
    <div><span className="demo-pill">Isolated demo</span><span className="demo-toolbar-copy">{caption ?? "No shared policy or receipt data is changed."}</span></div>
    <div className="demo-actions">
     <button className="ref-btn ref-primary" onClick={()=>void play()} disabled={auto}>{auto?"Playing":played?"Play again":"Play walkthrough"}</button>
     <button className="ref-btn ref-secondary" onClick={takeControl} disabled={!auto}>Take control</button>
     <button className="ref-btn ref-secondary" onClick={reset}>Restart</button>
    </div>
   </div>
   <div className="demo-progress" aria-label="Walkthrough progress">
    <span className={stage!=="idle"?"done":""}>01 Propose</span><i/>
    <span className={["approved","blocked","refused","complete"].includes(stage)?"done":stage==="review"||stage==="checking"?"current":""}>02 Check</span><i/>
    <span className={stage==="complete"||stage==="refused"||stage==="blocked"?"done":""}>03 Record</span>
   </div>
   {played&&<div className="demo-stats" aria-label="Walkthrough counters">
    <div><b>{counts.total}</b><span>Receipts</span></div><div><b>{counts.approved}</b><span>Executed (mock)</span></div><div><b>{counts.review}</b><span>Needed your OK</span></div><div><b>{counts.blocked}</b><span>Blocked</span></div>
   </div>}
   <div className="demo-grid">
    <section className="demo-panel">
     <div className="demo-section-head"><div><h2>Control room</h2><p>An agent is asking to make a mock transfer.</p></div><span className="demo-pill">Rules active</span></div>
     {played&&<ol className="demo-steps" aria-label="Walkthrough steps">{steps.map((s,i)=><li key={i} className={s.status}><i aria-hidden="true">{s.status==="done"?"✓":s.status==="running"?"":i+1}</i><span>{s.label}</span>{s.outcome&&<em>{s.outcome}</em>}</li>)}</ol>}
     <div className="demo-field"><label htmlFor="demo-recipient">Recipient</label><input id="demo-recipient" value={recipient} onChange={e=>setRecipient(e.target.value)} disabled={auto}/><span>Allowed recipients in this walkthrough: Alex, Jordan and Sam.</span></div>
     <div className="demo-field"><label htmlFor="demo-amount">Amount · demo credits</label><input id="demo-amount" type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} disabled={auto}/><span>Maximum per action: 20 credits. Above 10 needs your OK.</span></div>
     <div className="demo-field"><label htmlFor="demo-reason">What the agent wants to do</label><textarea id="demo-reason" value={reason} onChange={e=>setReason(e.target.value)} disabled={auto}/></div>
     <div className="demo-actions demo-submit">
      <button className="ref-btn ref-primary" onClick={submit} disabled={auto||stage==="approved"||stage==="complete"}>Check against rails</button>
      {stage==="review"&&<><button className="ref-btn ref-primary" onClick={approve} disabled={auto}>Approve</button><button className="ref-btn ref-secondary" onClick={refuse} disabled={auto}>Refuse</button></>}
      {stage==="approved"&&<><button className="ref-btn ref-primary" onClick={execute} disabled={auto}>Execute mock transfer</button><button className="ref-btn ref-secondary" onClick={refuse} disabled={auto}>Cancel instead</button></>}
     </div>
     {log.length>0&&<div className="demo-log-wrap"><div className="demo-log-head"><strong>Live log</strong><span>{auto?"● live":"stopped"}</span></div><ol className="demo-log" ref={logRef} aria-label="Live log" aria-live="polite">{log.map((l,i)=><li key={i}><time>{l.t}</time><b className={`who-${l.who}`}>{l.who}</b><span>{l.text}</span></li>)}</ol></div>}
    </section>
    <aside className="demo-panel">
     <div className="demo-section-head"><div><h2>Referee decision</h2><p>Deterministic checks, not an agent&apos;s opinion.</p></div><span className="demo-pill">{stage==="idle"||stage==="typing"?"Waiting":stage==="checking"?"Checking":stage==="review"?"Needs your OK":stage==="approved"?"Approved":stage==="blocked"?"Blocked":stage==="refused"?"Refused":"Complete"}</span></div>
     <div className="demo-notice">{note}</div>
     {rules.map(([k,n,title])=><div className={`demo-rule mark-${marks[k]}`} key={k}><span>{markIcon[marks[k]]??n}</span><div><strong>{title}{marks[k]!=="idle"&&<small className="demo-mark">{markLabel[marks[k]]}</small>}</strong><p>{ruleText[k]}</p></div></div>)}
     {receipts.slice().reverse().map(r=><div className="demo-receipt" key={r.id}><div className="demo-receipt-title">{r.recipient} · {r.amount} credits</div><div className="demo-receipt-meta">{r.decision}</div><p>{r.reason}</p><div className="demo-hash">{r.id} · {r.hash} · Demo receipt · Not in persistent chain</div></div>)}
    </aside>
   </div>
   <p className="demo-footnote">This is a safe, self-contained walkthrough. It does not call the receipt API, alter your configured rails, or move funds.</p>
  </main>
 </div>;
}
