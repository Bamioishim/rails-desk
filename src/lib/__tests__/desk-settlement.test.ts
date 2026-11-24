import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const verification = vi.hoisted(() => ({ verifyTransfer: vi.fn(), verifyAnchor: vi.fn() }));
vi.mock("../server/xlayer-settlement", () => ({
  verifyXLayerTestnetTransfer: verification.verifyTransfer,
  verifyXLayerReceiptHeadAnchor: verification.verifyAnchor,
}));

import { createDesk, decide, getDesk, propose, recordReceiptHeadAnchor, recordTestnetSettlement } from "../server/desk";

const anchorTxHash = `0x${"bc".repeat(32)}`;
const settlementTxHash = `0x${"ef".repeat(32)}`;
const reviewedSender = "0x1234567890abcdef1234567890abcdef12345678";
const recipientAddress = "0x9876543210987654321098765432109876543210";

beforeAll(() => {
  process.env.RAILS_DESK_DATA_DIR = mkdtempSync(path.join(tmpdir(), "desk-settlement-test-"));
  delete process.env.KV_REST_API_URL;
  delete process.env.UPSTASH_REDIS_REST_URL;
});
beforeEach(() => {
  verification.verifyTransfer.mockReset();
  verification.verifyAnchor.mockReset().mockImplementation(async ({ txHash }: { txHash: string }) => ({
    chainId: 1952,
    txHash,
    from: reviewedSender,
    blockNumber: "13",
    anchoredAt: new Date(1_700_000_000_000).toISOString(),
  }));
});

async function settlementBody(ownerKey: string, proposalId: string, txHash = settlementTxHash) {
  const desk = await getDesk(ownerKey);
  const proposal = desk.proposals.find((item) => item.id === proposalId)!;
  const receipt = desk.receipts.find((item) => item.id === proposal.receiptIds[0])!;
  const payload = { proposalId, receiptHash: receipt.hash, payTo: recipientAddress, amount: proposal.amount, from: reviewedSender };
  const anchor = `0x${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
  return { txHash, payTo: recipientAddress, expectedFrom: reviewedSender, anchor };
}

describe("desk on-chain transaction recording", () => {
  it("binds the settlement commitment to the exact reviewed sender", async () => {
    const { ownerKey, agentKey } = await createDesk("Sender-bound settlement anchor");
    const proposal = await propose(agentKey, { amount: 12, recipient: "Alex", reason: "Bind sender into commitment" });
    await decide(ownerKey, proposal.id, "approve");
    const body = await settlementBody(ownerKey, proposal.id);
    await expect(recordTestnetSettlement(ownerKey, proposal.id, {
      ...body,
      expectedFrom: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    })).rejects.toMatchObject({
      message: "The supplied anchor does not match this approved proposal and recipient.",
      status: 400,
    });
    expect(verification.verifyTransfer).not.toHaveBeenCalled();
  });

  it("rejects a self-transfer at the server boundary before calling the chain verifier", async () => {
    const { ownerKey, agentKey } = await createDesk("Reject self settlement");
    const proposal = await propose(agentKey, { amount: 12, recipient: "Alex", reason: "Self transfer attempt" });
    await decide(ownerKey, proposal.id, "approve");
    const body = await settlementBody(ownerKey, proposal.id);
    await expect(recordTestnetSettlement(ownerKey, proposal.id, { ...body, payTo: reviewedSender }))
      .rejects.toMatchObject({ message: expect.stringContaining("self-transfer"), status: 400 });
    expect(verification.verifyTransfer).not.toHaveBeenCalled();
    expect((await getDesk(ownerKey)).proposals.find((item) => item.id === proposal.id)?.settlement ?? null).toBeNull();
  });

  it("preserves owner approval but does not record a settlement when execution cannot be verified", async () => {
    const { ownerKey, agentKey } = await createDesk("Approval with settlement verification unavailable");
    const proposal = await propose(agentKey, { amount: 12, recipient: "Alex", reason: "Needs owner review" });
    expect(proposal.status).toBe("needs_review");

    const approved = await decide(ownerKey, proposal.id, "approve");
    expect(approved.review).toMatchObject({ decision: "approved" });
    const before = await getDesk(ownerKey);
    const receiptCount = before.receipts.length;
    verification.verifyTransfer.mockRejectedValue(new Error("A trace-capable X Layer RPC is required; execution is unverifiable."));

    await expect(recordTestnetSettlement(ownerKey, proposal.id, await settlementBody(ownerKey, proposal.id)))
      .rejects.toThrow("trace-capable X Layer RPC");
    expect(verification.verifyTransfer).toHaveBeenCalledOnce();
    expect(verification.verifyTransfer).toHaveBeenCalledWith(expect.objectContaining({ expectedFrom: reviewedSender, payTo: recipientAddress, amountCredits: 12 }));

    const after = await getDesk(ownerKey);
    const unchangedProposal = after.proposals.find((item) => item.id === proposal.id)!;
    expect(unchangedProposal.review).toMatchObject({ decision: "approved" });
    expect(unchangedProposal.settlement ?? null).toBeNull();
    expect(after.receipts).toHaveLength(receiptCount);
    expect(after.receipts.at(-1)?.event).toBe("approved_by_owner");
  });

  it("keeps receipt-head anchoring separate and blocks a hash already used by an anchor from settlement reuse", async () => {
    const { ownerKey, agentKey } = await createDesk("Settlement verifier and anchor separation");
    const proposal = await propose(agentKey, { amount: 1, recipient: "Alex", reason: "Transfer awaiting verification" });
    const before = await getDesk(ownerKey);
    const originalReceiptCount = before.receipts.length;
    verification.verifyTransfer.mockRejectedValue(new Error("A trace-capable X Layer RPC is required; execution is unverifiable."));

    await expect(recordTestnetSettlement(ownerKey, proposal.id, await settlementBody(ownerKey, proposal.id)))
      .rejects.toThrow("trace-capable X Layer RPC");
    expect(verification.verifyTransfer).toHaveBeenCalledOnce();

    const afterBlockedSettlement = await getDesk(ownerKey);
    expect(afterBlockedSettlement.proposals.find((item) => item.id === proposal.id)?.settlement ?? null).toBeNull();
    expect(afterBlockedSettlement.receipts).toHaveLength(originalReceiptCount);
    expect(afterBlockedSettlement.receipts.some((receipt) => receipt.event === "settled_on_xlayer_testnet")).toBe(false);

    const head = afterBlockedSettlement.receipts.at(-1)!;
    const recordedAnchor = await recordReceiptHeadAnchor(ownerKey, {
      txHash: anchorTxHash,
      receiptHash: head.hash,
      receiptIndex: head.index,
    });
    expect(verification.verifyAnchor).toHaveBeenCalledOnce();
    expect(recordedAnchor).toMatchObject({ txHash: anchorTxHash, receiptHash: head.hash, receiptIndex: head.index });
    await expect(recordReceiptHeadAnchor(ownerKey, {
      txHash: anchorTxHash,
      receiptHash: head.hash,
      receiptIndex: head.index,
    })).rejects.toMatchObject({ message: "This transaction is already recorded as a settlement or receipt anchor.", status: 409 });
    expect(verification.verifyAnchor).toHaveBeenCalledOnce();

    await expect(recordTestnetSettlement(ownerKey, proposal.id, await settlementBody(ownerKey, proposal.id, anchorTxHash)))
      .rejects.toMatchObject({ message: "This transaction is already recorded as a settlement or receipt anchor.", status: 409 });
    expect(verification.verifyTransfer).toHaveBeenCalledOnce();
  });

  it("does not record an anchor when the X Layer operation cannot be verified", async () => {
    const { ownerKey, agentKey } = await createDesk("Unverifiable receipt anchor");
    await propose(agentKey, { amount: 1, recipient: "Alex", reason: "Create a receipt head" });
    const before = await getDesk(ownerKey);
    const head = before.receipts.at(-1)!;
    verification.verifyAnchor.mockRejectedValue(new Error("Trace unavailable; receipt anchor is unverifiable."));

    await expect(recordReceiptHeadAnchor(ownerKey, {
      txHash: anchorTxHash,
      receiptHash: head.hash,
      receiptIndex: head.index,
    })).rejects.toThrow("Trace unavailable");
    expect(verification.verifyAnchor).toHaveBeenCalledOnce();
    const after = await getDesk(ownerKey);
    expect(after.anchors).toHaveLength(0);
    expect(after.receipts).toHaveLength(before.receipts.length);
  });

  it("records only a verified settlement and rejects reuse of its transaction hash without a second verification", async () => {
    const { ownerKey, agentKey } = await createDesk("Verified settlement and duplicate prevention");
    const first = await propose(agentKey, { amount: 1, recipient: "Alex", reason: "First approved transfer" });
    const returnedUserOperationHash = `0x${"12".repeat(32)}`;
    const request = await settlementBody(ownerKey, first.id, returnedUserOperationHash);
    verification.verifyTransfer.mockResolvedValue({
      chainId: 1952,
      txHash: settlementTxHash,
      from: reviewedSender,
      payTo: recipientAddress,
      asset: "test OKB",
      units: "0.0001",
      blockNumber: "13",
    });

    const recorded = await recordTestnetSettlement(ownerKey, first.id, request);
    expect(recorded.settlement).toMatchObject({ chainId: 1952, txHash: settlementTxHash, from: reviewedSender, payTo: recipientAddress, anchor: request.anchor });
    expect(verification.verifyTransfer).toHaveBeenCalledOnce();
    const afterFirst = await getDesk(ownerKey);
    expect(afterFirst.receipts.at(-1)?.event).toBe("settled_on_xlayer_testnet");
    const receiptCount = afterFirst.receipts.length;

    const second = await propose(agentKey, { amount: 1, recipient: "Jordan", reason: "Second approved transfer" });
    await expect(recordTestnetSettlement(ownerKey, second.id, await settlementBody(ownerKey, second.id, settlementTxHash)))
      .rejects.toMatchObject({ message: "This transaction is already recorded as a settlement or receipt anchor.", status: 409 });
    expect(verification.verifyTransfer).toHaveBeenCalledOnce();

    const afterDuplicate = await getDesk(ownerKey);
    expect(afterDuplicate.proposals.find((item) => item.id === second.id)?.settlement ?? null).toBeNull();
    expect(afterDuplicate.receipts).toHaveLength(receiptCount + 1);
  });

  it("records and deduplicates a receipt anchor by the resolved outer hash, not the submitted UserOperation hash", async () => {
    const { ownerKey, agentKey } = await createDesk("Resolved UserOperation receipt anchor");
    await propose(agentKey, { amount: 1, recipient: "Alex", reason: "Create a receipt to anchor" });
    const desk = await getDesk(ownerKey);
    const head = desk.receipts.at(-1)!;
    const submittedUserOperationHash = `0x${"34".repeat(32)}`;
    const outerTransactionHash = `0x${"56".repeat(32)}`;
    verification.verifyAnchor.mockResolvedValue({
      chainId: 1952,
      txHash: outerTransactionHash,
      from: reviewedSender,
      blockNumber: "13",
      anchoredAt: new Date(1_700_000_000_000).toISOString(),
    });

    const recorded = await recordReceiptHeadAnchor(ownerKey, {
      txHash: submittedUserOperationHash,
      receiptHash: head.hash,
      receiptIndex: head.index,
    });
    expect(recorded?.txHash).toBe(outerTransactionHash);
    await expect(recordReceiptHeadAnchor(ownerKey, {
      txHash: submittedUserOperationHash,
      receiptHash: head.hash,
      receiptIndex: head.index,
    })).rejects.toMatchObject({ message: "This receipt head has already been anchored.", status: 409 });
    expect(verification.verifyAnchor).toHaveBeenCalledTimes(2);
  });
});
