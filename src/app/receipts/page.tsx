"use client";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/components/store";
import { verifyChain } from "@/lib/rails";
import Link from "next/link";
import { useDesk } from "@/components/desk";
import { ANCHOR_TAG, connectWallet as connectInjectedWallet, disconnectWallet as disconnectInjectedWallet, getConnectedWallet, receiptAnchor, sendReceiptHeadAnchor, sendTestnetOkbTransfer, subscribeWallet } from "@/lib/xlayer-wallet";
import { XLAYER_SETTLEMENT_PAUSED_MESSAGE } from "@/lib/xlayer-settlement-safety";

const outcomeLabel = { approved: "approved", needs_review: "needs your OK", blocked: "blocked", refused: "refused" } as const;
const outcomeTag = (o: keyof typeof outcomeLabel) => (o === "approved" ? "tag green" : o === "needs_review" ? "tag neutral" : "tag red");
const outcomeSummary = (o: keyof typeof outcomeLabel, detail: string, reviewed = false) => reviewed && o === "approved" ? "Approved by you after review." : o === "approved" ? "Transfer approved." : o === "needs_review" ? "Transfer needs your approval." : o === "refused" ? "Transfer refused by you." : detail.toLowerCase().includes("maximum") || detail.toLowerCase().includes("limit") ? "Transfer blocked. " + detail : "Transfer blocked by your allowed-recipient rules.";
type UnknownAnchorAttempt = { deskId: string; from: string; receiptHash: string; receiptIndex: number; attemptedAt: string };
type UnknownSettlementAttempt = { deskId: string; proposalId: string; from: string; payTo: string; amountCredits: number; units: string; anchor: string; receiptHash: string; attemptedAt: string };
const isWalletRequestRejected = (error: unknown) => {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const value = current as { code?: unknown; name?: unknown; cause?: unknown };
    if (value.code === 4001 || value.name === "UserRejectedRequestError") return true;
    current = value.cause;
  }
  return false;
};

export default function ReceiptsPage() {
  const { receipts, legacyReceipts, receiptStatus, receiptError, refreshReceipts } = useStore();
  const d = useDesk(4000);
  const [busy, setBusy] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [deskErr, setDeskErr] = useState<string | null>(null);
  const [settling, setSettling] = useState<string | null>(null);
  const [settlementReview, setSettlementReview] = useState<{ proposalId: string; from: string; to: string; amountCredits: number; units: string; anchor: string; receiptHash: string } | null>(null);
  const [payTo, setPayTo] = useState("");
  const [connectedWallet, setConnectedWallet] = useState<string | null>(null);
  const [connectingWallet, setConnectingWallet] = useState(false);
  const [anchoring, setAnchoring] = useState(false);
  const [anchorReviewOpen, setAnchorReviewOpen] = useState(false);
  const [pendingAnchor, setPendingAnchor] = useState<{ deskId: string; txHash: string; from: string; receiptHash: string; receiptIndex: number } | null>(null);
  const [unknownAnchorAttempt, setUnknownAnchorAttempt] = useState<UnknownAnchorAttempt | null>(null);
  const [anchorActivityChecked, setAnchorActivityChecked] = useState(false);
  const [unknownAnchorHashInput, setUnknownAnchorHashInput] = useState("");
  const [anchorHydratedDeskId, setAnchorHydratedDeskId] = useState<string | null>(null);
  const [anchorStorageWarning, setAnchorStorageWarning] = useState(false);
  const walletGeneration = useRef(0);
  const [unrecordedSettlement, setUnrecordedSettlement] = useState<{ deskId: string; proposalId: string; txHash: string; from: string; payTo: string; anchor: string } | null>(null);
  const [unknownSettlementAttempt, setUnknownSettlementAttempt] = useState<UnknownSettlementAttempt | null>(null);
  const [settlementActivityChecked, setSettlementActivityChecked] = useState(false);
  const [unknownSettlementHashInput, setUnknownSettlementHashInput] = useState("");
  const [settlementHydratedDeskId, setSettlementHydratedDeskId] = useState<string | null>(null);
  const desk = d.desk;
  useEffect(() => {
    if (!desk) return;
    const currentDesk = desk;
    let live = true;
    const timer = window.setTimeout(() => {
      const key = `rails-desk-pending-anchor:${currentDesk.id}`;
      try {
        let hasKnownPending = false;
        const raw = localStorage.getItem(key);
        if (raw) {
          const value = JSON.parse(raw);
          if (value?.deskId === currentDesk.id && /^0x[0-9a-fA-F]{64}$/.test(value.txHash) && typeof value.from === "string" && typeof value.receiptHash === "string" && Number.isInteger(value.receiptIndex)) {
            const recorded = currentDesk.anchors?.some((a) => a.txHash.toLowerCase() === value.txHash.toLowerCase() && a.receiptHash === value.receiptHash && a.receiptIndex === value.receiptIndex);
            if (recorded) {
              localStorage.removeItem(key);
              if (live) setPendingAnchor((current) => current?.deskId === currentDesk.id && current.txHash.toLowerCase() === value.txHash.toLowerCase() && current.receiptHash === value.receiptHash && current.receiptIndex === value.receiptIndex ? null : current);
            }
            else if (live) { setPendingAnchor(value); hasKnownPending = true; }
          }
        }
        const unknownRaw = localStorage.getItem(`rails-desk-unknown-anchor:${currentDesk.id}`);
        if (unknownRaw && !hasKnownPending) {
          const value = JSON.parse(unknownRaw) as UnknownAnchorAttempt;
          if (value?.deskId === currentDesk.id && /^0x[0-9a-fA-F]{40}$/.test(value.from) && /^0x[0-9a-fA-F]{64}$/.test(value.receiptHash) && Number.isInteger(value.receiptIndex) && typeof value.attemptedAt === "string") {
            if (currentDesk.anchors?.some((a) => a.receiptHash === value.receiptHash && a.receiptIndex === value.receiptIndex)) localStorage.removeItem(`rails-desk-unknown-anchor:${currentDesk.id}`);
            else if (live) { setUnknownAnchorAttempt(value); setAnchorActivityChecked(false); }
          }
        }
        if (live) { setAnchorStorageWarning(false); setAnchorHydratedDeskId(currentDesk.id); }
      } catch {
        if (live) setAnchorStorageWarning(true);
      }
    }, 0);
    return () => { live = false; window.clearTimeout(timer); };
  }, [desk]);
  useEffect(() => {
    if (!desk) return;
    const currentDesk = desk;
    let live = true;
    const timer = window.setTimeout(() => {
      try {
        let hasKnownPending = false;
        const raw = localStorage.getItem(`rails-desk-pending-settlement:${currentDesk.id}`);
        if (raw) {
          const value = JSON.parse(raw);
          const proposal = currentDesk.proposals.find((p) => p.id === value?.proposalId);
          if (value?.deskId === currentDesk.id && proposal && /^0x[0-9a-fA-F]{64}$/.test(value.txHash) && typeof value.from === "string" && /^0x[0-9a-fA-F]{40}$/.test(value.payTo) && typeof value.anchor === "string") {
            if (proposal.settlement) localStorage.removeItem(`rails-desk-pending-settlement:${currentDesk.id}`);
            else if (live) { setUnrecordedSettlement(value); hasKnownPending = true; }
          }
        }
        const unknownRaw = localStorage.getItem(`rails-desk-unknown-settlement:${currentDesk.id}`);
        if (unknownRaw && !hasKnownPending) {
          const value = JSON.parse(unknownRaw) as UnknownSettlementAttempt;
          const proposal = currentDesk.proposals.find((p) => p.id === value?.proposalId);
          if (value?.deskId === currentDesk.id && proposal && /^0x[0-9a-fA-F]{40}$/.test(value.from) && /^0x[0-9a-fA-F]{40}$/.test(value.payTo) && typeof value.anchor === "string" && /^0x[0-9a-fA-F]{64}$/.test(value.receiptHash) && Number.isFinite(value.amountCredits) && typeof value.units === "string" && typeof value.attemptedAt === "string") {
            if (proposal.settlement) localStorage.removeItem(`rails-desk-unknown-settlement:${currentDesk.id}`);
            else if (live) { setUnknownSettlementAttempt(value); setSettlementActivityChecked(false); }
          }
        }
        if (live) setSettlementHydratedDeskId(currentDesk.id);
      } catch { if (live) setAnchorStorageWarning(true); }
    }, 0);
    return () => { live = false; window.clearTimeout(timer); };
  }, [desk]);
  useEffect(() => {
    if (!desk || !unrecordedSettlement || unrecordedSettlement.deskId !== desk.id) return;
    const proposal = desk.proposals.find((p) => p.id === unrecordedSettlement.proposalId);
    if (!proposal?.settlement) return;
    const timer = window.setTimeout(() => {
      try { localStorage.removeItem(`rails-desk-pending-settlement:${desk.id}`); setAnchorStorageWarning(false); } catch { setAnchorStorageWarning(true); }
      setUnrecordedSettlement(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [desk, unrecordedSettlement]);
  useEffect(() => {
    let live = true;
    const sync = (address: string | null) => { if (live) { walletGeneration.current++; setConnectedWallet(address); } };
    const unsubscribe = subscribeWallet(sync);
    sync(getConnectedWallet());
    return () => { live = false; unsubscribe(); };
  }, []);
  const pending = desk ? desk.proposals.filter((p) => p.status === "needs_review" && !p.review) : [];
  const approvedUnsettled = desk ? desk.proposals.filter((p) => (p.status === "approved" || p.review?.decision === "approved") && !p.settlement) : [];
  const act = async (id: string, decision: "approve" | "refuse") => { setBusy(id); setDeskErr(null); try { await d.decide(id, decision); setReviewing(null); } catch (e) { setDeskErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); } };
  const clearUnknownAnchorLock = () => {
    if (!unknownAnchorAttempt || !anchorActivityChecked) return;
    try { localStorage.removeItem(`rails-desk-unknown-anchor:${unknownAnchorAttempt.deskId}`); setUnknownAnchorAttempt(null); setAnchorActivityChecked(false); setDeskErr(null); }
    catch { setAnchorStorageWarning(true); setDeskErr("Could not clear the saved anchor lock. Keep this page open and check browser storage before trying again."); }
  };
  const clearUnknownSettlementLock = () => {
    if (!unknownSettlementAttempt || !settlementActivityChecked) return;
    try { localStorage.removeItem(`rails-desk-unknown-settlement:${unknownSettlementAttempt.deskId}`); setUnknownSettlementAttempt(null); setSettlementActivityChecked(false); setDeskErr(null); }
    catch { setAnchorStorageWarning(true); setDeskErr("Could not clear the saved settlement lock. Keep this page open and check browser storage before trying again."); }
  };
  const recoverUnknownAnchorHash = (hash: string) => {
    if (!unknownAnchorAttempt || !/^0x[0-9a-fA-F]{64}$/.test(hash.trim())) { setDeskErr("Enter the 32-byte transaction hash shown in wallet activity."); return; }
    const record = { deskId: unknownAnchorAttempt.deskId, txHash: hash.trim(), from: unknownAnchorAttempt.from, receiptHash: unknownAnchorAttempt.receiptHash, receiptIndex: unknownAnchorAttempt.receiptIndex };
    try { localStorage.setItem(`rails-desk-pending-anchor:${record.deskId}`, JSON.stringify(record)); localStorage.removeItem(`rails-desk-unknown-anchor:${record.deskId}`); }
    catch { setAnchorStorageWarning(true); }
    setPendingAnchor(record); setUnknownAnchorAttempt(null); setAnchorActivityChecked(false); setUnknownAnchorHashInput(""); setDeskErr(null);
  };
  const recoverUnknownSettlementHash = (hash: string) => {
    if (!unknownSettlementAttempt || !/^0x[0-9a-fA-F]{64}$/.test(hash.trim())) { setDeskErr("Enter the 32-byte transaction hash shown in wallet activity."); return; }
    const record = { deskId: unknownSettlementAttempt.deskId, proposalId: unknownSettlementAttempt.proposalId, txHash: hash.trim(), from: unknownSettlementAttempt.from, payTo: unknownSettlementAttempt.payTo, anchor: unknownSettlementAttempt.anchor };
    try { localStorage.setItem(`rails-desk-pending-settlement:${record.deskId}`, JSON.stringify(record)); localStorage.removeItem(`rails-desk-unknown-settlement:${record.deskId}`); }
    catch { setAnchorStorageWarning(true); }
    setUnrecordedSettlement(record); setUnknownSettlementAttempt(null); setSettlementActivityChecked(false); setUnknownSettlementHashInput(""); setDeskErr(null);
  };
  const anchorHead = async (expectedFrom: string, expectedHeadHash: string) => {
    if (pendingAnchor && pendingAnchor.deskId === desk?.id) { setDeskErr("An anchor transaction is unresolved. Retry verification without sending again; do not submit another anchor."); return; }
    if (unknownAnchorAttempt?.deskId === desk?.id) { setDeskErr("The anchor submission outcome is unknown. Check wallet activity and resolve its saved lock before sending again."); return; }
    if (!connectedWallet || connectedWallet.toLowerCase() !== expectedFrom.toLowerCase() || getConnectedWallet()?.toLowerCase() !== expectedFrom.toLowerCase()) { setDeskErr("The connected wallet no longer matches the reviewed sender. Review the anchor transaction again."); return; }
    if (!desk?.receipts.length) return;
    const head = desk.receipts.at(-1);
    if (!head) return;
    if (head.hash !== expectedHeadHash) { setDeskErr("The receipt head changed after review. Review the anchor transaction again."); return; }
    setAnchoring(true); setAnchorReviewOpen(false); setDeskErr(null);
    let walletRequestStarted = false;
    try {
      const sent = await sendReceiptHeadAnchor({ headHash: `0x${head.hash}`, expectedFrom: expectedFrom as `0x${string}`, onBeforeSubmit: () => {
        const marker: UnknownAnchorAttempt = { deskId: desk.id, from: expectedFrom, receiptHash: head.hash, receiptIndex: head.index, attemptedAt: new Date().toISOString() };
        localStorage.setItem(`rails-desk-unknown-anchor:${desk.id}`, JSON.stringify(marker));
        setUnknownAnchorAttempt(marker); setAnchorActivityChecked(false); walletRequestStarted = true;
      }, onSubmitted: (hash, from) => {
        const record = { deskId: desk.id, txHash: hash, from, receiptHash: head.hash, receiptIndex: head.index };
        setPendingAnchor(record);
        setUnknownAnchorAttempt(null); setAnchorActivityChecked(false);
        try { localStorage.setItem(`rails-desk-pending-anchor:${desk.id}`, JSON.stringify(record)); localStorage.removeItem(`rails-desk-unknown-anchor:${desk.id}`); setAnchorStorageWarning(false); }
        catch { setAnchorStorageWarning(true); }
      } });
      await d.recordAnchor({ txHash: sent.hash, receiptHash: head.hash, receiptIndex: head.index });
      setPendingAnchor(null);
      try { localStorage.removeItem(`rails-desk-pending-anchor:${desk.id}`); setAnchorStorageWarning(false); } catch { setAnchorStorageWarning(true); }
    } catch (e) {
      if (walletRequestStarted && isWalletRequestRejected(e)) {
        try { localStorage.removeItem(`rails-desk-unknown-anchor:${desk.id}`); setUnknownAnchorAttempt(null); setAnchorActivityChecked(false); setDeskErr("The wallet explicitly rejected the anchor request. No transaction hash was returned; you may review and try again."); }
        catch { setAnchorStorageWarning(true); setDeskErr("The wallet rejected the anchor, but its saved lock could not be cleared. Check wallet activity before clearing the lock manually."); }
      } else if (walletRequestStarted) setDeskErr("Anchor submission outcome unknown: no transaction hash was returned. Do not send again until you check wallet activity and resolve the saved lock.");
      else setDeskErr(e instanceof Error ? e.message : String(e));
    } finally { setAnchoring(false); }
  };
  const retryAnchorRecord = async () => {
    if (!pendingAnchor || pendingAnchor.deskId !== desk?.id) return;
    setAnchoring(true); setDeskErr(null);
    try {
      await d.recordAnchor({ txHash: pendingAnchor.txHash, receiptHash: pendingAnchor.receiptHash, receiptIndex: pendingAnchor.receiptIndex });
      setPendingAnchor(null);
      try { localStorage.removeItem(`rails-desk-pending-anchor:${pendingAnchor.deskId}`); setAnchorStorageWarning(false); } catch { setAnchorStorageWarning(true); }
    } catch (e) { setDeskErr(`Anchor verification/recording failed. The transaction hash is preserved; retry verification without sending again. ${e instanceof Error ? e.message : String(e)}`); }
    finally { setAnchoring(false); }
  };
  const connectWallet = async () => {
    setConnectingWallet(true);
    setDeskErr(null);
    try {
      const address = await connectInjectedWallet();
      if (getConnectedWallet()?.toLowerCase() === address.toLowerCase()) setConnectedWallet(address);
    } catch (e) {
      setDeskErr(e instanceof Error ? e.message : String(e));
    } finally {
      setConnectingWallet(false);
    }
  };
  const disconnectWallet = async () => {
    if (busy || anchoring || settling) return;
    try { await disconnectInjectedWallet(); setConnectedWallet(null); }
    catch (e) { setDeskErr(e instanceof Error ? e.message : String(e)); }
  };
  const prepareSettlementReview = async (proposalId: string) => {
    if (settlementHydratedDeskId !== desk?.id) { setDeskErr("Checking for a previously submitted transaction; wait before sending."); return; }
    if (unrecordedSettlement?.deskId === desk?.id) { setDeskErr("A settlement transaction was already submitted. Retry recording it without sending again."); return; }
    if (unknownSettlementAttempt?.deskId === desk?.id) { setDeskErr("The settlement submission outcome is unknown. Check wallet activity and resolve its saved lock before sending again."); return; }
    if (!connectedWallet) { setDeskErr("Connect a browser wallet before sending."); return; }
    if (!desk) return;
    const proposal = desk.proposals.find((p) => p.id === proposalId);
    if (!proposal) return;
    const originalReceipt = desk.receipts.find((r) => r.id === proposal.receiptIds[0]);
    if (!originalReceipt) { setDeskErr("The original proposal receipt is missing; settlement is blocked."); return; }
    const generation = walletGeneration.current;
    setBusy(proposalId); setDeskErr(null);
    try {
      const destination = payTo.trim().toLowerCase() as `0x${string}`;
      if (!/^0x[0-9a-fA-F]{40}$/.test(destination)) throw new Error("Enter a valid EVM recipient address.");
      if (destination === connectedWallet.toLowerCase()) throw new Error("The recipient is the connected wallet. A self-transfer is not a settlement; enter a different X Layer address.");
      const rate = Number(process.env.NEXT_PUBLIC_DEMO_OKB_PER_USD ?? "0.0001");
      if (!Number.isFinite(rate) || rate <= 0) throw new Error("Testnet OKB conversion rate is invalid.");
      const anchor = await receiptAnchor({ proposalId: proposal.id, receiptHash: originalReceipt.hash, payTo: destination, amount: proposal.amount, from: connectedWallet.toLowerCase() });
      const activeWallet = getConnectedWallet();
      if (generation !== walletGeneration.current || !activeWallet || activeWallet.toLowerCase() !== connectedWallet.toLowerCase()) throw new Error("The browser wallet session changed before review. Reconnect and review again.");
      setSettlementReview({ proposalId, from: connectedWallet, to: destination, amountCredits: proposal.amount, units: (proposal.amount * rate).toFixed(8), anchor, receiptHash: originalReceipt.hash });
    } catch (e) {
      setDeskErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  };
  const settle = async (proposalId: string) => {
    const review = settlementReview;
    if (!review || review.proposalId !== proposalId) { setDeskErr("Review the transaction details before opening the wallet."); return; }
    if (settlementHydratedDeskId !== desk?.id) { setDeskErr("Checking for a previously submitted transaction; wait before sending."); return; }
    if (unrecordedSettlement?.deskId === desk?.id) { setDeskErr("A settlement transaction was already submitted. Retry recording it without sending again."); return; }
    if (unknownSettlementAttempt?.deskId === desk?.id) { setDeskErr("The settlement submission outcome is unknown. Check wallet activity and resolve its saved lock before sending again."); return; }
    if (!connectedWallet || connectedWallet.toLowerCase() !== review.from.toLowerCase() || getConnectedWallet()?.toLowerCase() !== review.from.toLowerCase()) { setDeskErr("The connected wallet no longer matches the reviewed sender. Review the transaction again."); return; }
    if (review.from.toLowerCase() === review.to.toLowerCase()) { setDeskErr("A payment to the connected wallet itself is not a settlement. Enter a different X Layer recipient address."); setSettlementReview(null); return; }
    if (!desk) return;
    const proposal = desk.proposals.find((p) => p.id === proposalId);
    if (!proposal || proposal.amount !== review.amountCredits) { setDeskErr("The approved proposal changed after review. Review the transaction again."); setSettlementReview(null); return; }
    const originalReceipt = desk.receipts.find((r) => r.id === proposal.receiptIds[0]);
    if (!originalReceipt || originalReceipt.hash !== review.receiptHash) { setDeskErr("The proposal receipt changed after review. Review the transaction again."); setSettlementReview(null); return; }
    if (payTo.trim().toLowerCase() !== review.to.toLowerCase()) { setDeskErr("The recipient changed after review. Review the transaction again."); setSettlementReview(null); return; }
    const generation = walletGeneration.current;
    setBusy(proposalId); setDeskErr(null);
    let walletRequestStarted = false;
    const submittedRecord = { current: null as { deskId: string; proposalId: string; txHash: string; from: string; payTo: string; anchor: string } | null };
    const getSubmittedRecord = () => submittedRecord.current;
    try {
      if (generation !== walletGeneration.current) throw new Error("The browser wallet session changed before sending. Review again.");
      const sent = await sendTestnetOkbTransfer({ to: review.to as `0x${string}`, amountCredits: review.amountCredits, anchor: review.anchor as `0x${string}`, expectedFrom: review.from as `0x${string}`, expectedUnits: review.units, onBeforeSubmit: () => {
        const marker: UnknownSettlementAttempt = { deskId: desk.id, proposalId: proposal.id, from: review.from, payTo: review.to, amountCredits: review.amountCredits, units: review.units, anchor: review.anchor, receiptHash: review.receiptHash, attemptedAt: new Date().toISOString() };
        localStorage.setItem(`rails-desk-unknown-settlement:${desk.id}`, JSON.stringify(marker));
        setUnknownSettlementAttempt(marker); setSettlementActivityChecked(false); walletRequestStarted = true;
      }, onSubmitted: (hash, from) => {
        const record = { deskId: desk.id, proposalId: proposal.id, txHash: hash, from, payTo: review.to, anchor: review.anchor };
        submittedRecord.current = record;
        setUnrecordedSettlement(record);
        setUnknownSettlementAttempt(null); setSettlementActivityChecked(false);
        try { localStorage.setItem(`rails-desk-pending-settlement:${desk.id}`, JSON.stringify(record)); localStorage.removeItem(`rails-desk-unknown-settlement:${desk.id}`); setAnchorStorageWarning(false); }
        catch { setAnchorStorageWarning(true); }
      } });
      if (!getSubmittedRecord()) throw new Error("Transfer returned without a submission record; do not send again until you verify wallet activity.");
      if (sent.units !== review.units) throw new Error("The submitted amount differed from the reviewed amount. The transaction hash is preserved; do not send again.");
      await d.recordSettlement(proposal.id, { txHash: sent.hash, payTo: review.to, expectedFrom: review.from, anchor: review.anchor });
      setUnrecordedSettlement(null);
      try { localStorage.removeItem(`rails-desk-pending-settlement:${desk.id}`); setAnchorStorageWarning(false); } catch { setAnchorStorageWarning(true); }
      setSettling(null); setSettlementReview(null); setPayTo("");
    } catch (e) {
      const submitted = getSubmittedRecord();
      if (submitted && e instanceof Error && /transfer reverted after submission/i.test(e.message)) {
        try {
          localStorage.removeItem(`rails-desk-pending-settlement:${desk.id}`);
          localStorage.removeItem(`rails-desk-unknown-settlement:${desk.id}`);
          setAnchorStorageWarning(false);
          setUnrecordedSettlement(null);
          setUnknownSettlementAttempt(null);
          setDeskErr(`Transaction ${submitted.txHash} was mined but reverted. No settlement was recorded; review again before sending a new transaction.`);
        } catch {
          setAnchorStorageWarning(true);
          setDeskErr(`Transaction ${submitted.txHash} was mined but reverted. No settlement was recorded, but its saved recovery lock could not be cleared; do not send again until that lock is resolved.`);
        }
      } else if (submitted) {
        setDeskErr(`Transaction ${submitted.txHash} was already submitted and its hash is preserved. Retry verification/recording without sending again. ${e instanceof Error ? e.message : String(e)}`);
      } else if (walletRequestStarted && isWalletRequestRejected(e)) {
        try { localStorage.removeItem(`rails-desk-unknown-settlement:${desk.id}`); setUnknownSettlementAttempt(null); setSettlementActivityChecked(false); setDeskErr("The wallet explicitly rejected the settlement request. No transaction hash was returned; you may review and try again."); }
        catch { setAnchorStorageWarning(true); setDeskErr("The wallet rejected the settlement, but its saved lock could not be cleared. Check wallet activity before clearing the lock manually."); }
      } else if (walletRequestStarted) setDeskErr("Settlement submission outcome unknown: no transaction hash was returned. Do not send again until you check wallet activity and resolve the saved lock.");
      else setDeskErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  };
  const retrySettlementRecord = async () => {
    if (!unrecordedSettlement || unrecordedSettlement.deskId !== desk?.id) return;
    setBusy(unrecordedSettlement.proposalId); setDeskErr(null);
    try {
      await d.recordSettlement(unrecordedSettlement.proposalId, { txHash: unrecordedSettlement.txHash, payTo: unrecordedSettlement.payTo, expectedFrom: unrecordedSettlement.from, anchor: unrecordedSettlement.anchor });
      setUnrecordedSettlement(null); setSettling(null); setPayTo("");
      try { localStorage.removeItem(`rails-desk-pending-settlement:${unrecordedSettlement.deskId}`); setAnchorStorageWarning(false); } catch { setAnchorStorageWarning(true); }
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
      <div className="section-head"><div><h2 className="panel-title">Browser wallet session</h2><div className="panel-desc">Connect a browser wallet extension before settlement or anchoring; QR/mobile pairing is not available. Connecting alone never signs or sends a transaction.</div></div><span className="tag">XLAYER TESTNET</span></div>
      {connectedWallet ? <div className="receipt-meta">Connected address <span className="mono">{connectedWallet}</span> · X Layer Testnet</div> : <div className="receipt-meta">No browser wallet connected.</div>}
      <div className="action-row" style={{ marginTop: 10 }}>
        {connectedWallet ? <button className="button ghost button-small" onClick={() => void disconnectWallet()} disabled={!!busy || anchoring || !!settling}>Disconnect wallet</button> : <button className="button button-small" onClick={() => void connectWallet()} disabled={connectingWallet || !!busy || anchoring || !!settling}>{connectingWallet ? "Waiting for wallet…" : "Connect browser wallet · X Layer Testnet"}</button>}
      </div>
      <div className="notice" style={{ marginTop: 10 }}>Anchoring is a separate zero-value self-transaction. It requires wallet confirmation and X Layer Testnet network fees. It does not send a payment.</div>
      <div className="section-head"><div><h2 className="panel-title">On-chain receipt anchors</h2><div className="panel-desc">Periodically commit a receipt hash to X Layer testnet. The wallet signs a zero-value self-transaction; anyone can inspect its calldata independently.</div></div><span className="tag">{desk.anchors?.length ?? 0} ANCHORED</span></div>
      {pendingAnchor?.deskId === desk.id && <div className="notice warn" style={{ marginBottom: 10 }}>An anchor transaction was submitted; its confirmation/recording is unresolved. “Pending” does not mean mined. Do not send another transaction. Hash: <a className="mono" href={`https://web3.okx.com/explorer/x-layer-testnet/tx/${pendingAnchor.txHash}`} target="_blank" rel="noreferrer">{pendingAnchor.txHash}</a> · Receipt #{pendingAnchor.receiptIndex} · Wallet {pendingAnchor.from}<div><button className="button button-small" style={{ marginTop: 8 }} onClick={() => void retryAnchorRecord()} disabled={anchoring}>{anchoring ? "Verifying…" : "Retry verification without sending again"}</button></div></div>}
      {unknownAnchorAttempt?.deskId === desk.id && <div className="notice warn" style={{ marginBottom: 10 }}><b>Anchor submission outcome unknown — do not resend.</b> The wallet request started but returned no transaction hash. Check wallet activity for X Layer Testnet, wallet {unknownAnchorAttempt.from}, and the anchor to receipt #{unknownAnchorAttempt.receiptIndex} ({unknownAnchorAttempt.receiptHash}). If activity shows a transaction, enter its hash to retry server verification only.<div className="field"><label htmlFor="unknown-anchor-hash">Transaction hash found in wallet activity</label><input id="unknown-anchor-hash" value={unknownAnchorHashInput} onChange={(e) => setUnknownAnchorHashInput(e.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false} /></div><button className="button button-small" onClick={() => recoverUnknownAnchorHash(unknownAnchorHashInput)} disabled={!/^0x[0-9a-fA-F]{64}$/.test(unknownAnchorHashInput.trim())}>Use hash · verify without sending</button><label className="receipt-meta" style={{ display: "block", marginTop: 10 }}><input type="checkbox" checked={anchorActivityChecked} onChange={(e) => setAnchorActivityChecked(e.target.checked)} /> I checked wallet activity and found no matching transaction.</label><button className="button ghost button-small" onClick={clearUnknownAnchorLock} disabled={!anchorActivityChecked}>Clear send lock after check</button></div>}
      {anchorStorageWarning && <div className="notice warn" style={{ marginBottom: 10 }}>Browser storage reported an error while checking or saving transaction-safety state. Do not retry a send; any pending transaction details may exist only in memory. Keep this page open and resolve the visible status first.</div>}
      {(() => {
        const latest = desk.anchors?.at(-1);
        const latestIndex = latest?.receiptIndex ?? 0;
        const currentHead = desk.receipts.at(-1);
        const alreadyAnchored = !!latest && !!currentHead && latest.receiptIndex === currentHead.index && latest.receiptHash === currentHead.hash;
        const headIndex = currentHead?.index ?? 0;
        const due = headIndex > 0 && headIndex - latestIndex >= 25;
        return <><div className="receipt-meta">{latest ? `Latest anchor covers receipt #${latest.receiptIndex} · ${latest.receiptHash.slice(0, 18)}…` : "No receipt head has been anchored yet."} {due ? "· Another anchor is due." : "· Recommended interval: every 25 receipts."}</div>
          {latest && <div className="receipt-meta">Transaction <a href={`https://web3.okx.com/explorer/x-layer-testnet/tx/${latest.txHash}`} target="_blank" rel="noreferrer">{latest.txHash.slice(0, 18)}… ↗</a> · Block {latest.blockNumber}</div>}
          <button className="button button-small" style={{ marginTop: 10 }} onClick={() => setAnchorReviewOpen(true)} disabled={anchorHydratedDeskId !== desk.id || !connectedWallet || anchoring || !!busy || !!settling || !desk.receipts.length || alreadyAnchored || pendingAnchor?.deskId === desk.id || unknownAnchorAttempt?.deskId === desk.id}>{anchorHydratedDeskId !== desk.id ? "Checking pending anchor…" : anchoring ? "Waiting for wallet / confirmation…" : alreadyAnchored ? "Latest head already anchored" : pendingAnchor?.deskId === desk.id ? "Anchor transaction unresolved" : unknownAnchorAttempt?.deskId === desk.id ? "Anchor outcome unknown" : "Review anchor transaction"}</button>
        </>;
      })()}
    </div>
    <div className="panel" id="review">
      <div className="section-head"><div><h2 className="panel-title">Pending transfers</h2><div className="panel-desc">These transfers stay pending until you approve or refuse them. Nothing is paid before approval.</div></div><span className={pending.length ? "tag neutral" : "tag"}>{pending.length} PENDING</span></div>
      {pending.length === 0 ? <div className="empty">Nothing waiting. Proposals above your review limit will appear here.</div> : <div className="receipt-list">{pending.map((p) => <div className="receipt-row" key={p.id}><div><div className="receipt-title">Transfer · {p.recipient} · {p.amount} credits</div><div className="receipt-meta">{outcomeSummary("needs_review", p.reasons[0] || "")}</div></div><div className="action-row"><button className="button button-small" disabled={busy === p.id} onClick={() => setReviewing(p.id)}>Approve</button></div></div>)}</div>}
    </div>
    <div className="panel" style={{ marginTop: 15 }} id="testnet-settlement">
      <div className="section-head"><div><h2 className="panel-title">Approved · settlement paused</h2><div className="panel-desc">Owner approval does not move funds. X Layer testnet settlement is unavailable while transfer execution cannot be independently proven.</div></div><span className="tag neutral">PAUSED</span></div>
      <div id="xlayer-settlement-paused" className="notice warn" role="status" style={{ marginBottom: 10 }}>{XLAYER_SETTLEMENT_PAUSED_MESSAGE} Proposals and approvals remain available. Receipt anchoring is separate and unchanged; it still requires its own explicit wallet confirmation and network fee.</div>
      {settlementHydratedDeskId !== desk.id && <div className="notice" style={{ marginBottom: 10 }}>Loading the saved status of any previous settlement attempt…</div>}
      {unrecordedSettlement?.deskId === desk.id && <div className="notice warn" style={{ marginBottom: 10 }}>An earlier transaction was submitted; do not send again. Settlement recording is paused and this transaction is not recorded as settled. Preserve its hash for later review: <a className="mono" href={`https://web3.okx.com/explorer/x-layer-testnet/tx/${unrecordedSettlement.txHash}`} target="_blank" rel="noreferrer">{unrecordedSettlement.txHash}</a> · From {unrecordedSettlement.from} · To {unrecordedSettlement.payTo}</div>}
      {unknownSettlementAttempt?.deskId === desk.id && <div className="notice warn" style={{ marginBottom: 10 }}><b>Settlement submission outcome unknown — do not resend.</b> The wallet request started but returned no transaction hash. Check wallet activity on X Layer Testnet (chain 1952) for sender {unknownSettlementAttempt.from}, recipient {unknownSettlementAttempt.payTo}, amount {unknownSettlementAttempt.amountCredits} credits / {unknownSettlementAttempt.units} test OKB. Settlement recording is paused; no transaction can be recorded as settled until independent execution verification is proven. If activity shows a transaction, save its hash for later review.<div className="field"><label htmlFor="unknown-settlement-hash">Transaction hash found in wallet activity (save only)</label><input id="unknown-settlement-hash" value={unknownSettlementHashInput} onChange={(e) => setUnknownSettlementHashInput(e.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false} /></div><button className="button button-small" onClick={() => recoverUnknownSettlementHash(unknownSettlementHashInput)} disabled={!/^0x[0-9a-fA-F]{64}$/.test(unknownSettlementHashInput.trim())}>Save hash for later review</button><label className="receipt-meta" style={{ display: "block", marginTop: 10 }}><input type="checkbox" checked={settlementActivityChecked} onChange={(e) => setSettlementActivityChecked(e.target.checked)} /> I checked wallet activity and found no matching transaction.</label><button className="button ghost button-small" onClick={clearUnknownSettlementLock} disabled={!settlementActivityChecked}>Clear send lock after check</button></div>}
      {anchorStorageWarning && unrecordedSettlement?.deskId === desk.id && <div className="notice warn" style={{ marginBottom: 10 }}>Could not persist the earlier settlement hash in browser storage. Settlement recording is paused; preserve the transaction details before reloading, and do not resend. No settlement was recorded.</div>}
      {approvedUnsettled.length === 0 ? <div className="empty">No approved proposals waiting for settlement.</div> : <div className="receipt-list">{approvedUnsettled.map((p) => <div className="receipt-row" key={p.id}><div><div className="receipt-title">{p.recipient} · {p.amount} credits</div><div className="receipt-meta">{p.reason || "No reason supplied"} · approved, not settled</div></div><button className="button button-small" disabled aria-describedby="xlayer-settlement-paused" title={XLAYER_SETTLEMENT_PAUSED_MESSAGE}>Settlement paused</button></div>)}</div>}
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
    {settling && !settlementReview && (() => { const p = desk.proposals.find((item) => item.id === settling); if (!p) return null; return <div className="review-modal-backdrop" onClick={() => { if (busy !== p.id) setSettling(null); }}><section className="review-modal" role="dialog" aria-modal="true" aria-labelledby="settle-modal-title" onClick={(e) => e.stopPropagation()}><button className="review-modal-close" aria-label="Close settlement dialog" onClick={() => setSettling(null)} disabled={busy === p.id}>×</button><div className="eyebrow">XLAYER TESTNET</div><h2 className="panel-title" id="settle-modal-title">Settle approved proposal</h2><p className="panel-desc">X Layer testnet settlement is paused because the current verifier cannot prove exact-position transfer execution. No transfer can be sent or recorded as settled until an independent execution-level verifier is proven safe.</p><div className="review-modal-summary"><span>Approved recipient</span><strong>{p.recipient}</strong><span>Amount</span><strong>{p.amount} credits</strong></div><div className="field"><label htmlFor="settlement-payto">Recipient X Layer wallet address</label><input id="settlement-payto" value={payTo} onChange={(e) => setPayTo(e.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false} /></div>{unrecordedSettlement?.deskId === desk.id && unrecordedSettlement.proposalId === p.id && <div className="notice warn">Transaction submitted; pending does not mean mined. Do not send again. Hash: <a className="mono" href={`https://web3.okx.com/explorer/x-layer-testnet/tx/${unrecordedSettlement.txHash}`} target="_blank" rel="noreferrer">{unrecordedSettlement.txHash}</a><div className="receipt-meta">Settlement recording is paused; no retry is available.</div></div>}<div className="action-row">
        {connectedWallet ? <div className="notice" style={{ width: "100%" }}>Connected browser wallet · <span className="mono">{connectedWallet}</span> · X Layer Testnet only</div> : <button className="button ghost" onClick={() => void connectWallet()} disabled={connectingWallet || busy === p.id}>{connectingWallet ? "Waiting for wallet…" : "Connect browser wallet · X Layer Testnet"}</button>}
        <button className="button primary" disabled aria-describedby="xlayer-settlement-paused" title={XLAYER_SETTLEMENT_PAUSED_MESSAGE}>Settlement paused</button>
        <button className="button ghost" onClick={() => { setSettlementReview(null); setSettling(null); }} disabled={busy === p.id}>Cancel</button>
      </div></section></div>; })()}
    {settlementReview && settling === settlementReview.proposalId && (() => {
      const review = settlementReview;
      const calldata = `${ANCHOR_TAG}${review.anchor.slice(2)}`;
      const senderMatches = connectedWallet?.toLowerCase() === review.from.toLowerCase() && getConnectedWallet()?.toLowerCase() === review.from.toLowerCase();
      return <div className="review-modal-backdrop" onClick={() => { if (busy !== review.proposalId) { setSettlementReview(null); setSettling(null); } }}><section className="review-modal" role="dialog" aria-modal="true" aria-labelledby="settlement-review-title" onClick={(e) => e.stopPropagation()}>
        <button className="review-modal-close" aria-label="Close transaction review" onClick={() => { setSettlementReview(null); setSettling(null); }} disabled={busy === review.proposalId}>×</button>
        <div className="eyebrow">SETTLEMENT PAUSED</div><h2 className="panel-title" id="settlement-review-title">X Layer testnet settlement</h2>
        <div className="review-modal-summary"><span>From</span><strong className="mono">{review.from}</strong><span>To</span><strong className="mono">{review.to}</strong><span>Amount</span><strong>{review.amountCredits} credits · {review.units} test OKB</strong><span>Chain</span><strong>X Layer Testnet · 1952</strong></div>
        <div className="hash"><b>Calldata</b><br /><span className="mono">{calldata}</span><br />Purpose: Rails Desk receipt commitment ({ANCHOR_TAG} marker followed by the 32-byte anchor derived from the approved proposal and receipt).</div>
        <div className="notice">No transaction can be submitted while settlement is paused. These details do not open or authorize a transfer.</div>
        {!senderMatches && <div className="notice warn">The connected wallet changed. Reconnect and prepare a new transaction review before proceeding.</div>}
        <div className="notice warn" role="status" style={{ marginTop: 10 }}>{XLAYER_SETTLEMENT_PAUSED_MESSAGE}</div>
        <div className="action-row"><button className="button primary" disabled aria-describedby="xlayer-settlement-paused" title={XLAYER_SETTLEMENT_PAUSED_MESSAGE}>Settlement paused</button><button className="button ghost" onClick={() => setSettlementReview(null)} disabled={busy === review.proposalId}>Back</button><button className="button ghost" onClick={() => { setSettlementReview(null); setSettling(null); }} disabled={busy === review.proposalId}>Cancel</button></div>
      </section></div>;
    })()}
    {anchorReviewOpen && connectedWallet && desk.receipts.at(-1) && (() => {
      const head = desk.receipts.at(-1)!;
      const calldata = `${ANCHOR_TAG}${head.hash}`;
      const senderMatches = getConnectedWallet()?.toLowerCase() === connectedWallet.toLowerCase();
      return <div className="review-modal-backdrop" onClick={() => { if (!anchoring) setAnchorReviewOpen(false); }}><section className="review-modal" role="dialog" aria-modal="true" aria-labelledby="anchor-review-title" onClick={(e) => e.stopPropagation()}>
        <button className="review-modal-close" aria-label="Close anchor review" onClick={() => setAnchorReviewOpen(false)} disabled={anchoring}>×</button>
        <div className="eyebrow">REVIEW BEFORE SIGNING</div><h2 className="panel-title" id="anchor-review-title">X Layer testnet receipt anchor</h2>
        <div className="review-modal-summary"><span>From</span><strong className="mono">{connectedWallet}</strong><span>To</span><strong className="mono">{connectedWallet}</strong><span>Amount</span><strong>0 OKB · no payment</strong><span>Chain</span><strong>X Layer Testnet · 1952</strong></div>
        <div className="hash"><b>Calldata</b><br /><span className="mono">{calldata}</span><br />Purpose: commit receipt #{head.index} SHA-256 hash {head.hash} on-chain.</div>
        <div className="notice">The transaction value is zero, but X Layer network gas is still required. The exact fee appears in your wallet’s final confirmation screen; review it there before approving.</div>
        {!senderMatches && <div className="notice warn">The connected wallet changed. Reconnect and review the anchor again.</div>}
        <div className="action-row"><button className="button primary" onClick={() => void anchorHead(connectedWallet, head.hash)} disabled={anchoring || !!busy || !senderMatches}>{anchoring ? "Waiting for wallet / confirmation…" : "Open your wallet to review the fee and approve"}</button><button className="button ghost" onClick={() => setAnchorReviewOpen(false)} disabled={anchoring}>Cancel</button></div>
      </section></div>;
    })()}
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
