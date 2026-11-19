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
   <div className="hero-kicker"><i/> YOUR AGENT, WITH GUARDRAILS <span>Â·</span> LOCAL DEMO</div>
   <h1 className="hero-title">Your agent proposes.<br/><em>Your rails decide.</em></h1>
   <p className="hero-copy">Give an agent room to work without handing over the keys. Rails Desk checks each proposed action against the boundaries you set, then records the decision.</p>
   <div className="hero-actions"><Link href="#proposal" className="button">Create a proposal <span>â†˜</span></Link><Link href="/rails" className="button ghost">Configure your rails</Link></div>
   <div className="hero-metrics"><span><strong>{rails.spendingCap.toLocaleString()}</strong> max per action</span><span><strong>{rails.allowedRecipients.length}</strong> allowed recipients</span><span><strong>{receipts.length}</s¶»§q«^