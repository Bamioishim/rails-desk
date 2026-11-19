"use client";
import { useEffect, useState } from "react";
import { POLICY_GATE_COUNT, POLICY_N_IN, POLICY_N_OUT, POLICY_NETLIST, policyNetlistDigest, toHex } from "@/lib/policy-circuit";
import { TAPEOUT_XLAYER, configuredPolicyCircuit, resolveTapeIdentity, tapeOutProcessorCount, type TapeIdentity } from "@/lib/tapeout";
import { verifyAnchor } from "@/lib/xlayer-wallet";
import { addressUrl, txUrl, xLayer, xLayerTestnet, XLAYER_FAUCET_URL } from "@/lib/chains";
import { allowedTapeNames } from "@/lib/demo-config";
import { loadOnchainReceipts, type OnchainReceipt } from "@/lib/onchain-receipts";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function XLayerPage() {
  const [processors, setProcessors] = useState<number | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [digest, setDigest] = useState<string>("");
  const [name, setName] = useState(allowedTapeNames()[0] ?? "#1@2.254");
  const [identity, setIdentity] = useState<TapeIdentity | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<OnchainReceipt[]>([]);
  const [checks, setChecks] = useState<Record<string, "checking" | "match" | "missing" | "error">>({});
  const policy = configuredPolicyCircuit();

  useEffect(() => {
    let live = true;
    tapeOutProcessorCount().then((n) => { if (live) setProcessors(n); }).catch((e) => { if (live) setReadError(e instanceof Error ? e.message.split("\n")[0] : "X Layer read failed."); });
    policyNetlistDigest().then((d) => { if (live) setDigest(d); });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReceipts(loadOnchainReceipts().slice().reverse());
    return () => { live = false; };
  }, []);

  const lookup = async () => {
    setIdentity(null); setIdentityError(null);
    try { setIdentity(await resolveTapeIdentity(name)); } catch (e) { setIdentityError(e instanceof Error ? e.message.split("\n")[0] : "Lookup failed."); }
  };
  const check = async (r: OnchainReceipt) => {
    setChecks((c) => ({ ...c, [r.id]: "checking" }));
    try { const ok = await verifyAnchor(r.txHash, r.anchor); setChecks((c) => ({ ...c, [r.id]: ok ? "match" : "missing" })); }
    catch { setChecks((c) => ({ ...c, [r.id]: "error" })); }
  };
  const downloadNetlist = () => {
    const blob = new Blob([JSON.stringify({ format: "TAP-02", nIn: POLICY_N_IN, nOut: POLICY_N_OUT, gates: POLICY_GATE_COUNT, sha256: digest, netlist: toHex(POLICY_NETLIST) }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "rails-desk-policy-circuit.json"; a.click(); URL.revokeObjectURL(url);
  };

  return <>
    <div className="page-head">
      <div>
        <div className="eyebrow">ONCHAIN / 05</div>
        <h1 className="page-title">X Layer and TapeOut</h1>
        <p className="page-sub">Approved transfers settle on X Layer testnet. Agent identities and the policy circuit come from TapeOut on X Layer.</p>
      </div>
      <span className="tag">X LAYER</span>
    </div>
    {readError && <div className="notice warn" style={{ marginBottom: 16 }}>Could not read X Layer right now: {readError}</div>}
    <div className="stat-grid">
      <div className="stat-card"><div className="stat-label">TapeOut processors on X Layer</div><div className="stat-value">{processors ?? "…"}</div><div className="stat-foot">Live from the factory at <a href={addressUrl(xLayer, TAPEOUT_XLAYER.factory)} target="_blank" rel="noreferrer">{short(TAPEOUT_XLAYER.factory)}</a></div></div>
      <div className="stat-card"><div className="stat-label">Policy circuit</div><div className="stat-value">{POLICY_GATE_COUNT}</div><div className="stat-foot">NAND gates · {POLICY_N_IN} inputs · {POLICY_N_OUT} outputs</div></div>
      <div className="stat-card"><div className="stat-label">Onchain receipts</div><div className="stat-value">{receipts.length}</div><div className="stat-foot">Transfers on X Layer testnet ({xLayerTestnet.id})</div></div>
    </div>

    <div className="panel">
      <div className="section-head"><div><h2 className="panel-title">Policy circuit</h2><div className="panel-desc">The rails (max per action, review limit, allowlist) compiled into a TapeOut netlist. Outputs: approved, needs your OK, blocked.</div></div><span className={policy ? "tag" : "tag red"}>{policy ? "ON X LAYER" : "NOT TAPED OUT YET"}</span></div>
      <div className="notice">{policy
        ? <>Every check is also run with <code>eval</code> on circuit #{policy.id.toString()} of processor <a href={addressUrl(xLayer, policy.processor)} target="_blank" rel="noreferrer">{short(policy.processor)}</a>. If the chain and the app ever disagree, the proposal is blocked.</>
        : <>The app evaluates this netlist with TapeOut&apos;s TAP-02 rules. Once it is taped out on X Layer, set the processor and circuit ID and every check is confirmed on chain.</>}</div>
      <div className="demo-hash" style={{ marginTop: 12, fontFamily: "ui-monospace,monospace", fontSize: 11, overflowWrap: "anywhere" }}>Netlist SHA-256 {digest || "…"}</div>
      <div className="action-row" style={{ marginTop: 12 }}><button className="button ghost" onClick={downloadNetlist}>Download netlist</button></div>
    </div>

    <div className="panel" style={{ marginTop: 15 }}>
      <div className="section-head"><div><h2 className="panel-title">Look up a TapeOut identity</h2><div className="panel-desc">Agents and payees can be TapeOut circuits on X Layer, written like #1@2.254. Rails Desk reads the holder and the circuit&apos;s own account from chain.</div></div></div>
      <div className="action-row">
        <input aria-label="TapeOut name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 180, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 10 }} />
        <button className="button" onClick={() => void lookup()}>Look up</button>
      </div>
      {identityError && <div className="notice warn" style={{ marginTop: 12 }}>{identityError}</div>}
      {identity && <div className="notice" style={{ marginTop: 12 }}>
        {identity.label} is circuit #{identity.circuitId} on {identity.processorName} (<a href={addressUrl(xLayer, identity.processor)} target="_blank" rel="noreferrer">{short(identity.processor)}</a>).
        {" "}Held by <a href={addressUrl(xLayer, identity.holder)} target="_blank" rel="noreferrer">{short(identity.holder)}</a>.
        {" "}Container <a href={addressUrl(xLayer, identity.container)} target="_blank" rel="noreferrer">{short(identity.container)}</a> is {identity.opened ? "open, so payments go to it" : "not opened yet, so payments go to the holder"}.
      </div>}
    </div>

    <div className="panel" style={{ marginTop: 15 }}>
      <div className="section-head"><div><h2 className="panel-title">Onchain receipts</h2><div className="panel-desc">Transfers sent from the demo in X Layer mode. Each one carries its receipt hash in the transaction data. Stored in this browser; the transaction is the lasting record.</div></div><span className="tag">{receipts.length} ENTRIES</span></div>
      {receipts.length === 0
        ? <div className="empty">No onchain receipts yet. Open the demo, connect a wallet and send an approved transfer. Need test OKB? Use the <a href={XLAYER_FAUCET_URL} target="_blank" rel="noreferrer">X Layer faucet</a>.</div>
        : <div className="receipt-list">{receipts.map((r) => <div className="receipt-row" key={r.id}>
          <div><div className="receipt-title">{r.recipient} · ${r.amount} · {r.units} {r.asset}</div>
            <div className="receipt-meta">{new Date(r.timestamp).toLocaleString()} · circuit: {r.circuit.needsReview ? "needs your OK" : "approved"} ({r.circuitSource}){r.tapeIdentity ? ` · ${r.tapeIdentity}` : ""}</div>
            <div className="receipt-meta"><a href={txUrl(xLayerTestnet, r.txHash)} target="_blank" rel="noreferrer">{short(r.txHash)}</a> · block {r.blockNumber}</div></div>
          <div><button className="button ghost" onClick={() => void check(r)} disabled={checks[r.id] === "checking"}>{checks[r.id] === "match" ? "Hash matches" : checks[r.id] === "missing" ? "Hash not found" : checks[r.id] === "error" ? "Try again" : checks[r.id] === "checking" ? "Checking" : "Verify on chain"}</button></div>
        </div>)}</div>}
    </div>
  </>;
}
