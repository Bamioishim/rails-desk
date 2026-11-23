import { concatHex, createPublicClient, formatEther, http, isAddress, parseEther, type Hex } from "viem";
import { xLayerTestnet } from "../chains";

const ANCHOR_TAG = "0x52444b31" as const;
const client = createPublicClient({
  chain: xLayerTestnet,
  transport: http(process.env.XLAYER_TESTNET_RPC_URL || process.env.NEXT_PUBLIC_XLAYER_TESTNET_RPC_URL || xLayerTestnet.rpcUrls.default.http[0]),
});

export async function verifyXLayerTestnetTransfer(input: {
  txHash: Hex;
  payTo: `0x${string}`;
  amountCredits: number;
  approvedAt: string;
  anchor: Hex;
}) {
  if (!isAddress(input.payTo)) throw new Error("Recipient must be a valid EVM address.");
  const [tx, receipt] = await Promise.all([
    client.getTransaction({ hash: input.txHash }),
    client.getTransactionReceipt({ hash: input.txHash }),
  ]);
  if (receipt.status !== "success") throw new Error("The X Layer testnet transaction did not succeed.");
  const minedBlock = await client.getBlock({ blockNumber: receipt.blockNumber });
  const approvedAt = Date.parse(input.approvedAt);
  if (!Number.isFinite(approvedAt) || Number(minedBlock.timestamp) * 1000 < approvedAt) {
    throw new Error("The testnet transfer must be mined after the proposal was approved.");
  }
  if (tx.chainId !== xLayerTestnet.id) throw new Error("Transaction is not on X Layer testnet.");
  if (!tx.to || tx.to.toLowerCase() !== input.payTo.toLowerCase()) throw new Error("Transaction recipient does not match the approved recipient address.");
  const rate = Number(process.env.NEXT_PUBLIC_DEMO_OKB_PER_USD ?? "0.0001");
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("The testnet OKB conversion rate is not configured correctly.");
  const expectedValue = parseEther((input.amountCredits * rate).toFixed(8));
  if (tx.value !== expectedValue) throw new Error("Transaction value does not match the approved proposal amount.");
  const expectedData = concatHex([ANCHOR_TAG, input.anchor]);
  if (tx.input.toLowerCase() !== expectedData.toLowerCase()) throw new Error("Transaction calldata does not contain the expected receipt anchor.");
  return {
    chainId: 1952 as const,
    from: tx.from.toLowerCase(),
    payTo: input.payTo.toLowerCase(),
    asset: "test OKB" as const,
    units: formatEther(tx.value),
    blockNumber: receipt.blockNumber.toString(),
  };
}

/** Verify a zero-value self-transaction that permanently commits a receipt-head hash in calldata. */
export async function verifyXLayerReceiptHeadAnchor(input: { txHash: Hex; anchor: Hex }) {
  const [tx, receipt] = await Promise.all([
    client.getTransaction({ hash: input.txHash }),
    client.getTransactionReceipt({ hash: input.txHash }),
  ]);
  if (receipt.status !== "success") throw new Error("The X Layer receipt-anchor transaction did not succeed.");
  if (tx.chainId !== xLayerTestnet.id) throw new Error("Receipt anchor is not on X Layer testnet.");
  if (!tx.to || tx.to.toLowerCase() !== tx.from.toLowerCase()) throw new Error("Receipt anchor must be a self-transaction.");
  if (tx.value !== BigInt(0)) throw new Error("Receipt anchor must not transfer value.");
  const expectedData = concatHex([ANCHOR_TAG, input.anchor]);
  if (tx.input.toLowerCase() !== expectedData.toLowerCase()) throw new Error("Transaction calldata does not contain the expected receipt-head hash.");
  return { chainId: 1952 as const, txHash: input.txHash, from: tx.from.toLowerCase(), blockNumber: receipt.blockNumber.toString(), anchoredAt: new Date().toISOString() };
}
