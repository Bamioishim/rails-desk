import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { XLAYER_SETTLEMENT_PAUSED_MESSAGE } from "../xlayer-settlement-safety";

const mocks = vi.hoisted(() => ({
  sendTransaction: vi.fn(), walletClientOptions: vi.fn(), readContract: vi.fn(), getCode: vi.fn(), waitForTransactionReceipt: vi.fn(),
}));
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return { ...actual, createWalletClient: vi.fn((options) => { mocks.walletClientOptions(options); return { sendTransaction: mocks.sendTransaction }; }), createPublicClient: vi.fn(() => ({ readContract: mocks.readContract, getCode: mocks.getCode, waitForTransactionReceipt: mocks.waitForTransactionReceipt })) };
});

const accountA = "0x1234567890abcdef1234567890abcdef12345678" as const;
const accountB = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as const;
const receiver = "0x9876543210987654321098765432109876543210" as const;
const anchor = `0x${"ab".repeat(32)}` as const;
const headHash = `0x${"cd".repeat(32)}` as const;
type MockProvider = {
  request: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  emit: (event: string, ...args: unknown[]) => void;
};
function makeProvider(account: string = accountA): MockProvider {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  return {
    request: vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [account];
      if (method === "eth_chainId") return "0x7a0";
      return null;
    }),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => { handlers.set(event, handler); }),
    removeListener: vi.fn((event: string) => { handlers.delete(event); }),
    emit: (event: string, ...args: unknown[]) => handlers.get(event)?.(...args),
  };
}
let provider: MockProvider;
let wallet: typeof import("../xlayer-wallet");
async function freshWallet(account: string = accountA, injectedAs: "okxwallet" | "ethereum" = "okxwallet") {
  provider = makeProvider(account);
  Object.defineProperty(globalThis, "window", { configurable: true, value: { [injectedAs]: provider } });
  mocks.sendTransaction.mockReset().mockResolvedValue(`0x${"ef".repeat(32)}`);
  mocks.readContract.mockReset().mockResolvedValue(18);
  mocks.getCode.mockReset().mockResolvedValue("0x");
  mocks.waitForTransactionReceipt.mockReset().mockResolvedValue({ status: "success", blockNumber: BigInt(42) });
  vi.resetModules();
  wallet = await import("../xlayer-wallet");
  return wallet.connectWallet();
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => { delete (globalThis as { window?: unknown }).window; });

describe("injected EIP-1193 wallet session", () => {
  it("connects through an injected provider without requesting a signature or transaction", async () => {
    expect(await freshWallet(accountB)).toBe(accountB);
    expect(provider.request.mock.calls.map(([args]) => args.method)).toEqual(expect.arrayContaining(["eth_requestAccounts", "wallet_switchEthereumChain", "eth_chainId", "eth_accounts"]));
    expect(provider.request.mock.calls.map(([args]) => args.method)).not.toEqual(expect.arrayContaining(["eth_sign", "personal_sign", "eth_sendTransaction"]));
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
    expect(wallet.getConnectedWallet()).toBe(accountB);
  });

  it("uses the standard ethereum injection when no OKX provider is present", async () => {
    expect(await freshWallet(accountA, "ethereum")).toBe(accountA);
    expect(wallet.getConnectedWallet()).toBe(accountA);
  });

  it.each([
    ["accountsChanged", [accountB]],
    ["accountsChanged", []],
    ["chainChanged", ["0x1"]],
    ["disconnect", [new Error("provider disconnected")]],
  ])("blocks signing after injected provider %s invalidates the session", async (event, args) => {
    await freshWallet(); provider.emit(event, ...args);
    await expect(wallet.sendReceiptHeadAnchor({ headHash })).rejects.toThrow(/Connect a browser wallet/i);
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it("keeps the session when accountsChanged repeats the connected account", async () => {
    await freshWallet(); provider.emit("accountsChanged", [accountA]);
    expect(wallet.getConnectedWallet()).toBe(accountA);
  });

  it("removes old provider lifecycle listeners when reconnecting", async () => {
    await freshWallet();
    await wallet.connectWallet();
    expect(provider.removeListener.mock.calls.map(([event]) => event)).toEqual(expect.arrayContaining(["accountsChanged", "chainChanged", "disconnect"]));
  });

  it("blocks signing if the account changes during asynchronous validation", async () => {
    await freshWallet();
    let release!: (value: string[]) => void;
    let markReached!: () => void;
    const accountsRequested = new Promise<void>((resolve) => { markReached = resolve; });
    provider.request.mockImplementation(({ method }: { method: string }) => method === "eth_chainId" ? Promise.resolve("0x7a0") : method === "eth_accounts" ? new Promise<string[]>((resolve) => { release = resolve; markReached(); }) : null);
    const send = wallet.sendReceiptHeadAnchor({ headHash });
    await accountsRequested;
    provider.emit("accountsChanged", [accountB]); release([accountB]);
    await expect(send).rejects.toThrow(/session changed|Connect a browser wallet/i);
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it("blocks signing when the provider reports a different account or chain", async () => {
    await freshWallet();
    provider.request.mockImplementation(async ({ method }: { method: string }) => method === "eth_chainId" ? "0x1" : method === "eth_accounts" ? [accountB] : null);
    await expect(wallet.sendReceiptHeadAnchor({ headHash })).rejects.toThrow(/account or network changed/i);
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it("blocks signing if the injected provider is replaced after connection", async () => {
    await freshWallet();
    const replacement = makeProvider();
    (globalThis.window as unknown as { okxwallet: MockProvider }).okxwallet = replacement;
    await expect(wallet.sendReceiptHeadAnchor({ headHash })).rejects.toThrow(/session changed/i);
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it("refuses settlement and anchor signing if the sender differs from the reviewed address", async () => {
    await freshWallet(accountB);
    await expect(wallet.sendTestnetOkbTransfer({ to: receiver, amountCredits: 1, anchor, expectedFrom: accountA })).rejects.toThrow(XLAYER_SETTLEMENT_PAUSED_MESSAGE);
    await expect(wallet.sendReceiptHeadAnchor({ headHash, expectedFrom: accountA })).rejects.toThrow(/matches the reviewed sender/i);
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it("does not open the wallet if pre-submission recovery persistence fails", async () => {
    await freshWallet();
    const persistFailure = () => { throw new Error("recovery storage unavailable"); };
    await expect(wallet.sendTestnetOkbTransfer({ to: receiver, amountCredits: 1, anchor, onBeforeSubmit: persistFailure })).rejects.toThrow(XLAYER_SETTLEMENT_PAUSED_MESSAGE);
    await expect(wallet.sendReceiptHeadAnchor({ headHash, onBeforeSubmit: persistFailure })).rejects.toThrow(/recovery storage unavailable/i);
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it("blocks settlement before review callbacks or any wallet request", async () => {
    await freshWallet();
    const onBeforeSubmit = vi.fn();
    const onSubmitted = vi.fn();
    await expect(wallet.sendTestnetOkbTransfer({ to: receiver, amountCredits: 1, anchor, expectedUnits: "999.00000000", onBeforeSubmit, onSubmitted })).rejects.toThrow(XLAYER_SETTLEMENT_PAUSED_MESSAGE);
    expect(onBeforeSubmit).not.toHaveBeenCalled();
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
    expect(mocks.getCode).not.toHaveBeenCalled();
  });

  it("runs the durable recovery hook before each wallet transaction", async () => {
    await freshWallet();
    const events: string[] = [];
    mocks.sendTransaction.mockImplementation(async () => { events.push("wallet"); return `0x${"ef".repeat(32)}`; });
    await expect(wallet.sendTestnetOkbTransfer({ to: receiver, amountCredits: 1, anchor, onBeforeSubmit: () => { events.push("settlement-lock"); }, onSubmitted: () => { events.push("settlement-hash"); } })).rejects.toThrow(XLAYER_SETTLEMENT_PAUSED_MESSAGE);
    await wallet.sendReceiptHeadAnchor({ headHash, onBeforeSubmit: () => { events.push("anchor-lock"); }, onSubmitted: () => { events.push("anchor-hash"); } });
    expect(events).toEqual(["anchor-lock", "wallet", "anchor-hash"]);
  });

  it("keeps independently approved receipt anchoring available on X Layer testnet", async () => {
    await freshWallet(accountB);
    await wallet.sendReceiptHeadAnchor({ headHash });
    expect(mocks.sendTransaction).toHaveBeenCalledOnce();
    for (const [request] of mocks.sendTransaction.mock.calls) { expect(request.account).toBe(accountB); expect(request.chain.id).toBe(1952); }
    expect(mocks.sendTransaction.mock.calls[0][0].to).toBe(accountB);
    expect(mocks.sendTransaction.mock.calls[0][0].data).toBe(`0x52444b31${headHash.slice(2)}`);
    expect(provider.request.mock.calls.filter(([args]) => args.method === "wallet_switchEthereumChain")).toHaveLength(2);
    for (const [options] of mocks.walletClientOptions.mock.calls) {
      const transport = options.transport({ chain: options.chain });
      await transport.request({ method: "eth_chainId" });
    }
    expect(provider.request.mock.calls.some(([args]) => args.method === "eth_chainId")).toBe(true);
  });

  it("fails closed on settlement calls even when the recipient is the connected wallet", async () => {
    await freshWallet(accountA);
    await expect(wallet.sendTestnetOkbTransfer({ to: accountA, amountCredits: 1, anchor })).rejects.toThrow(XLAYER_SETTLEMENT_PAUSED_MESSAGE);
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it("blocks every transfer helper before recipient inspection or wallet approval", async () => {
    await freshWallet(accountA);
    provider.request.mockClear();
    await expect(wallet.sendTestnetOkbTransfer({ to: receiver, amountCredits: 1, anchor })).rejects.toThrow(XLAYER_SETTLEMENT_PAUSED_MESSAGE);
    await expect(wallet.sendRailTransfer({ to: receiver, amountUsd: 1, anchor })).rejects.toThrow(XLAYER_SETTLEMENT_PAUSED_MESSAGE);
    expect(provider.request).not.toHaveBeenCalled();
    expect(mocks.getCode).not.toHaveBeenCalled();
    expect(mocks.readContract).not.toHaveBeenCalled();
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it("does not make a recipient-code RPC call or run recovery callbacks while settlement is paused", async () => {
    await freshWallet(accountA);
    mocks.getCode.mockRejectedValueOnce(new Error("RPC unavailable"));
    const beforeSubmit = vi.fn();
    await expect(wallet.sendTestnetOkbTransfer({ to: receiver, amountCredits: 1, anchor, onBeforeSubmit: beforeSubmit })).rejects.toThrow(XLAYER_SETTLEMENT_PAUSED_MESSAGE);
    expect(beforeSubmit).not.toHaveBeenCalled();
    expect(mocks.getCode).not.toHaveBeenCalled();
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it("preserves a broadcast anchor hash on receipt timeout without rebroadcast", async () => {
    await freshWallet();
    const cb = vi.fn();
    mocks.waitForTransactionReceipt.mockRejectedValueOnce(Object.assign(new Error("timed out while waiting"), { name: "WaitForTransactionReceiptTimeoutError" }));
    const result = await wallet.sendReceiptHeadAnchor({ headHash, onSubmitted: cb });
    expect(result).toEqual({ hash: `0x${"ef".repeat(32)}`, from: accountA, blockNumber: "pending", chainId: 1952 });
    expect(cb).toHaveBeenCalledOnce(); expect(cb).toHaveBeenCalledWith(result.hash, accountA);
    expect(mocks.sendTransaction).toHaveBeenCalledOnce();
  });

  it("does not let callback storage failure hide the broadcast hash", async () => {
    await freshWallet(); const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await wallet.sendReceiptHeadAnchor({ headHash, onSubmitted: () => { throw new Error("storage unavailable"); } });
    expect(result.hash).toBe(`0x${"ef".repeat(32)}`); expect(mocks.sendTransaction).toHaveBeenCalledOnce(); err.mockRestore();
  });

  it("rejects malformed transfer and anchor inputs before signing", async () => {
    await freshWallet();
    await expect(wallet.sendTestnetOkbTransfer({ to: "invalid" as typeof receiver, amountCredits: 1, anchor })).rejects.toThrow(XLAYER_SETTLEMENT_PAUSED_MESSAGE);
    await expect(wallet.sendReceiptHeadAnchor({ headHash: "0x12" as typeof headHash })).rejects.toThrow(/32-byte hash/i);
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });
});
