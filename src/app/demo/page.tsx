"use client";

import Link from "next/link";
import {useEffect, useRef, useState} from "react";
import type {Address, Hex} from "viem";
import {evaluatePolicyCircuit, POLICY_GATE_COUNT, type PolicyOutputs} from "@/lib/policy-circuit";
import {evaluatePolicyOnchain, isTapeName, parseTapeName, resolveTapeIdentity, type OnchainPolicyResult, type TapeIdentity} from "@/lib/tapeout";
import {connectWallet, injectedProvider, receiptAnchor, sendRailTransfer, transferSettings, type TransferResult} from "@/lib/xlayer-wallet";
import {addressUrl, txUrl, xLayer, xLayerTestnet, XLAYER_FAUCET_URL} from "@/lib/chains";
import {allowedTapeNames, DEMO_ALLOWED, DEMO_CAP, DEMO_REVIEW_LIMIT, namedPayees} from "@/lib/demo-config";
import {saveOnchainReceipt} from "@/lib/onchain-receipts";

type Stage = "idle" | "typing" | "review" | "approved" | "refused" | "complete";
type Mode = "mock" | "xlayer";
type DemoReceipt = {recipient:string;amount:number;decision:string;reason:string;tx?:TransferResult;anchor?:Hex};

const wait = (ms:number) => new Promise<void>(resolve => window.setTimeout(resolve,ms));
const short = (a:string) => `${a.slice(0,6)}…${a.slice(-4)}`;
const isAllowlisted = (recipient:string) => {
 const r=recipient.trim().toLowerCase();
 if(DEMO_ALLOWED.some(name=>name.toLowerCase()===r)) return true;
 const tape=parseTapeName(recipient);
 return !!tape&&allowedTapeNames().some(n=>parseTapeName(n)?.label===tape.label);
};
const circuitLabel = (o:PolicyOutputs) => o.blocked?"Blocked":o.needsReview?"Needs your OK":"Approved";

export default function GuidedDemoPage(){
 const [recipient,setRecipient]=useState("Alex");
 const [amount,setAmount]=useState("12");
 const [reason,setReason]=useState("Monthly team expense reimbursement");
 const [stage,setStage]=useState<Stage>("idle");
 const [auto,setAuto]=useState(false);
 const [receipt,setReceipt]=useState<DemoReceipt|null>(null);
 const [note,setNote]=useState("The demo uses its own temporary state. It will not change your rails or add entries to your receipt history.");
 const [mode,setMode]=useState<Mode>("mock");
 const [account,setAccount]=useState<Address|null>(null);
 const [walletError,setWalletError]=useState<string|null>(null);
 const [identity,setIdentity]=useState<TapeIdentity|null>(null);
 const [onchainPolicy,setOnchainPolicy]=useState<OnchainPolicyResult|null>(null);
 const [busy,setBusy]=useState(false);
 const [hasWallet,setHasWallet]=useState(false);
 const runId=useRef(0);

 useEffect(()=>()=>{runId.current+=1;},[]);
 // Wallet extensions inject after hydration, so detect them on the client only.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{setHasWallet(!!injectedProvider());},[]);

 const value=Number(amount);
 const circuit=evaluatePolicyCircuit({amount:value,maxPerAction:DEMO_CAP,reviewLimit:DEMO_REVIEW_LIMIT,allowlisted:isAllowlisted(recipient)});
 const unit=mode==="xlayer"?"USD":"credits";

 const reset=()=>{
  runId.current+=1;setAuto(false);setRecipient("Alex");setAmount("12");setReason("Monthly team expense reimbursement");setStage("idle");setReceipt(null);setIdentity(null);setOnchainPolicy(null);
  setNote("The demo uses its own temporary state. It will not change your rails or add entries to your receipt history.");
 };
 const play=async()=>{
  const id=++runId.current;setAuto(true);setReceipt(null);setStage("typing");setIdentity(null);setOnchainPolicy(null);
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
 const refuseWith=(reasonText:string,noteText:string)=>{setStage("refused");setReceipt({recipient,amount:value,decision:"Refused",reason:reasonText});setNote(noteText);};
 const submit=async()=>{
  setIdentity(null);setOnchainPolicy(null);
  if(!Number.isFinite(value)||value<=0){refuseWith("Amount must be greater than zero.","Blocked: the amount must be a positive number.");return;}
  if(value>DEMO_CAP){refuseWith(`Amount exceeds the demo cap of ${DEMO_CAP} ${unit}.`,`Blocked: this proposal exceeds the ${DEMO_CAP}-${unit==="USD"?"dollar":"credit"} spending cap.`);return;}
  if(!isAllowlisted(recipient)){refuseWith("Recipient is not on the demo allowlist.","Blocked: this recipient is not on the allowed list.");return;}
  setBusy(true);
  try{
   if(isTapeName(recipient)){
    setNote("Looking up this TapeOut identity on X Layer…");
    try{setIdentity(await resolveTapeIdentity(recipient));}
    catch(error){refuseWith(error instanceof Error?error.message:"TapeOut identity not found on X Layer.","Blocked: the TapeOut identity could not be verified on X Layer.");return;}
   }
   const input={amount:value,maxPerAction:DEMO_CAP,reviewLimit:DEMO_REVIEW_LIMIT,allowlisted:true};
   const onchain=await evaluatePolicyOnchain(input);setOnchainPolicy(onchain);
   if(onchain.status==="ok"&&JSON.stringify(onchain.outputs)!==JSON.stringify(evaluatePolicyCircuit(input))){refuseWith("The on-chain circuit and the local check disagree.","Blocked: the TapeOut circuit on X Layer returned a different decision, so nothing can run.");return;}
  }finally{setBusy(false);}
  setReceipt(null);setStage("review");
  setNote(circuit.needsReview?`Above the ${DEMO_REVIEW_LIMIT}-${unit==="USD"?"dollar":"credit"} review limit, so it needs your OK. No transfer has occurred.`:"Within the demo policy. The proposal is waiting for your explicit approval. No transfer has occurred.");
 };
 const approve=()=>{setStage("approved");setNote(mode==="xlayer"?"Approved. Sending still needs a separate step, signed in your own wallet on X Layer testnet.":"Approved in the walkthrough. This still does not execute anything.");};
 const execute=()=>{setReceipt({recipient,amount:value,decision:"Executed (mock)",reason:"Manually completed in the isolated demo."});setStage("complete");setNote("Recorded in this demo page only. No funds moved and no persistent receipt was written.");};
 const executeOnchain=async()=>{
  if(!account){setWalletError("Connect a wallet first.");return;}
  setBusy(true);setWalletError(null);setNote("Confirm the transfer in your wallet. It runs on X Layer testnet, so it uses test OKB with no real value.");
  try{
   const payTo=(identity?.payTo??namedPayees()[recipient.trim().toLowerCase()]??account) as Address;
   const payload={app:"rails-desk",version:1,timestamp:new Date().toISOString(),recipient:recipient.trim(),payTo,amount:value,reason,rails:{maxPerAction:DEMO_CAP,reviewLimit:DEMO_REVIEW_LIMIT,allowlisted:true},circuit,tapeIdentity:identity?.label??null};
   const anchor=await receiptAnchor(payload);
   const tx=await sendRailTransfer({to:payTo,amountUsd:value,anchor});
   if(tx.status!=="success") throw new Error("The transfer reverted on X Layer testnet.");
   saveOnchainReceipt({id:crypto.randomUUID(),timestamp:payload.timestamp,recipient:payload.recipient,payTo,amount:value,reason,decision:"Executed on X Layer testnet",circuit,circuitSource:onchainPolicy?.status==="ok"?"onchain":"local",tapeIdentity:identity?.label,anchor,txHash:tx.hash,chainId:tx.chainId,asset:tx.asset,units:tx.units,blockNumber:tx.blockNumber});
   setReceipt({recipient,amount:value,decision:"Executed on X Layer testnet",reason:`Sent ${tx.units} ${tx.asset} to ${short(payTo)} in block ${tx.blockNumber}.`,tx,anchor});
   setStage("complete");setNote(tx.anchored?"Done. The receipt hash is written into the transfer itself, so anyone can check it on the explorer.":"Done. The recipient is a contract, so the receipt hash was kept off the transfer.");
  }catch(error){
   const e=error as {details?:string;shortMessage?:string;message?:string};
   const message=(e?.details||e?.shortMessage||e?.message||"The transfer did not go through.").split("\n")[0];
   setWalletError(message);setNote("Nothing was sent. You can try again or cancel instead.");
  }finally{setBusy(false);}
 };
 const refuse=()=>{setStage("refused");setReceipt({recipient,amount:value,decision:"Refused",reason:"Manually refused in the isolated demo."});setNote("Refusal shown in the walkthrough only. Nothing was sent.");};
 const connect=async()=>{
  setWalletError(null);
  try{setAccount(await connectWallet());setMode("xlayer");}
  catch(error){setWalletError(error instanceof Error?error.message.split("\n")[0]:"Could not connect a wallet.");}
 };
 const pickMode=(next:Mode)=>{if(auto)return;setMode(next);setReceipt(null);if(stage!=="idle")setStage("idle");setWalletError(null);
  setNote(next==="xlayer"?"X Layer mode: approved transfers are signed in your wallet and sent on X Layer testnet. Amounts are in dollars.":"The demo uses its own temporary state. It will not change your rails or add entries to your receipt history.");};
 const settings=transferSettings();

 return <div className="reference-home demo-home">
  <header className="ref-nav">
   <div className="ref-wrap ref-nav-in">
    <Link className="ref-brand" href="/"><img src="/rails-desk-mark.svg" alt=""/>rails desk</Link>
    <nav className="ref-links">
     <Link href="/#about">About</Link><Link href="/#features">Features</Link><Link href="/#how">How it works</Link><Link href="/xlayer">X Layer</Link>
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
    <div><span className="demo-pill">{mode==="xlayer"?"X Layer testnet":"Isolated demo"}</span><span className="demo-toolbar-copy">{mode==="xlayer"?"Approved transfers are real testnet transactions. Test OKB has no value.":"No shared policy or receipt data is changed."}</span></div>
    <div className="demo-actions">
     <button className="ref-btn ref-primary" onClick={()=>void play()} disabled={auto||mode==="xlayer"}>{auto?"Playing":"Play walkthrough"}</button>
     <button className="ref-btn ref-secondary" onClick={takeControl} disabled={!auto}>Take control</button>
     <button className="ref-btn ref-secondary" onClick={reset}>Restart</button>
    </div>
   </div>
   <div className="demo-toolbar">
    <div><span className="demo-pill">Rails mode</span><span className="demo-toolbar-copy">{account?<>Wallet <a href={addressUrl(xLayerTestnet,account)} target="_blank" rel="noreferrer">{short(account)}</a> on {xLayerTestnet.name}</>:hasWallet?"Connect a wallet to send approved transfers on X Layer testnet.":"No wallet found. Demo mode still works without one."}</span></div>
    <div className="demo-actions">
     <button className={mode==="mock"?"ref-btn ref-primary":"ref-btn ref-secondary"} onClick={()=>pickMode("mock")} disabled={auto||busy}>Demo (mock)</button>
     <button className={mode==="xlayer"?"ref-btn ref-primary":"ref-btn ref-secondary"} onClick={()=>account?pickMode("xlayer"):void connect()} disabled={auto||busy}>{account?"X Layer testnet":"Connect wallet"}</button>
    </div>
   </div>
   <div className="demo-progress" aria-label="Walkthrough progress">
    <span className={stage!=="idle"?"done":""}>01 Propose</span><i/>
    <span className={["approved","refused","complete"].includes(stage)?"done":stage==="review"?"current":""}>02 Check</span><i/>
    <span className={stage==="complete"||stage==="refused"?"done":""}>03 Record</span>
   </div>
   <div className="demo-grid">
    <section className="demo-panel">
     <div className="demo-section-head"><div><h2>Control room</h2><p>{mode==="xlayer"?"An agent is asking to make a transfer on X Layer testnet.":"An agent is asking to make a mock transfer."}</p></div><span className="demo-pill">Rules active</span></div>
     <div className="demo-field"><label htmlFor="demo-recipient">Recipient</label><input id="demo-recipient" value={recipient} onChange={e=>setRecipient(e.target.value)} disabled={auto||busy}/><span>Allowed recipients in this walkthrough: Alex, Jordan and Sam, plus TapeOut identities {allowedTapeNames().join(", ")}.</span></div>
     <div className="demo-field"><label htmlFor="demo-amount">Amount · {mode==="xlayer"?"dollars":"demo credits"}</label><input id="demo-amount" type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} disabled={auto||busy}/><span>Maximum per action: {DEMO_CAP} {unit}. Review limit: {DEMO_REVIEW_LIMIT}.{mode==="xlayer"&&(settings.token?" Paid in the configured testnet token.":` Paid as test OKB at ${settings.okbPerUsd} OKB per dollar.`)}</span></div>
     <div className="demo-field"><label htmlFor="demo-reason">What the agent wants to do</label><textarea id="demo-reason" value={reason} onChange={e=>setReason(e.target.value)} disabled={auto||busy}/></div>
     <div className="demo-actions demo-submit">
      <button className="ref-btn ref-primary" onClick={()=>void submit()} disabled={auto||busy||stage==="approved"||stage==="complete"}>{busy&&stage!=="approved"?"Checking":"Check against rails"}</button>
      {stage==="review"&&<><button className="ref-btn ref-primary" onClick={approve} disabled={auto}>Approve</button><button className="ref-btn ref-secondary" onClick={refuse} disabled={auto}>Refuse</button></>}
      {stage==="approved"&&<>{mode==="xlayer"
       ?<button className="ref-btn ref-primary" onClick={()=>void executeOnchain()} disabled={auto||busy}>{busy?"Waiting for wallet":"Send on X Layer testnet"}</button>
       :<button className="ref-btn ref-primary" onClick={execute} disabled={auto}>Execute mock transfer</button>}
       <button className="ref-btn ref-secondary" onClick={refuse} disabled={auto||busy}>Cancel instead</button></>}
     </div>
     {walletError&&<p className="demo-footnote" role="alert">{walletError}{mode==="xlayer"&&<> Need test OKB? Use the <a href={XLAYER_FAUCET_URL} target="_blank" rel="noreferrer">X Layer faucet</a>.</>}</p>}
    </section>
    <aside className="demo-panel">
     <div className="demo-section-head"><div><h2>Referee decision</h2><p>Deterministic checks, not an agent&apos;s opinion.</p></div><span className="demo-pill">{stage==="idle"||stage==="typing"?"Waiting":stage==="review"?"Review":stage==="approved"?"Approved":stage==="refused"?"Refused":"Complete"}</span></div>
     <div className="demo-notice">{note}</div>
     <div className="demo-rule"><span>01</span><div><strong>Spending cap</strong><p>{value>0&&value<=DEMO_CAP? `Amount is within the ${DEMO_CAP}-${unit==="USD"?"dollar":"credit"} maximum.`:`Amount must be positive and no more than ${DEMO_CAP} ${unit}.`}</p></div></div>
     <div className="demo-rule"><span>02</span><div><strong>Recipient allowlist</strong><p>{isAllowlisted(recipient)? "Recipient is on the walkthrough allowlist.":"Recipient is not on the walkthrough allowlist."}{identity&&<> Verified on X Layer: circuit {identity.label} on {identity.processorName}, held by <a href={addressUrl(xLayer,identity.holder)} target="_blank" rel="noreferrer">{short(identity.holder)}</a>{identity.opened?<>, container <a href={addressUrl(xLayer,identity.container)} target="_blank" rel="noreferrer">{short(identity.container)}</a></>:", container not opened yet"}.</>}</p></div></div>
     <div className="demo-rule"><span>03</span><div><strong>Human control</strong><p>{mode==="xlayer"?"Approval and the wallet signature are separate steps.":"Approval and mock execution are separate steps."}</p></div></div>
     <div className="demo-rule"><span>04</span><div><strong>TapeOut policy circuit</strong><p>{circuitLabel(circuit)}, from a {POLICY_GATE_COUNT}-gate NAND circuit in TapeOut&apos;s format.{onchainPolicy?.status==="ok"&&<> Confirmed by <code>eval</code> on circuit #{onchainPolicy.id} on X Layer.</>}{onchainPolicy?.status==="mismatch"&&<> The configured circuit on X Layer does not match: {onchainPolicy.detail}</>}{onchainPolicy?.status==="error"&&<> X Layer check unavailable: {onchainPolicy.detail}</>}</p></div></div>
     {receipt&&<div className="demo-receipt"><div className="demo-receipt-title">{receipt.recipient} · {receipt.amount} {unit}</div><div className="demo-receipt-meta">{receipt.decision}</div><p>{receipt.reason}</p>
      {receipt.tx?<><div className="demo-hash">Tx <a href={txUrl(xLayerTestnet,receipt.tx.hash)} target="_blank" rel="noreferrer">{receipt.tx.hash}</a></div><div className="demo-hash">Receipt hash {receipt.tx.anchored?"in calldata":"(not embedded)"} · {receipt.anchor}</div></>
       :<div className="demo-hash">Demo receipt · Not in persistent chain</div>}</div>}
    </aside>
   </div>
   <p className="demo-footnote">{mode==="xlayer"?<>X Layer mode sends real transactions on X Layer testnet only, signed in your own wallet. TapeOut reads come from X Layer mainnet and cost nothing. <Link href="/xlayer">See onchain status and receipts</Link>.</>:"This is a safe, self-contained walkthrough. It does not call the receipt API, alter your configured rails, or move funds."}</p>
  </main>
 </div>;
}
