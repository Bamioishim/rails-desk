"use client";
import {useState} from "react";
import Link from "next/link";
import {useStore} from "@/components/store";
import {checkProposal} from "@/lib/rails";

export default function ProposePage(){
 const {rails,receipts,pending,pendingApproved,propose,decide,executeApproved}=useStore();
 const [amount,setAmount]=useState("10");
 const [recipient,setRecipient]=useState("Alex");
 const [reason,setReason]=useState("Monthly team expense reimbursement");
 const preview=checkProposal({amount:Number(amount),recipient},rails);
 const submit=(e:React.FormEvent)=>{e.preventDefault();propose({amount:Number(amount),recipient:recipient.trim(),reason});};
 return <>
  <section className="home-hero">
   <div className="hero-kicker"><i/> YOUR AGENT, WITH GUARDRAILS <span>·</span> LOCAL DEMO</div>
   <h1 className="hero-title">Your agent proposes.<br/><em>Your rails decide.</em></h1>
   <p className="hero-copy">Give an agent room to work without handing over the keys. Rails Desk checks each proposed action against the boundaries you set, then records the decision.</p>
   <div className="hero-actions"><Link href="#proposal" className="button">Create a proposal <span>↘</span></Link><Link href="/rails" className="button ghost">Configure your rails</Link></div>
   <div className="hero-metrics"><span><strong>{rails.spendingCap.toLocaleString()}</strong> max per action</span><span><strong>{rails.allowedRecipients.length}</strong> allowed recipients</span><span><strong>{receipts.length}</strong> recorded decisions</span></div>
  </section>

  <section className="prompt-stage" id="proposal">
   <h2 className="stage-title">Put a proposal through its paces.</h2>
   <div className="prompt-window">
    <div className="prompt-window-head"><div className="prompt-window-brand"><b>r.</b> Rails Desk <span style={{fontWeight:400,color:"#a39286"}}> / Control room</span></div><span className="local-status"><i/> Rules active</span></div>
    <div className="prompt-window-body">
     <aside className="prompt-sidebar"><div className="prompt-sidebar-label">YOUR WORKSPACE</div><div className="prompt-side-item active">◉ New proposal<small>Review an agent action</small></div><Link href="/rails" className="prompt-side-item">⌘ Policy rails<small>{rails.allowedRecipients.length} trusted recipients</small></Link><Link href="/receipts" className="prompt-side-item">▤ Receipt chain<small>{receipts.length} recorded decisions</small></Link></aside>
     <div className="prompt-main">
      {pending? <div className="proposal-card" style={{margin:0}}>
       <div className="section-head"><div><h3 className="panel-title">Proposal awaiting review</h3><div className="panel-desc">Submitted {new Date(pending.createdAt).toLocaleString()}</div></div><span className="tag">HUMAN REVIEW</span></div>
       <div className="receipt-row"><div><div className="receipt-title">{pending.recipient}</div><div className="receipt-meta">{pending.reason}</div></div><div className="receipt-amount">{pending.amount.toLocaleString()} <small>credits</small></div></div>
       <div className={checkProposal(pending,rails).decision==="approved"?"notice":"notice warn"}><strong>{checkProposal(pending,rails).decision==="approved"?"Within your rails":"Blocked by your rails"}</strong><br/>{checkProposal(pending,rails).reason}</div>
       {pendingApproved?<><p className="hint">Approved for mock execution. You can still cancel before recording the execution.</p><div className="action-row"><button className="button" onClick={()=>void executeApproved()}>Execute mock transfer</button><button className="button danger" onClick={()=>void decide("cancelled")}>Cancel instead</button></div></>:<div className="action-row"><button className="button" disabled={checkProposal(pending,rails).decision!=="approved"} onClick={()=>void decide("approved")}>Approve proposal</button><button className="button danger" onClick={()=>void decide("refused")}>Refuse</button><button className="button ghost" onClick={()=>void decide("cancelled")}>Cancel</button></div>}
      </div>:<>
       <div className="prompt-bubble">Can I send a transfer for review?</div>
       <div className="prompt-response">
        <div className="prompt-response-head"><span>Referee preview</span><span className={preview.decision==="approved"?"status-pill":"status-pill refused"}>{preview.decision==="approved"?"Within rails":"Blocked"}</span></div>
        <p><span className="prompt-check">✓</span> Spending cap: up to {rails.spendingCap.toLocaleString()} credits</p>
        <p><span className="prompt-check">✓</span> Recipient must be on your allowlist</p>
        <p><span className="prompt-check">✓</span> Proposal reason is treated as untrusted input</p>
        <div className={preview.decision==="approved"?"notice":"notice warn"} style={{marginTop:13}}>{preview.reason}</div>
       </div>
       <form onSubmit={submit} style={{marginTop:16}}>
        <div className="field"><label htmlFor="recipient">Recipient</label><input id="recipient" value={recipient} onChange={e=>setRecipient(e.target.value)} placeholder="e.g. Alex" required/><div className="recipient-chips">{rails.allowedRecipients.slice(0,5).map(x=><button type="button" key={x} className="recipient-chip" onClick={()=>setRecipient(x)}>{x}</button>)}</div></div>
        <div className="field"><label htmlFor="amount">Transfer amount · credits</label><input id="amount" type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} required/></div>
        <div className="field"><label htmlFor="reason">Reason from the agent</label><textarea id="reason" value={reason} onChange={e=>setReason(e.target.value)} maxLength={500} required/></div>
        <div className="prompt-input"><span>Proposal details stay in this local browser</span><button className="button button-small" type="submit">Submit for review ↗</button></div>
       </form>
      </>}
     </div>
    </div>
   </div>
   <div className="stage-steps"><span>① <b>You set the rails</b></span><span>② <b>Agent proposes</b></span><span>③ <b>You approve or refuse</b></span></div>
  </section>

  <section className="trust-strip"><strong>CONTROL THAT STAYS WITH YOU</strong><div className="trust-wordmarks"><span>Spending caps</span><span>Allowlist</span><span>Human approval</span><span>Receipt chain</span></div></section>

  <section className="how-section">
   <div className="section-eyebrow">HOW RAILS DESK WORKS</div>
   <h2 className="how-title">One control layer for every proposal. <span>Boundaries in, accountable actions out.</span></h2>
   <div className="how-grid">
    <article className="how-card"><div className="how-number">01</div><h3>Set your boundaries.</h3><p>Choose a maximum transfer amount and explicitly trusted recipients. Your policy is checked again when a proposal is approved.</p><Link href="/rails" className="mono">CONFIGURE RAILS ↗</Link></article>
    <article className="how-card"><div className="how-number">02</div><h3>Review the proposal.</h3><p>Each request is evaluated against your rules. A persuasive explanation cannot override a spending limit or recipient restriction.</p><Link href="#proposal" className="mono">TRY A PROPOSAL ↗</Link></article>
    <article className="how-card"><div className="how-number">03</div><h3>Keep a clear record.</h3><p>Approvals, refusals and cancellations are recorded in a locally stored, hash-linked receipt chain you can verify and export.</p><Link href="/receipts" className="mono">VIEW RECEIPTS ↗</Link></article>
   </div>
  </section>

  <section className="cta-band"><div><h2>More room for agents.<br/>Clearer boundaries for you.</h2><p>Start with a simple policy. Every proposal gets checked before it can be recorded.</p></div><Link href="/rails" className="button">Set up your rails ↗</Link></section>
 </>;
}
