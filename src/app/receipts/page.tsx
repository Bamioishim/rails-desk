"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/components/store";
import { verifyChain } from "@/lib/rails";
import Link from "next/link";
import { useDesk } from "@/components/desk";
import { receiptAnchor, sendReceiptHeadAnchor, sendTestnetOkbTransfer, transferSettings } from "@/lib/xlayer-wallet";
import { XLAYER_FAUCET_URL } from "@/lib/chains";

const outcomeLabel = { approved: "approved", needs_review: "needs your OK", blocked: "blocked", refused: "refused" } as const;
const outcomeTag = (o: keyof typeof outcomeLabel) => (o === "approved" ? "tag green" : o === "needs_review" ? "tag neutral" : "tag red");
const outcomeSummary = (o: keyof typeof outcomeLabel, detail: string, reviewed = false) => reviewed && o === "approved" ? "Approved by you after review." : o === "approved" ? "Transfer approved." : o === "needs_review" ? "Transfer needs your approval." : o === "refused" ? "Transfer refused by you." : detail.toLowerCase().includes("maximum") || detail.toLowerCase().includes("limit") ? "Transfer blocked. " + detail : "Transfer blocked by your allowed-recipient rules.";

export default function ReceiptsPage() {
  const { receipts, legacyReceipts, receiptStatus, receiptError, refreshReceipts } = useStore();
  const d = useDesk(4000);
  const [busy, setBusy] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [deskErr, setDeskErr] = useState<string | null>(null);
  const [settling, setSettling] = useState<string | null>(null);
  const [payTo, setPayTo] = useState("");
  const [anchoring, setAnchoring] = useState(false);
  const [unrecordedSettlement, setUnrecordedSettlement] = useState<{ proposalId: string; txHash: string; payTo: string; anchor: string } | null>(null);
  const desk = d.desk;
  const pending = desk ? desk.proposals.filter((p) => p.status === "needs_review" && !p.review) : [];
  const approvedUnsettled = desk ? desk.proposals.filter((p) => (p.status === "approved" || p.review?.decision === "approved") && !p.settlement) : [];
  const act = async (id: string, decision: "approve" | "refuse") => { setBusy(id); setDeskErr(null); try { await d.decide(id, decision); setReviewing(null); } catch (e) { setDeskErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); } };
  const anchorHead = async () => {
    if (!desk?.receipts.length) return;
    const head = desk.receipts.at(-1);
    if (!head) return;
    setAnchoring(true); setDeskErr(null);
    try {
      const sent = await sendReceiptHeadAnchor({ headHash: `0x${head.hash}` });
      await d.recordAnchor({ txHash: sent.hash, receiptHash: head.hash, receiptIndex: head.index });
    } catch (e) {
      setDeskErr(e instanceof Error ? e.message : String(e));
    } finally { setAnchoring(false); }
  };
  const settle = async (proposalId: string) => {
    if (!desk) return;
    const proposal = desk.proposals.find((p) => p.id === proposalId);
    if (!proposal) return;
    const originalReceipt = desk.receipts.find((r) => r.id === proposal.receiptIds[0]);
    if (!originalReceipt) { setDeskErr("The original proposal receipt is missing; settlement is blocked."); return; }
    setBusy(proposalId); setDeskErr(null);
    try {
      const destination = payTo.trim().toLowerCase() as `0x${string}`;
      const anchor = await receiptAnchor({ proposalId: proposal.id, receiptHash: originalReceipt.hash, payTo: destination, amount: proposal.amount });
      const sent = await sendTestnetOkbTransfer({ to: destination, amountCredits: proposal.amount, anchor });
      const pendingRecord = { proposalId: proposal.id, txHash: sent.hash, payTo: destination, anchor };
      setUnrecordedSettlement(pendingRecord);
      await d.recordSettlement(proposal.id, { txHash: sent.hash, payTo: destination, anchor });
      setUnrecordedSettlement(null);
      setSettling(null); setPayTo("");
    } catch (e) {
      setDeskErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  };
  const retrySettlementRecord = async () => {
    if (!unrecordedSettlement) return;
    setBusy(unrecordedSettlement.proposalId); setDeskErr(null);
    try {
      await d.recordSettlement(unrecordedSettlement.proposalId, { txHash: unrecordedSettlement.txHash, payTo: unrecordedSettlement.payTo, anchor: unrecordedSettlement.anchor });
      setUnrecordedSettlement(null); setSettling(null); setPayTo("");
    } catch (e) {
      setDeskErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  };
  const proposalForReceipt = (proposalId: string) => desk?.proposals.find((p) => p.id === proposalId);
  const displayedOutcome = (r: NonNullable<typeof desk>["receipts"][number]) => proposalForReceipt(r.proposalId)?.review?.decision ?? r.outcome;
  const exportDesk = () => { if (!desk) return; const blob = new Blob([JSON.stringify(desk.receipts, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "rails-desk-receipts.json"; a.click(); URL.revokeObjectURL(url); };
  const [legacyStatus, setLegacyStatus] = useState<{ valid: boolean; brokenAt: number | null } | null>(null);

  useEffect(() => {
    let live = true;
    verifyChain(legacyReceipts).then((result) => { if (live) setLegacyStatus(result); });
    return () => { live = false; };
  }, [legacyReceipts]);

  const exportReceipts = () => {
    const blob = new Blob([JSON.stringify(receipts, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "rails-desk-file-receipts.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <>
    <div className="page-head">
      <div>
        <div className="eyebrow">AUDIT LOG</div>
        <h1 className="page-title">Receipt chain</h1>
        <p className="page-sub">Every proposal your agent sends is decided by your rails and recorded here. Payments above your review limit wait for you.</p>
      </div>
      <div className="action-row">
        <button className="button ghost" onClick={() => { void d.refresh(); void refreshReceipts(); }}>Refresh</button>
        <button className="button" onClick={exportDesk} disabled={!desk}>Export JSON</button>
      </div>
    </div>
    {(deskErr || d.error) && <div className="notice warn" style={{ marginBottom: 16 }}>{deskErr || d.error}</div>}
    {d.ready && !d.keys && <div className="panel" style={{ marginBottom: 15 }}><div className="empty">No desk in this browser yet. <Link href="/rails">Set your rails</Link> to create one and connect your agent.</div></div>}
    {desk && <>
    <div className="stat-grid">
      <div className="stat-card"><div className="stat-label">Needs your OK</div><div className="stat-value">{pending.length}</div><div className="stat-foot">Above your review limit of {desk.rules.reviewLimit}</div></div>
      <div className="stat-card"><div className="stat-label">Approved</div><div className="stat-value">{desk.proposals.filter((p) => p.status === "approved" || p.review?.decision === "approved").length}</div><div className="stat-foot">By your rails or by you</div></div>
      <div className="stat-card"><div className="stat-label">Blocked / refused</div><div className="stat-value">{desk.proposals.filter((p) => p.status === "blocked" || p.review?.decision === "refused").length}</div><div className="stat-foot">No execution performed</div></div>
    </div>
    <div className="panel" style={{ marginBottom: 15 }} id="onchain-anchors">
      <div className="section-head"><div><h2 className="panel-title">On-chain receipt anchors</h2><div className="panel-desc">Periodically commit a receipt hash to X Layer testnet. The wallet signs a zero-value self-transaction; anyone can inspect its calldata independently.</div></div><span className="tag">{desk.anchors?.length ?? 0} ANCHORED</span></div>
      {(() => {
        const latest = desk.anchors?.at(-1);
        const latestIndex = latest?.receiptIndex ?? 0;
        const currentHead = desk.receipts.at(-1);
        const alreadyAnchored = !!latest && !!currentHead && latest.receiptIndex === currentHead.index && latest.receiptHash === currentHead.hash;
        const headIndex = currentHead?.index ?? 0;
        const due = headIndex > 0 && headIndex - latestIndex >= 25;
        return <><div className="receipt-meta">{latest ? `Latest anchor covers receipt #${latest.receiptIndex} · ${latest.receiptHash.slice(0, 18)}…` : "No receipt head has been anchored yet."} {due ? "· Another anchor is due." : "· Recommended interval: every 25 receipts."}</div>
          {latest && <div className="receipt-meta">Transaction <a href={`https://web3.okx.com/explorer/x-layer-testnet/tx/${latest.txHash}`} target="_blank" rel="noreferrer">{latest.txHash.slice(0, 18)}… ↗</a> · Block {latest.blockNumber}</div>}
          <button className="button button-small" style={{ marginTop: 10 }} onClick={() => void anchorHead()} disabled={anchoring || !desk.receipts.length || alreadyAnchored}>{anchoring ? "Waiting for wallet / confirmation…" : alreadyAnchored ? "Latest head already anchored" : "Anchor latest receipt head"}</button>
        </>;
      })()}
    </div>
    <div className="panel" id="review">
      <div className="section-head"><div><h2 className="panel-title">Pending transfers</h2><div className="panel-desc">These transfers stay pending until you approve or refuse them. Nothing is paid before approval.</div></div><span className={pending.length ? "tag neutral" : "tag"}>{pending.length} PENDING</span></div>
      {pending.length === 0 ? <div className="empty">Nothing waiting. Proposals above your review limit will appear here.</div> : <div className="receipt-list">{pending.map((p) => <div className="receipt-row" key={p.id}><div><div className="receipt-title">Transfer · {p.recipient} · {p.amount} credits</div><div className="receipt-meta">{outcomeSummary("needs_review", p.reasons[0] || "")}</div></div><div className="action-row"><button className="button button-small" disabled={busy === p.id} onClick={() => setReviewing(p.id)}>Approve</button></div></div>)}</div>}
    </div>
    <div className="panel" style={{ marginTop: 15 }} id="testnet-settlement">
      <div className="section-head"><div><h2 className="panel-title">Approved · ready for testnet settlement</h2><div className="panel-desc">Owner approval does not move funds. Choose a recipient wallet address to initiate a separate owner-signed X Layer testnet transfer.</div></div><span className="tag">{approvedUnsettled.length} READY</span></div>
      {approvedUnsettled.length === 0 ? <div className="empty">No approved proposals waiting for testnet settlement.</div> : <div className="receipt-list">{approvedUnsettled.map((p) => <div className="receipt-row" key={p.id}><div><div className="receipt-title">{p.recipient} · {p.amount} credits</div><div className="receipt-meta">{p.reason || "No reason supplied"} · approved, not yet settled</div></div><button className="button button-small" onClick={() => { setSettling(p.id); setPayTo(""); }}>Settle on testnet</button></div>)}</div>}
    </div>
    <div className="panel" style={{ marginTop: 15 }}>
      <div className="section-head"><div><h2 className="panel-title">Live activity log</h2><div className="panel-desc">Latest server-recorded app and demo events. Refreshes with the receipt chain.</div></div><span className="tag">{desk.receipts.length} EVENTS</span></div>
      {desk.receipts.length === 0 ? <div className="empty">No activity yet. New proposals and demo outcomes will appear here.</div> : <div className="receipt-list">{desk.receipts.slice().reverse().slice(0, 25).map((r) => <div className="receipt-row" key={r.id}><div><div className="receipt-title">{r.source === "demo" ? "Demo · " : "App · "}{r.event === "demo_activity" ? "Simulated outcome" : r.event === "settled_on_xlayer_testnet" ? "X Layer testnet settlement" : "Transfer"} · {r.recipient}</div><div className="receipt-meta">{new Date(r.at).toLocaleString()} · {r.amount} credits · {r.event === "settled_on_xlayer_testnet" ? r.detail : outcomeSummary(displayedOutcome(r), r.detail, proposalForReceipt(r.proposalId)?.review?.decision === "approved")}</div></div><div className="action-row receipt-actions">{r.outcome === "needs_review" && proposalForReceipt(r.proposalId)?.status === "needs_review" && !proposalForReceipt(r.proposalId)?.review && <button className="button button-small" onClick={() => setReviewing(r.proposalId)}>Approve</button>}<span className={outcomeTag(displayedOutcome(r))}>{outcomeLabel[displayedOutcome(r)]}</span></div></div>)}</div>}
    </div>
    <div className="panel" style={{ marginTop: 15 }}>
      <div className="section-head"><div><h2 className="panel-title">Decision history</h2><div className="panel-desc">Ordered oldest to newest. SHA-256 links recomputed by the server.</div></div><span className={desk.verification.valid ? "tag green" : "tag red"}>{desk.verification.valid ? "CHAIN VALID" : `CHAIN BROKEN AT #${desk.verification.brokenAt}`}</span></div>
      {desk.receipts.length === 0 ? <div className="empty">No receipts yet. <Link href="/rails#connect">Connect your agent</Link> or send a test proposal.</div> : <div className="table-wrap"><table><thead><tr><th>#</th><th>Decision</th><th>Recipient</th><th>Amount</th><th>Decision reason</th><th>Hash</th></tr></thead><tbody>{desk.receipts.map((r) => <tr key={r.id}><td className="mono">{String(r.index).padStart(3, "0")}</td><td><span className={outcomeTag(displayedOutcome(r))}>{r.event === "settled_on_xlayer_testnet" ? "settled on testnet" : outcomeLabel[displayedOutcome(r)]}</span></td><td>{r.source === "demo" ? "Demo · " : "App · "}{r.recipient}</td><td>{r.amount}</td><td style={{ maxWidth: 220 }}>{outcomeSummary(displayedOutcome(r), r.detail, r.event === "approved_by_owner")}</td><td><span className="mono" title={r.id}>{r.hash.slice(0, 16)}…</span></td></tr>)}</tbody></table></div>}
      {desk.receipts.slice().reverse().map((r) => <details id={`receipt-${r.id}`} key={r.id} style={{ borderTop: "1px solid var(--line)", padding: "11px 0" }}><summary style={{ cursor: "pointer", fontSize: 11 }}>Receipt #{r.index} · {r.source === "demo" ? "Simulated demo" : "App"} · {r.recipient} · {r.event === "settled_on_xlayer_testnet" ? "settled on testnet" : outcomeLabel[displayedOutcome(r)]}</summary><div style={{ display: "grid", gap: 7, marginTop: 12 }}><div className="hash"><b>Event</b><br />{r.event} · {r.at}</div><div className="hash"><b>Previous hash</b><br />{r.previousHash}</div><div className="hash"><b>Receipt SHA-256</b><br />{r.hash}</div>{desk.anchors?.filter((a) => a.receiptIndex === r.index && a.receiptHash === r.hash).map((a) => <div className="hash" key={a.txHash}><b>On-chain anchor · X Layer testnet</b><br />Transaction: <a href={`https://web3.okx.com/explorer/x-layer-testnet/tx/${a.txHash}`} target="_blank" rel="noreferrer">{a.txHash}</a><br />Block: {a.blockNumber}<br />Wallet: {a.from}</div>)}<div className="hash"><b>Recorded detail</b><br />{r.detail}</div>{r.event === "settled_on_xlayer_testnet" && <div className="hash"><b>Testnet settlement</b><br />Transaction: {(() => { const hash = desk.proposals.find((p) => p.id === r.proposalId)?.settlement?.txHash; return hash ? <a href={`https://web3.okx.com/explorer/x-layer-testnet/tx/${hash}`} target="_blank" rel="noreferrer">{hash} ↗</a> : "See proposal state"; })()}<br />Chain ID: 1952</div>}{r.policySnapshot ? <div className="hash"><b>Policy applied at this decision</b><br />Allowed recipients: {r.policySnapshot.rules.allowedRecipients.join(", ") || "None"}<br />Maximum per action: {r.policySnapshot.rules.maxPerAction}<br />Owner review limit: {r.policySnapshot.rules.reviewLimit}<br />Daily spend cap: {r.policySnapshot.rules.dailySpendCap ?? 100}</div> : <div className="hash"><b>Policy snapshot</b><br />{r.source === "demo" ? "This simulated demo event uses fixed walkthrough rules, not your configured policy." : "Not recorded for this older receipt."}</div>}{r.policySnapshot && <div className="hash"><b>Rule checks at this decision</b><br />{r.policySnapshot.checks.map((check) => <span key={check.rule} style={{ display: "block" }}>{check.passed ? "Passed" : "Failed"} · {check.detail}</span>)}</div>}</div></details>)}
    </div>
    {settling && (() => { const p = desk.proposals.find((item) => item.id === settling); if (!p) return null; return <div className="review-modal-backdrop" onClick={() => setSettling(null)}><section className="review-modal" role="dialog" aria-modal="true" aria-labelledby="settle-modal-title" onClick={(e) => e.stopPropagation()}><button className="review-modal-close" aria-label="Close settlement dialog" onClick={() => setSettling(null)} disabled={busy === p.id}>×</button><div className="eyebrow">XLAYER TESTNET</div><h2 className="panel-title" id="settle-modal-title">Settle approved proposal</h2><p className="panel-desc">This sends test OKB from your connected wallet. You must have testnet OKB and confirm the transaction in your wallet. The server verifies the mined transaction before recording settlement. <a href={XLAYER_FAUCET_URL} target="_blank" rel="noreferrer">Get test OKB from the faucet ↗</a></p><div className="review-modal-summary"><span>Approved recipient</span><strong>{p.recipient}</strong><span>Amount</span><strong>{p.amount} credits → {(p.amount * transferSettings().okbPerUsd).toFixed(8)} test OKB</strong></div><div className="field"><label htmlFor="settlement-payto">Recipient X Layer wallet address</label><input id="settlement-payto" value={payTo} onChange={(e) => setPayTo(e.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false} /></div>{unrecordedSettlement?.proposalId === p.id && <div className="notice warn">The wallet transaction was sent, but Rails Desk has not recorded its verification yet. Do not send again. Transaction: <span className="mono">{unrecordedSettlement.txHash}</span><button className="button button-small" style={{ marginTop: 8 }} onClick={() => void retrySettlementRecord()} disabled={busy === p.id}>{busy === p.id ? "Verifying…" : "Retry verification without sending again"}</button></div>}<div className="action-row"><button className="button primary" onClick={() => void settle(p.id)} disabled={busy === p.id || !/^0x[0-9a-fA-F]{40}$/.test(payTo.trim())}>{busy === p.id ? "Waiting for wallet / verification…" : "Connect wallet & send test OKB"}</button><button className="button ghost" onClick={() => setSettling(null)} disabled={busy === p.id}>Cancel</button></div></section></div>; })()}
    {reviewing && (() => { const p = desk.proposals.find((item) => item.id === reviewing); if (!p) return null; return <div className="review-modal-backdrop" onClick={() => setReviewing(null)}><section className="review-modal" role="dialog" aria-modal="true" aria-labelledby="review-modal-title" onClick={(e) => e.stopPropagation()}><button className="review-modal-close" aria-label="Close approval dialog" onClick={() => setReviewing(null)} disabled={busy === p.id}>×</button><div className="eyebrow">OWNER APPROVAL</div><h2 className="panel-title" id="review-modal-title">Approve this payment?</h2><p className="panel-desc">This records your approval for {p.recipient} · {p.amount} credits. No funds are transferred by this action.</p><div className="review-modal-summary"><span>Recipient</span><strong>{p.recipient}</strong><span>Amount</span><strong>{p.amount} credits</strong><span>Reason</span><strong>{p.reason || "Not provided"}</strong></div><div className="action-row"><button className="button" onClick={() => void act(p.id, "approve")} disabled={busy === p.id}>{busy === p.id ? "Approving…" : "Approve transfer"}</button><button className="button danger" onClick={() => void act(p.id, "refuse")} disabled={busy === p.id}>Refuse</button><button className="button ghost" onClick={() => setReviewing(null)} disabled={busy === p.id}>Cancel</button></div></section></div>; })()}
    </>}
    {receipts.length > 0 && <>
    <div className="section-head" style={{ marginTop: 26 }}><div><h2 className="panel-title">Earlier demo history</h2><div className="panel-desc">The append-only file written by the previous demo flow and checked by the receipt verifier.</div></div><button className="button ghost button-small" onClick={exportReceipts}>Export file JSON</button></div>
    {receiptError && <div className="notice warn" style={{ marginBottom: 16 }}>{receiptError}</div>}
    <div className="stat-grid">
      <div className="stat-card"><div className="stat-label">File receipts</div><div className="stat-value">{receipts.length}</div><div className="stat-foot">data/receipts.jsonl · server filesystem</div></div>
      <div className="stat-card"><div className="stat-label">Approved</div><div className="stat-value">{receipts.filter((r) => r.decision === "approved").length}</div><div className="stat-foot">Mock executions only</div></div>
      <div className="stat-card"><div className="stat-label">Refused / cancelled</div><div className="stat-value">{receipts.filter((r) => r.decision !== "approved").length}</div><div className="stat-foot">No execution performed</div></div>
    </div>
    <div className="panel">
      <div className="section-head">
        <div><h2 className="panel-title">File-chain integrity</h2><div className="panel-desc">SHA-256 links recomputed by the server-side verifier.</div></div>
        <span className={receiptStatus?.valid ? "tag" : "tag red"}>{receiptStatus === null ? "UNAVAILABLE" : receiptStatus.valid ? "CHAIN VALID" : "CHAIN BROKEN"}</span>
      </div>
      {receiptStatus?.valid && <div className="notice">All {receiptStatus.count} file receipt{receiptStatus.count === 1 ? "" : "s"} passed index, previous-hash and content-hash checks.</div>}
      {receiptStatus && !receiptStatus.valid && <div className="notice warn">Verification failed at entry #{receiptStatus.brokenAt}: {receiptStatus.error ?? "hash or link mismatch"}.</div>}
      {!receiptStatus && !receiptError && <div className="empty">Loading the file-backed receipt chain…</div>}
    </div>
    <div className="panel" style={{ marginTop: 15 }}>
      <div className="section-head"><div><h2 className="panel-title">File-backed decision history</h2><div className="panel-desc">Ordered oldest to newest. Every row is read from data/receipts.jsonl.</div></div><span className="tag">{receipts.length} ENTRIES</span></div>
      {receipts.length === 0 ? <div className="empty">No file receipts yet. Your first recorded decision will appear here.</div> : <div className="table-wrap"><table><thead><tr><th>#</th><th>Decision</th><th>Recipient</th><th>Amount</th><th>Decision reason</th><th>Hash</th></tr></thead><tbody>{receipts.map((r) => <tr key={r.id}><td className="mono">{String(r.index).padStart(3, "0")}</td><td><span className={r.decision === "approved" ? "tag" : r.decision === "refused" ? "tag red" : "tag neutral"}>{r.decision}</span></td><td>{r.recipient}</td><td>{r.amount}</td><td style={{ maxWidth: 190 }}>{r.decisionReason}</td><td><span className="mono">{r.hash.slice(0, 16)}…</span></td></tr>)}</tbody></table></div>}
      {receipts.map((r) => <details key={r.id} style={{ borderTop: "1px solid var(--line)", padding: "12px 0" }}><summary style={{ cursor: "pointer", fontSize: 11 }}>{"Receipt #" + r.index + " · " + r.recipient + " · " + r.decision}</summary><div style={{ display: "grid", gap: 7, marginTop: 12 }}><div className="hash"><b>Previous hash</b><br />{r.previousHash}</div><div className="hash"><b>Receipt hash</b><br />{r.hash}</div><div className="hash"><b>Agent reason</b><br />{r.reason}</div></div></details>)}
    </div>
    </>}
    {legacyReceipts.length > 0 && <div className="panel" style={{ marginTop: 15 }}>
      <div className="section-head"><div><h2 className="panel-title">Preserved browser history</h2><div className="panel-desc">Existing localStorage receipts are preserved as legacy history. They are not migrated into or mixed with the file chain.</div></div><span className={legacyStatus?.valid ? "tag neutral" : "tag red"}>{legacyStatus === null ? "VERIFYING" : legacyStatus.valid ? "LEGACY VALID" : "LEGACY BROKEN"}</span></div>
      <div className="receipt-list">{legacyReceipts.map((r) => <div className="receipt-row" key={r.id}><div><div className="receipt-title">#{r.index} · {r.recipient} · {r.decision}</div><div className="receipt-meta">{r.decisionReason}</div></div><div className="receipt-amount">{r.amount}</div></div>)}</div>
    </div>}
  </>;
}

