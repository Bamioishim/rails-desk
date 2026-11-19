"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/components/store";
import { verifyChain } from "@/lib/rails";

export default function ReceiptsPage() {
  const { receipts, legacyReceipts, receiptStatus, receiptError, refreshReceipts } = useStore();
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
        <div className="eyebrow">AUDIT LOG / 03</div>
        <h1 className="page-title">Receipt chain</h1>
        <p className="page-sub">This is the same append-only file written by app decisions and checked by the receipt verifier.</p>
      </div>
      <div className="action-row">
        <button className="button ghost" onClick={() => void refreshReceipts()}>Refresh</button>
        <button className="button" onClick={exportReceipts}>Export JSON</button>
      </div>
    </div>
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
    {legacyReceipts.length > 0 && <div className="panel" style={{ marginTop: 15 }}>
      <div className="section-head"><div><h2 className="panel-title">Preserved browser history</h2><div className="panel-desc">Existing localStorage receipts are preserved as legacy history. They are not migrated into or mixed with the file chain.</div></div><span className={legacyStatus?.valid ? "tag neutral" : "tag red"}>{legacyStatus === null ? "VERIFYING" : legacyStatus.valid ? "LEGACY VALID" : "LEGACY BROKEN"}</span></div>
      <div className="receipt-list">{legacyReceipts.map((r) => <div className="receipt-row" key={r.id}><div><div className="receipt-title">#{r.index} · {r.recipient} · {r.decision}</div><div className="receipt-meta">{r.decisionReason}</div></div><div className="receipt-amount">{r.amount}</div></div>)}</div>
    </div>}
  </>;
}

