"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { DEFAULT_RAILS, type Rails, type Receipt, type Proposal, checkProposal, appendReceipt } from "@/lib/rails";
type Store = {
 rails: Rails; setRails: (r: Rails) => void; receipts: Receipt[]; pending: Proposal | null;
 pendingApproved: boolean; propose: (p: Omit<Proposal,"id"|"createdAt">) => Proposal;
 decide: (decision: "approved"|"refused"|"cancelled", reason?: string) => Promise<void>;
 executeApproved: () => Promise<void>; clearPending: () => void;
};
const Ctx = createContext<Store | null>(null);
export function StoreProvider({children}:{children:React.ReactNode}) {
 const [rails,setRailsState]=useState<Rails>(DEFAULT_RAILS);
 const [receipts,setReceipts]=useState<Receipt[]>([]);
 const [pending,setPending]=useState<Proposal|null>(null);
 const [pendingApproved,setPendingApproved]=useState(false);
 const [ready,setReady]=useState(false);
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{try{const r=localStorage.getItem("rails-desk-rails");const c=localStorage.getItem("rails-desk-receipts");if(r)setRailsState(JSON.parse(r));if(c)setReceipts(JSON.parse(c));}catch{}setReady(true)},[]);
 useEffect(()=>{if(ready)localStorage.setItem("rails-desk-rails",JSON.stringify(rails))},[rails,ready]);
 useEffect(()=>{if(ready)localStorage.setItem("rails-desk-receipts",JSON.stringify(receipts))},[receipts,ready]);
 const setRails=(r:Rails)=>setRailsState({spendingCap:Math.max(0,Number(r.spendingCap)||0),allowedRecipients:r.allowedRecipients.map(x=>x.trim()).filter(Boolean)});
 const propose=(p:Omit<Proposal,"id"|"createdAt">)=>{const proposal={...p,id:crypto.randomUUID(),createdAt:new Date().toISOString()};setPending(proposal);setPendingApproved(false);return proposal};
 const decide=async(decision:"approved"|"refused"|"cancelled",reason?:string)=>{
  if(!pending)return;
  if(decision==="approved"){
   const check=checkProposal(pending,rails);
   if(check.decision==="approved"){setPendingApproved(true);return;}
   const next=await appendReceipt(receipts,pending,"refused",check.reason);setReceipts(next);setPending(null);setPendingApproved(false);return;
  }
  const next=await appendReceipt(receipts,pending,decision,reason??(decision==="cancelled"?"Cancelled before execution.":"Refused by user during review."));
  setReceipts(next);setPending(null);setPendingApproved(false);
 };
 const executeApproved=async()=>{
  if(!pending||!pendingApproved)return;
  const check=checkProposal(pending,rails);
  const next=await appendReceipt(receipts,pending,check.decision==="approved"?"approved":"refused",check.decision==="approved"?"Approved and executed (mock) after passing the configured rails.":check.reason);
  setReceipts(next);setPending(null);setPendingApproved(false);
 };
 const value:Store={rails,setRails,receipts,pending,pendingApproved,propose,decide,executeApproved,clearPending:()=>{setPending(null);setPendingApproved(false)}};
 return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useStore(){const v=useContext(Ctx);if(!v)throw new Error("StoreProvider missing");return v}
