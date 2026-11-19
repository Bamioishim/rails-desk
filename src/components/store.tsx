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
 const setRails=(r:Rails)=>setRailsState({spendingCap:Mat¶»§q«^