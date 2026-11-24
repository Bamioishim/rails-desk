/** Browser wallet helpers for X Layer testnet (chain 1952). */
import {
  concatHex, createPublicClient, createWalletClient, custom, http,
  type Address, type EIP1193Provider, type Hex,
} from "viem";
import { xLayerTestnet } from "./chains";
import { XLAYER_SETTLEMENT_PAUSED_MESSAGE } from "./xlayer-settlement-safety";
export const ANCHOR_TAG = "0x52444b31" as const;
declare global { interface Window { ethereum?: EIP1193Provider; okxwallet?: EIP1193Provider } }
let activeAccount: Address | null = null;
let activeProvider: EIP1193Provider | null = null;
let sessionGeneration = 0;
let providerCleanups: (() => void)[] = [];
const subscribers = new Set<(address: Address | null) => void>();
function notify(address: Address | null) { for (const fn of subscribers) fn(address); }
function clearActive() {
  sessionGeneration++;
  for (const cleanup of providerCleanups) cleanup();
  providerCleanups = [];
  activeProvider = null; activeAccount = null;
  notify(null);
}
function injectedProviderFromWindow(): EIP1193Provider | null {
  if (typeof window === "undefined") return null;
  return window.okxwallet ?? window.ethereum ?? null;
}
export function injectedProvider(): EIP1193Provider | null { return activeProvider ?? injectedProviderFromWindow(); }
export const testnetClient = createPublicClient({ chain: xLayerTestnet, transport: http(process.env.NEXT_PUBLIC_XLAYER_TESTNET_RPC_URL || xLayerTestnet.rpcUrls.default.http[0]) });
export async function connectWallet(): Promise<Address> {
  clearActive();
  const provider = injectedProviderFromWindow();
  if (!provider) throw new Error("No browser wallet found. Install an EVM wallet extension such as OKX Wallet or MetaMask, or keep using demo mode.");
  const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
  const address = accounts?.[0];
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("The wallet did not share a valid account.");
  await ensureTestnet(provider);
  if (provider !== injectedProviderFromWindow() || !await inspectSession(provider, address as Address)) {
    throw new Error("Could not confirm the connected account on X Layer Testnet. Reconnect after switching networks in your wallet.");
  }
  const connectedAddress = address as Address;
  activeProvider = provider;
  activeAccount = connectedAddress;
  const invalidate = () => { if (activeProvider === provider) clearActive(); };
  const onAccountsChanged = (accounts: Address[]) => {
    if (!accounts?.[0] || accounts[0].toLowerCase() !== connectedAddress.toLowerCase()) invalidate();
  };
  const onChainChanged = () => invalidate();
  const onDisconnect = () => invalidate();
  provider.on("accountsChanged", onAccountsChanged);
  provider.on("chainChanged", onChainChanged);
  provider.on("disconnect", onDisconnect);
  providerCleanups = [
    () => provider.removeListener("accountsChanged", onAccountsChanged),
    () => provider.removeListener("chainChanged", onChainChanged),
    () => provider.removeListener("disconnect", onDisconnect),
  ];
  notify(connectedAddress);
  return connectedAddress;
}
export async function disconnectWallet(): Promise<void> { clearActive(); }
export function subscribeWallet(listener: (address: Address | null) => void): () => void {
  subscribers.add(listener); listener(activeAccount); return () => { subscribers.delete(listener); };
}
export function getConnectedWallet(): Address | null { return activeAccount; }
export async function ensureTestnet(providerOverride?: EIP1193Provider) {
  const provider = providerOverride ?? injectedProvider(); if (!provider) throw new Error("No browser wallet found.");
  const chainHex = `0x${xLayerTestnet.id.toString(16)}`;
  try { await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainHex }] }); }
  catch (error) {
    const code = (error as { code?: number })?.code;
    if (code !== 4902 && code !== -32603) throw error;
    await provider.request({ method: "wallet_addEthereumChain", params: [{ chainId: chainHex, chainName: xLayerTestnet.name, nativeCurrency: xLayerTestnet.nativeCurrency, rpcUrls: [...xLayerTestnet.rpcUrls.default.http], blockExplorerUrls: [xLayerTestnet.blockExplorers.default.url] }] });
  }
}
async function inspectSession(provider: EIP1193Provider, expected?: Address): Promise<boolean> {
  const [chain, accounts] = await Promise.all([provider.request({ method: "eth_chainId" }), provider.request({ method: "eth_accounts" })]) as [string | number, string[]];
  const chainId = typeof chain === "number" ? chain : Number.parseInt(chain, 16);
  const account = accounts?.[0];
  return chainId === xLayerTestnet.id && !!account && (!expected || account.toLowerCase() === expected.toLowerCase());
}
type SigningSnapshot = { provider: EIP1193Provider; from: Address; generation: number; account: Address };
function assertSnapshot(snapshot: SigningSnapshot) {
  const providerReplaced = injectedProviderFromWindow() !== snapshot.provider;
  if (providerReplaced && activeProvider === snapshot.provider) clearActive();
  if (providerReplaced || sessionGeneration !== snapshot.generation || activeProvider !== snapshot.provider || activeAccount?.toLowerCase() !== snapshot.account.toLowerCase()) throw new Error("Wallet session changed before signing. Reconnect and retry.");
}
async function requireSigningProvider(): Promise<SigningSnapshot> {
  const provider = activeProvider;
  const account = activeAccount;
  if (!provider || !account) throw new Error("Connect a browser wallet before sending.");
  const generation = sessionGeneration;
  const valid = await inspectSession(provider, account);
  assertSnapshot({ provider, from: account, generation, account });
  if (!valid) { clearActive(); throw new Error("Wallet account or network changed. Reconnect X Layer Testnet before sending."); }
  const accounts = await provider.request({ method: "eth_accounts" }) as string[];
  assertSnapshot({ provider, from: account, generation, account });
  const from = accounts[0] as Address;
  if (from.toLowerCase() !== account.toLowerCase()) { clearActive(); throw new Error("Wallet account changed. Reconnect before sending."); }
  return { provider, from, generation, account };
}
export type TransferSettings = { token: Address | null; okbPerUsd: number };
export function transferSettings(): TransferSettings {
  const token = process.env.NEXT_PUBLIC_XLAYER_TESTNET_TOKEN; const rate = Number(process.env.NEXT_PUBLIC_DEMO_OKB_PER_USD ?? "0.0001");
  return { token: token && /^0x[0-9a-fA-F]{40}$/.test(token) ? token as Address : null, okbPerUsd: Number.isFinite(rate) && rate > 0 ? rate : 0.0001 };
}
export type TransferResult = { chainId: number; hash: Hex; from: Address; to: Address; asset: string; units: string; anchor: Hex; anchored: boolean; blockNumber: string; status: "success" | "reverted" };
async function signingClient() {
  const snapshot = await requireSigningProvider();
  const { provider, from } = snapshot;
  // Recheck after a possible user-directed network switch and before every signature.
  await ensureTestnet(provider);
  assertSnapshot(snapshot);
  const valid = await inspectSession(provider, snapshot.account);
  assertSnapshot(snapshot);
  if (!valid) throw new Error("Wallet account or network changed before signing. Reconnect and retry.");
  return { wallet: createWalletClient({ chain: xLayerTestnet, transport: custom(snapshot.provider) }), from, assertCurrent: () => assertSnapshot(snapshot) };
}
export async function sendRailTransfer(_input: { to: Address; amountUsd: number; anchor: Hex }): Promise<TransferResult> {
  throw new Error(XLAYER_SETTLEMENT_PAUSED_MESSAGE);
}
export async function sendTestnetOkbTransfer(_input: { to: Address; amountCredits: number; anchor: Hex; expectedFrom?: Address; expectedUnits?: string; onBeforeSubmit?: () => void; onSubmitted?: (hash: Hex, from: Address) => void }): Promise<{ hash: Hex; from: Address; to: Address; units: string; blockNumber: string; chainId: number }> {
  throw new Error(XLAYER_SETTLEMENT_PAUSED_MESSAGE);
}
export async function sendReceiptHeadAnchor({ headHash, expectedFrom, onBeforeSubmit, onSubmitted }: { headHash: Hex; expectedFrom?: Address; onBeforeSubmit?: () => void; onSubmitted?: (hash: Hex, from: Address) => void }) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(headHash)) throw new Error("Receipt head must be a 32-byte hash.");
  if (expectedFrom && !/^0x[0-9a-fA-F]{40}$/.test(expectedFrom)) throw new Error("The reviewed sender must be a valid EVM address.");
  const { wallet, from, assertCurrent } = await signingClient();
  if (expectedFrom && from.toLowerCase() !== expectedFrom.toLowerCase()) throw new Error("The connected wallet no longer matches the reviewed sender. Review the transaction again.");
  assertCurrent(); onBeforeSubmit?.(); const hash = await wallet.sendTransaction({ account: from, to: from, value: BigInt(0), data: concatHex([ANCHOR_TAG, headHash]), chain: xLayerTestnet });
  // Persistence callback errors must not mask a successfully broadcast transaction/hash.
  try { onSubmitted?.(hash, from); } catch (error) { console.error("Could not persist submitted receipt anchor hash; transaction was broadcast:", error); }
  try {
    const receipt = await testnetClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
    if (receipt.status !== "success") throw new Error("The receipt-head anchor transaction reverted.");
    return { hash, from, blockNumber: receipt.blockNumber.toString(), chainId: xLayerTestnet.id };
  } catch (error) {
    if ((error as Error)?.message?.includes("reverted")) throw error;
    if (/timeout|timed out/i.test((error as Error)?.name ?? "") || /timeout|timed out/i.test((error as Error)?.message ?? "")) return { hash, from, blockNumber: "pending", chainId: xLayerTestnet.id };
    throw error;
  }
}
export async function verifyAnchor(hash: Hex, anchor: Hex) { const tx = await testnetClient.getTransaction({ hash }); return tx.input.toLowerCase().endsWith(concatHex([ANCHOR_TAG, anchor]).slice(2).toLowerCase()); }
export async function receiptAnchor(payload: unknown): Promise<Hex> { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload))); return `0x${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")}`; }
