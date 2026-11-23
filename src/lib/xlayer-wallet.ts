/**
 * Browser wallet helpers for X Layer testnet (chain 1952).
 * Uses whatever injected EIP-1193 wallet the user has (OKX Wallet, MetaMask, Rabby...).
 * No private keys are handled by Rails Desk: every transfer is signed in the user's wallet.
 */
import {
  concatHex, createPublicClient, createWalletClient, custom, encodeFunctionData, erc20Abi, http,
  parseEther, parseUnits, type Address, type EIP1193Provider, type Hex,
} from "viem";
import { xLayerTestnet } from "./chains";

/** "RDK1" tag that precedes the 32-byte receipt hash in the transfer calldata. */
export const ANCHOR_TAG = "0x52444b31" as const;

declare global {
  interface Window { ethereum?: EIP1193Provider & { isOkxWallet?: boolean } ; okxwallet?: EIP1193Provider }
}

export function injectedProvider(): EIP1193Provider | null {
  if (typeof window === "undefined") return null;
  return window.okxwallet ?? window.ethereum ?? null;
}

export const testnetClient = createPublicClient({
  chain: xLayerTestnet,
  transport: http(process.env.NEXT_PUBLIC_XLAYER_TESTNET_RPC_URL || xLayerTestnet.rpcUrls.default.http[0]),
});

export async function connectWallet(): Promise<Address> {
  const provider = injectedProvider();
  if (!provider) throw new Error("No browser wallet found. Install OKX Wallet or MetaMask, or keep using demo mode.");
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  if (!accounts?.[0]) throw new Error("The wallet did not share an account.");
  return accounts[0];
}

export async function ensureTestnet() {
  const provider = injectedProvider();
  if (!provider) throw new Error("No browser wallet found.");
  const chainHex = `0x${xLayerTestnet.id.toString(16)}` as const;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainHex }] });
  } catch (error) {
    const code = (error as { code?: number })?.code;
    if (code !== 4902 && code !== -32603) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: chainHex, chainName: xLayerTestnet.name, nativeCurrency: xLayerTestnet.nativeCurrency,
        rpcUrls: [...xLayerTestnet.rpcUrls.default.http], blockExplorerUrls: [xLayerTestnet.blockExplorers.default.url],
      }],
    });
  }
}

export type TransferSettings = { token: Address | null; okbPerUsd: number };
export function transferSettings(): TransferSettings {
  const token = process.env.NEXT_PUBLIC_XLAYER_TESTNET_TOKEN;
  const rate = Number(process.env.NEXT_PUBLIC_DEMO_OKB_PER_USD ?? "0.0001");
  return {
    token: token && /^0x[0-9a-fA-F]{40}$/.test(token) ? (token as Address) : null,
    okbPerUsd: Number.isFinite(rate) && rate > 0 ? rate : 0.0001,
  };
}

export type TransferResult = {
  chainId: number; hash: Hex; from: Address; to: Address; asset: string; units: string;
  anchor: Hex; anchored: boolean; blockNumber: string; status: "success" | "reverted";
};

/** Sends the approved amount on X Layer testnet, with the receipt hash appended to the calldata. */
export async function sendRailTransfer({ to, amountUsd, anchor }: { to: Address; amountUsd: number; anchor: Hex }): Promise<TransferResult> {
  const provider = injectedProvider();
  if (!provider) throw new Error("No browser wallet found.");
  await ensureTestnet();
  const wallet = createWalletClient({ chain: xLayerTestnet, transport: custom(provider) });
  const [from] = await wallet.requestAddresses();
  const settings = transferSettings();
  const tagged = concatHex([ANCHOR_TAG, anchor]);
  let hash: Hex, asset: string, units: string, anchored = true;

  if (settings.token) {
    const [decimals, symbol] = await Promise.all([
      testnetClient.readContract({ address: settings.token, abi: erc20Abi, functionName: "decimals" }),
      testnetClient.readContract({ address: settings.token, abi: erc20Abi, functionName: "symbol" }).catch(() => "token"),
    ]);
    const amount = parseUnits(amountUsd.toFixed(Math.min(decimals, 6)), decimals);
    // Extra bytes after the ABI-encoded arguments are ignored by ERC-20 contracts, so the anchor rides along.
    const data = concatHex([encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] }), tagged]);
    hash = await wallet.sendTransaction({ account: from, to: settings.token, data, chain: xLayerTestnet });
    asset = symbol; units = amountUsd.toFixed(2);
  } else {
    const okb = (amountUsd * settings.okbPerUsd).toFixed(8);
    const code = await testnetClient.getCode({ address: to }).catch(() => undefined);
    anchored = !code || code === "0x"; // contracts may reject unknown calldata, so only tag plain accounts
    hash = await wallet.sendTransaction({ account: from, to, value: parseEther(okb), data: anchored ? tagged : undefined, chain: xLayerTestnet });
    asset = "test OKB"; units = okb;
  }
  const receipt = await testnetClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  return { chainId: xLayerTestnet.id, hash, from, to, asset, units, anchor, anchored, blockNumber: receipt.blockNumber.toString(), status: receipt.status };
}


/** Owner-signed native test OKB transfer used by the approved-proposal settlement flow. */
export async function sendTestnetOkbTransfer({ to, amountCredits, anchor }: { to: Address; amountCredits: number; anchor: Hex }) {
  const provider = injectedProvider();
  if (!provider) throw new Error("No browser wallet found. Install OKX Wallet, MetaMask or Rabby.");
  if (!/^0x[0-9a-fA-F]{40}$/.test(to)) throw new Error("Enter a valid EVM recipient address.");
  if (!Number.isFinite(amountCredits) || amountCredits <= 0) throw new Error("The approved amount must be positive.");
  await ensureTestnet();
  const wallet = createWalletClient({ chain: xLayerTestnet, transport: custom(provider) });
  const [from] = await wallet.requestAddresses();
  if (!from) throw new Error("The connected wallet did not provide an account.");
  const rate = Number(process.env.NEXT_PUBLIC_DEMO_OKB_PER_USD ?? "0.0001");
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Testnet OKB conversion rate is invalid.");
  const units = (amountCredits * rate).toFixed(8);
  const hash = await wallet.sendTransaction({
    account: from,
    to,
    value: parseEther(units),
    data: concatHex([ANCHOR_TAG, anchor]),
    chain: xLayerTestnet,
  });
  const receipt = await testnetClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "success") throw new Error("The X Layer testnet transfer reverted.");
  return { hash, from, to, units, blockNumber: receipt.blockNumber.toString(), chainId: xLayerTestnet.id };
}


/** Owner-signed zero-value transaction that anchors the current receipt-chain head in calldata. */
export async function sendReceiptHeadAnchor({ headHash }: { headHash: Hex }) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(headHash)) throw new Error("Receipt head must be a 32-byte hash.");
  const provider = injectedProvider();
  if (!provider) throw new Error("No browser wallet found. Install OKX Wallet, MetaMask or Rabby.");
  await ensureTestnet();
  const wallet = createWalletClient({ chain: xLayerTestnet, transport: custom(provider) });
  const [from] = await wallet.requestAddresses();
  if (!from) throw new Error("The connected wallet did not provide an account.");
  const hash = await wallet.sendTransaction({
    account: from,
    to: from,
    value: 0n,
    data: concatHex([ANCHOR_TAG, headHash]),
    chain: xLayerTestnet,
  });
  const receipt = await testnetClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "success") throw new Error("The receipt-head anchor transaction reverted.");
  return { hash, from, blockNumber: receipt.blockNumber.toString(), chainId: xLayerTestnet.id };
}

/** Re-reads a transfer from X Layer testnet and checks the receipt hash is in its calldata. */
export async function verifyAnchor(hash: Hex, anchor: Hex) {
  const tx = await testnetClient.getTransaction({ hash });
  return tx.input.toLowerCase().endsWith(concatHex([ANCHOR_TAG, anchor]).slice(2).toLowerCase());
}

/** SHA-256 of the canonical receipt payload, as 0x-prefixed 32 bytes. */
export async function receiptAnchor(payload: unknown): Promise<Hex> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));
  return `0x${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
