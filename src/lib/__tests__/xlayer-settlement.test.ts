import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  concatHex,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  formatEther,
  parseAbi,
  type Hex,
} from "viem";
import { entryPoint07Address, getUserOperationHash, type PackedUserOperation } from "viem/account-abstraction";

const mocks = vi.hoisted(() => ({
  getTransaction: vi.fn(),
  getTransactionReceipt: vi.fn(),
  getBlock: vi.fn(),
  getBlockNumber: vi.fn(),
  getCode: vi.fn(),
  request: vi.fn(),
}));
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      getTransaction: mocks.getTransaction,
      getTransactionReceipt: mocks.getTransactionReceipt,
      getBlock: mocks.getBlock,
      getBlockNumber: mocks.getBlockNumber,
      getCode: mocks.getCode,
      request: mocks.request,
    })),
  };
});

const hash = `0x${"ef".repeat(32)}` as Hex;
const anchor = `0x${"ab".repeat(32)}` as Hex;
const account = "0x1234567890abcdef1234567890abcdef12345678" as const;
const payTo = "0x9876543210987654321098765432109876543210" as const;
const bundler = "0x8c8ec9a58ec3b2b6a5bb89f7512b3d3c3038a60e" as const;
const entryPoint = entryPoint07Address;
const receiptData = concatHex(["0x52444b31", anchor]);
const blockHash = `0x${"33".repeat(32)}` as Hex;
const zeroBytes32 = `0x${"00".repeat(32)}` as Hex;
const entryPointAbi = parseAbi([
  "function handleOps((address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)[] ops,address beneficiary)",
  "event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)",
]);

async function verifier() {
  vi.resetModules();
  return import("../server/xlayer-settlement");
}
function configure() {
  const receipt = {
    status: "success",
    blockNumber: BigInt(10),
    blockHash,
    transactionHash: hash,
    logs: [],
  };
  mocks.getTransaction.mockResolvedValue({
    hash,
    blockHash,
    blockNumber: BigInt(10),
    chainId: 1952,
    from: account,
    to: account,
    value: BigInt(0),
    input: receiptData,
  });
  mocks.getTransactionReceipt.mockResolvedValue(receipt);
  mocks.getBlock.mockResolvedValue({ timestamp: BigInt(1_700_000_000), hash: blockHash });
  mocks.getBlockNumber.mockResolvedValue(BigInt(11));
  mocks.getCode.mockResolvedValue("0x");
}

function makeOperation(callData: Hex = receiptData, nonce = BigInt(7)): PackedUserOperation {
  return {
    sender: account,
    nonce,
    initCode: "0x",
    callData,
    accountGasLimits: zeroBytes32,
    preVerificationGas: BigInt(100_000),
    gasFees: zeroBytes32,
    paymasterAndData: "0x",
    signature: "0x1234",
  };
}

function hashOperation(operation: PackedUserOperation) {
  return getUserOperationHash({
    chainId: 1952,
    entryPointAddress: entryPoint,
    entryPointVersion: "0.7",
    userOperation: {
      sender: operation.sender,
      nonce: operation.nonce,
      callData: operation.callData,
      callGasLimit: BigInt(0),
      verificationGasLimit: BigInt(0),
      preVerificationGas: operation.preVerificationGas,
      maxFeePerGas: BigInt(0),
      maxPriorityFeePerGas: BigInt(0),
      signature: operation.signature,
    },
  });
}

function makeUserOperationLog(operation: PackedUserOperation, success = true) {
  const userOpHash = hashOperation(operation);
  const topics = encodeEventTopics({
    abi: entryPointAbi,
    eventName: "UserOperationEvent",
    args: { userOpHash, sender: account, paymaster: "0x0000000000000000000000000000000000000000" },
  });
  const data = encodeAbiParameters(
    [{ type: "uint256" }, { type: "bool" }, { type: "uint256" }, { type: "uint256" }],
    [operation.nonce, success, BigInt(0), BigInt(150_000)],
  );
  return {
    address: entryPoint,
    topics,
    data,
    blockNumber: BigInt(10),
    blockHash,
    transactionHash: hash,
    transactionIndex: BigInt(0),
    logIndex: BigInt(0),
    removed: false,
  };
}

function makeBundle(operation = makeOperation(), success = true) {
  const input = encodeFunctionData({
    abi: entryPointAbi,
    functionName: "handleOps",
    args: [[operation], bundler],
  });
  const tx = {
    hash,
    blockHash,
    blockNumber: BigInt(10),
    chainId: 1952,
    from: bundler,
    to: entryPoint,
    value: BigInt(0),
    input,
  };
  const receipt = {
    status: "success",
    blockNumber: BigInt(10),
    blockHash,
    transactionHash: hash,
    logs: [makeUserOperationLog(operation, success)],
  };
  return { operation, tx, receipt };
}

function wireUserOperationHashLookup(operation: PackedUserOperation, bundle: ReturnType<typeof makeBundle>, trace: unknown, success = true) {
  const userOpHash = hashOperation(operation);
  mocks.getTransaction.mockImplementation(async ({ hash: requestedHash }: { hash: Hex }) => {
    if (requestedHash.toLowerCase() === userOpHash.toLowerCase()) throw new Error("not an outer transaction hash");
    return bundle.tx;
  });
  mocks.getTransactionReceipt.mockImplementation(async ({ hash: requestedHash }: { hash: Hex }) => {
    if (requestedHash.toLowerCase() === userOpHash.toLowerCase()) throw new Error("not an outer transaction hash");
    return bundle.receipt;
  });
  mocks.request.mockImplementation(async ({ method }: { method: string }) => {
    if (method === "eth_getUserOperationReceipt") return { userOpHash, success, receipt: { transactionHash: hash } };
    if (method === "debug_traceTransaction") return trace;
    throw new Error(`unexpected RPC method: ${method}`);
  });
  return userOpHash;
}

function makeTrace(operation: PackedUserOperation, to: string, value: bigint, input: Hex, error?: string) {
  return {
    type: "CALL",
    from: bundler,
    to: entryPoint,
    value: "0x0",
    input: "0x",
    calls: [{
      type: "CALL",
      from: entryPoint,
      to: account,
      value: "0x0",
      input: operation.callData,
      calls: [{
        type: "CALL",
        from: account,
        to,
        value: `0x${value.toString(16)}`,
        input,
        ...(error ? { error } : {}),
      }],
    }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTransaction.mockReset();
  mocks.getTransactionReceipt.mockReset();
  mocks.getBlock.mockReset();
  mocks.getBlockNumber.mockReset();
  mocks.getCode.mockReset();
  mocks.request.mockReset();
  delete process.env.NEXT_PUBLIC_DEMO_OKB_PER_USD;
  configure();
});

describe("X Layer transaction verification", () => {
  it("verifies a successful direct native transfer with its exact recipient, amount and anchor", async () => {
    const units = formatEther(BigInt("1200000000000000"));
    mocks.getTransaction.mockResolvedValue({
      hash,
      blockHash,
      blockNumber: BigInt(10),
      chainId: 1952,
      from: account,
      to: payTo,
      value: BigInt("1200000000000000"),
      input: receiptData,
    });
    const mod = await verifier();
    await expect(mod.verifyXLayerTestnetTransfer({
      txHash: hash,
      payTo,
      expectedFrom: account,
      amountCredits: 12,
      approvedAt: new Date(1_699_999_990_000).toISOString(),
      anchor,
    })).resolves.toMatchObject({ chainId: 1952, from: account, payTo, asset: "test OKB", units, blockNumber: "10" });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("rejects an RPC transaction and receipt that do not match the supplied outer hash", async () => {
    const otherHash = `0x${"aa".repeat(32)}` as Hex;
    mocks.getTransaction.mockResolvedValue({
      hash: otherHash,
      blockHash,
      blockNumber: BigInt(10),
      chainId: 1952,
      from: account,
      to: payTo,
      value: BigInt("1200000000000000"),
      input: receiptData,
    });
    mocks.getTransactionReceipt.mockResolvedValue({
      status: "success",
      blockNumber: BigInt(10),
      blockHash,
      transactionHash: otherHash,
      logs: [],
    });
    const mod = await verifier();
    await expect(mod.verifyXLayerTestnetTransfer({
      txHash: hash,
      payTo,
      expectedFrom: account,
      amountCredits: 12,
      approvedAt: new Date(1_699_999_990_000).toISOString(),
      anchor,
    })).rejects.toThrow("do not match the supplied outer transaction hash");
  });

  it("rejects an otherwise valid-looking transaction from the wrong chain", async () => {
    mocks.getTransaction.mockResolvedValue({
      hash,
      blockHash,
      blockNumber: BigInt(10),
      chainId: 1,
      from: account,
      to: payTo,
      value: BigInt("1200000000000000"),
      input: receiptData,
    });
    const mod = await verifier();
    await expect(mod.verifyXLayerTestnetTransfer({
      txHash: hash,
      payTo,
      expectedFrom: account,
      amountCredits: 12,
      approvedAt: new Date(1_699_999_990_000).toISOString(),
      anchor,
    })).rejects.toThrow("not on X Layer testnet");
  });

  it.each([
    ["recipient", { to: account, value: BigInt("1200000000000000"), input: receiptData }, "neither the expected direct transfer"],
    ["native amount", { to: payTo, value: BigInt("1200000000000001"), input: receiptData }, "value does not match"],
    ["RDK1 anchor", { to: payTo, value: BigInt("1200000000000000"), input: concatHex(["0x52444b31", `0x${"cd".repeat(32)}`]) }, "expected receipt anchor"],
  ] as const)("rejects a direct EOA transfer with a mismatched %s", async (_label, override, message) => {
    mocks.getTransaction.mockResolvedValue({
      hash,
      blockHash,
      blockNumber: BigInt(10),
      chainId: 1952,
      from: account,
      to: override.to,
      value: override.value,
      input: override.input,
    });
    const mod = await verifier();
    await expect(mod.verifyXLayerTestnetTransfer({
      txHash: hash,
      payTo,
      expectedFrom: account,
      amountCredits: 12,
      approvedAt: new Date(1_699_999_990_000).toISOString(),
      anchor,
    })).rejects.toThrow(message);
  });

  it("verifies an ERC-4337 settlement only when its matching UserOperation succeeds and the exact inner call is traced", async () => {
    const operation = makeOperation();
    const bundle = makeBundle(operation);
    mocks.getTransaction.mockResolvedValue(bundle.tx);
    mocks.getTransactionReceipt.mockResolvedValue(bundle.receipt);
    mocks.request.mockResolvedValue(makeTrace(operation, payTo, BigInt("1200000000000000"), receiptData));
    const mod = await verifier();

    await expect(mod.verifyXLayerTestnetTransfer({
      txHash: hash,
      payTo,
      expectedFrom: account,
      amountCredits: 12,
      approvedAt: new Date(1_699_999_990_000).toISOString(),
      anchor,
    })).resolves.toMatchObject({ chainId: 1952, from: account, payTo, units: "0.0012", blockNumber: "10" });
    expect(mocks.request).toHaveBeenCalledWith({ method: "debug_traceTransaction", params: [hash, { tracer: "callTracer" }] });
  });

  it("resolves an injected-provider UserOperation hash to its outer transaction and verifies the exact settlement", async () => {
    const operation = makeOperation();
    const bundle = makeBundle(operation);
    const userOpHash = wireUserOperationHashLookup(operation, bundle, makeTrace(operation, payTo, BigInt("1200000000000000"), receiptData));
    const mod = await verifier();

    await expect(mod.verifyXLayerTestnetTransfer({
      txHash: userOpHash,
      payTo,
      expectedFrom: account,
      amountCredits: 12,
      approvedAt: new Date(1_699_999_990_000).toISOString(),
      anchor,
    })).resolves.toMatchObject({ txHash: hash, chainId: 1952, from: account, payTo, units: "0.0012" });
    expect(mocks.request).toHaveBeenCalledWith({ method: "eth_getUserOperationReceipt", params: [userOpHash] });
    expect(mocks.request).toHaveBeenCalledWith({ method: "debug_traceTransaction", params: [hash, { tracer: "callTracer" }] });
  });

  it("rejects a bundler receipt with success=false before tracing or recording", async () => {
    const operation = makeOperation();
    const bundle = makeBundle(operation);
    const userOpHash = wireUserOperationHashLookup(operation, bundle, makeTrace(operation, payTo, BigInt("1200000000000000"), receiptData), false);
    const mod = await verifier();

    await expect(mod.verifyXLayerTestnetTransfer({
      txHash: userOpHash,
      payTo,
      expectedFrom: account,
      amountCredits: 12,
      approvedAt: new Date(1_699_999_990_000).toISOString(),
      anchor,
    })).rejects.toThrow("bundler reports that the ERC-4337 UserOperation failed");
    expect(mocks.request).toHaveBeenCalledOnce();
  });

  it("rejects a bundler receipt that names a different UserOperation hash", async () => {
    const operation = makeOperation();
    const userOpHash = hashOperation(operation);
    mocks.getTransaction.mockRejectedValue(new Error("not an outer transaction hash"));
    mocks.getTransactionReceipt.mockRejectedValue(new Error("not an outer transaction hash"));
    mocks.request.mockResolvedValue({ userOpHash: `0x${"cd".repeat(32)}`, success: true, receipt: { transactionHash: hash } });
    const mod = await verifier();

    await expect(mod.verifyXLayerTestnetTransfer({
      txHash: userOpHash,
      payTo,
      expectedFrom: account,
      amountCredits: 12,
      approvedAt: new Date(1_699_999_990_000).toISOString(),
      anchor,
    })).rejects.toThrow("does not correlate the supplied UserOperation hash");
    expect(mocks.request).toHaveBeenCalledOnce();
  });

  it("rejects an outer-success bundle when UserOperationEvent.success is false", async () => {
    const operation = makeOperation();
    const bundle = makeBundle(operation, false);
    mocks.getTransaction.mockResolvedValue(bundle.tx);
    mocks.getTransactionReceipt.mockResolvedValue(bundle.receipt);
    const mod = await verifier();

    await expect(mod.verifyXLayerTestnetTransfer({
      txHash: hash,
      payTo,
      expectedFrom: account,
      amountCredits: 12,
      approvedAt: new Date(1_699_999_990_000).toISOString(),
      anchor,
    })).rejects.toThrow("UserOperation failed");
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("rejects duplicate UserOperationEvent entries for the same operation", async () => {
    const operation = makeOperation();
    const bundle = makeBundle(operation);
    bundle.receipt.logs = [makeUserOperationLog(operation), makeUserOperationLog(operation)];
    mocks.getTransaction.mockResolvedValue(bundle.tx);
    mocks.getTransactionReceipt.mockResolvedValue(bundle.receipt);
    const mod = await verifier();

    await expect(mod.verifyXLayerTestnetTransfer({
      txHash: hash,
      payTo,
      expectedFrom: account,
      amountCredits: 12,
      approvedAt: new Date(1_699_999_990_000).toISOString(),
      anchor,
    })).rejects.toThrow("exactly one canonical UserOperationEvent");
  });

  it("rejects a matching UserOperation event attached to a different outer transaction hash", async () => {
    const operation = makeOperation();
    const bundle = makeBundle(operation);
    bundle.receipt.logs[0].transactionHash = `0x${"aa".repeat(32)}`;
    mocks.getTransaction.mockResolvedValue(bundle.tx);
    mocks.getTransactionReceipt.mockResolvedValue(bundle.receipt);
    const mod = await verifier();

    await expect(mod.verifyXLayerTestnetTransfer({
      txHash: hash,
      payTo,
      expectedFrom: account,
      amountCredits: 12,
      approvedAt: new Date(1_699_999_990_000).toISOString(),
      anchor,
    })).rejects.toThrow("exactly one canonical UserOperationEvent");
  });

  it("fails closed when the matching operation has no UserOperationEvent", async () => {
    const operation = makeOperation();
    const bundle = makeBundle(operation);
    bundle.receipt.logs = [];
    mocks.getTransaction.mockResolvedValue(bundle.tx);
    mocks.getTransactionReceipt.mockResolvedValue(bundle.receipt);
    const mod = await verifier();

    await expect(mod.verifyXLayerTestnetTransfer({
      txHash: hash,
      payTo,
      expectedFrom: account,
      amountCredits: 12,
      approvedAt: new Date(1_699_999_990_000).toISOString(),
      anchor,
    })).rejects.toThrow("execution is unverifiable");
  });

  it("fails closed when a successful UserOperation cannot be traced", async () => {
    const operation = makeOperation();
    const bundle = makeBundle(operation);
    mocks.getTransaction.mockResolvedValue(bundle.tx);
    mocks.getTransactionReceipt.mockResolvedValue(bundle.receipt);
    mocks.request.mockRejectedValue(new Error("HTTP 403"));
    const mod = await verifier();

    await expect(mod.verifyXLayerTestnetTransfer({
      txHash: hash,
      payTo,
      expectedFrom: account,
      amountCredits: 12,
      approvedAt: new Date(1_699_999_990_000).toISOString(),
      anchor,
    })).rejects.toThrow("trace-capable X Layer RPC");
  });

  it.each([
    ["recipient", account, BigInt("1200000000000000"), receiptData],
    ["native amount", payTo, BigInt("1200000000000001"), receiptData],
    ["RDK1 anchor", payTo, BigInt("1200000000000000"), concatHex(["0x52444b31", `0x${"cd".repeat(32)}`])],
  ] as const)("rejects an ERC-4337 inner execution with a mismatched %s", async (_label, to, value, data) => {
    const operation = makeOperation();
    const bundle = makeBundle(operation);
    mocks.getTransaction.mockResolvedValue(bundle.tx);
    mocks.getTransactionReceipt.mockResolvedValue(bundle.receipt);
    mocks.request.mockResolvedValue(makeTrace(operation, to, value, data));
    const mod = await verifier();

    await expect(mod.verifyXLayerTestnetTransfer({
      txHash: hash,
      payTo,
      expectedFrom: account,
      amountCredits: 12,
      approvedAt: new Date(1_699_999_990_000).toISOString(),
      anchor,
    })).rejects.toThrow("does not prove exactly one successful inner call");
  });

  it("rejects an ERC-4337 UserOperation that contains a different RDK1 anchor", async () => {
    const operation = makeOperation(concatHex(["0x52444b31", `0x${"cd".repeat(32)}`]));
    const bundle = makeBundle(operation);
    mocks.getTransaction.mockResolvedValue(bundle.tx);
    mocks.getTransactionReceipt.mockResolvedValue(bundle.receipt);
    const mod = await verifier();

    await expect(mod.verifyXLayerTestnetTransfer({
      txHash: hash,
      payTo,
      expectedFrom: account,
      amountCredits: 12,
      approvedAt: new Date(1_699_999_990_000).toISOString(),
      anchor,
    })).rejects.toThrow("expected receipt anchor is not present");
  });

  it("rejects a failed direct transaction", async () => {
    mocks.getTransactionReceipt.mockResolvedValue({ status: "reverted", blockNumber: BigInt(10), blockHash, transactionHash: hash, logs: [] });
    const mod = await verifier();
    await expect(mod.verifyXLayerTestnetTransfer({
      txHash: hash,
      payTo,
      expectedFrom: account,
      amountCredits: 12,
      approvedAt: new Date(1_699_999_990_000).toISOString(),
      anchor,
    })).rejects.toThrow("transaction did not succeed");
  });

  it("continues to verify a separate zero-value direct receipt-head anchor after L2 confirmation", async () => {
    const mod = await verifier();
    await expect(mod.verifyXLayerReceiptHeadAnchor({ txHash: hash, anchor })).resolves.toMatchObject({
      chainId: 1952,
      txHash: hash,
      from: account,
      blockNumber: "10",
      anchoredAt: new Date(1_700_000_000_000).toISOString(),
    });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("rejects a direct self-anchor from an address with contract code", async () => {
    mocks.getCode.mockResolvedValue("0x6000");
    const mod = await verifier();
    await expect(mod.verifyXLayerReceiptHeadAnchor({ txHash: hash, anchor }))
      .rejects.toThrow("direct self-transaction from a contract wallet");
  });

  it("rejects a direct EOA receipt anchor containing a different RDK1 hash", async () => {
    mocks.getTransaction.mockResolvedValue({
      hash,
      blockHash,
      blockNumber: BigInt(10),
      chainId: 1952,
      from: account,
      to: account,
      value: BigInt(0),
      input: concatHex(["0x52444b31", `0x${"cd".repeat(32)}`]),
    });
    const mod = await verifier();
    await expect(mod.verifyXLayerReceiptHeadAnchor({ txHash: hash, anchor }))
      .rejects.toThrow("does not contain the expected receipt-head hash");
  });

  it("verifies an EntryPoint-bundled receipt anchor from its successful operation and exact self-call trace", async () => {
    const operation = makeOperation();
    const bundle = makeBundle(operation);
    mocks.getTransaction.mockResolvedValue(bundle.tx);
    mocks.getTransactionReceipt.mockResolvedValue(bundle.receipt);
    mocks.request.mockResolvedValue(makeTrace(operation, account, BigInt(0), receiptData));
    const mod = await verifier();

    await expect(mod.verifyXLayerReceiptHeadAnchor({ txHash: hash, anchor })).resolves.toMatchObject({
      chainId: 1952,
      txHash: hash,
      from: account,
      blockNumber: "10",
      anchoredAt: new Date(1_700_000_000_000).toISOString(),
    });
    expect(mocks.request).toHaveBeenCalledOnce();
  });

  it("resolves a provider UserOperation hash for EntryPoint-bundled receipt anchoring", async () => {
    const operation = makeOperation();
    const bundle = makeBundle(operation);
    const userOpHash = wireUserOperationHashLookup(operation, bundle, makeTrace(operation, account, BigInt(0), receiptData));
    const mod = await verifier();

    await expect(mod.verifyXLayerReceiptHeadAnchor({ txHash: userOpHash, anchor }))
      .resolves.toMatchObject({ txHash: hash, from: account, blockNumber: "10" });
    expect(mocks.request).toHaveBeenCalledWith({ method: "eth_getUserOperationReceipt", params: [userOpHash] });
    expect(mocks.request).toHaveBeenCalledWith({ method: "debug_traceTransaction", params: [hash, { tracer: "callTracer" }] });
  });

  it("rejects an EntryPoint receipt-anchor operation with a different RDK1 hash", async () => {
    const operation = makeOperation(concatHex(["0x52444b31", `0x${"cd".repeat(32)}`]));
    const bundle = makeBundle(operation);
    mocks.getTransaction.mockResolvedValue(bundle.tx);
    mocks.getTransactionReceipt.mockResolvedValue(bundle.receipt);
    const mod = await verifier();

    await expect(mod.verifyXLayerReceiptHeadAnchor({ txHash: hash, anchor }))
      .rejects.toThrow("requested receipt anchor");
  });

  it("does not accept a failed UserOperation as a receipt anchor", async () => {
    const operation = makeOperation();
    const bundle = makeBundle(operation, false);
    mocks.getTransaction.mockResolvedValue(bundle.tx);
    mocks.getTransactionReceipt.mockResolvedValue(bundle.receipt);
    const mod = await verifier();

    await expect(mod.verifyXLayerReceiptHeadAnchor({ txHash: hash, anchor })).rejects.toThrow("UserOperation failed");
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("rejects a call trace with an errored root even if it contains a matching child call", async () => {
    const operation = makeOperation();
    const bundle = makeBundle(operation);
    mocks.getTransaction.mockResolvedValue(bundle.tx);
    mocks.getTransactionReceipt.mockResolvedValue(bundle.receipt);
    mocks.request.mockResolvedValue({ ...makeTrace(operation, account, BigInt(0), receiptData), error: "execution reverted" });
    const mod = await verifier();

    await expect(mod.verifyXLayerReceiptHeadAnchor({ txHash: hash, anchor }))
      .rejects.toThrow("incomplete call trace");
  });
  it("rejects a positive configured rate that rounds the transfer down to zero", async () => {
    process.env.NEXT_PUBLIC_DEMO_OKB_PER_USD = "0.00000000000000000001";
    mocks.getTransaction.mockResolvedValue({
      hash, blockHash, blockNumber: BigInt(10), chainId: 1952, from: account, to: payTo,
      value: BigInt(0), input: receiptData,
    });
    const mod = await verifier();
    await expect(mod.verifyXLayerTestnetTransfer({
      txHash: hash, payTo, expectedFrom: account, amountCredits: 12,
      approvedAt: new Date(1_699_999_990_000).toISOString(), anchor,
    })).rejects.toThrow("rounds this proposal to zero OKB");
  });

  it("rejects a self-transfer before accepting an otherwise valid transaction", async () => {
    const mod = await verifier();
    await expect(mod.verifyXLayerTestnetTransfer({
      txHash: hash, payTo: account, expectedFrom: account, amountCredits: 12,
      approvedAt: new Date(1_699_999_990_000).toISOString(), anchor,
    })).rejects.toThrow("self-transfer");
    expect(mocks.getTransaction).not.toHaveBeenCalled();
  });

  it("rejects contract recipients rather than sending receipt calldata to an unknown contract", async () => {
    mocks.getCode.mockResolvedValue("0x60006000");
    mocks.getTransaction.mockResolvedValue({
      hash, blockHash, blockNumber: BigInt(10), chainId: 1952, from: account, to: payTo,
      value: BigInt("1200000000000000"), input: receiptData,
    });
    const mod = await verifier();
    await expect(mod.verifyXLayerTestnetTransfer({
      txHash: hash, payTo, expectedFrom: account, amountCredits: 12,
      approvedAt: new Date(1_699_999_990_000).toISOString(), anchor,
    })).rejects.toThrow("Contract recipients are not supported");
  });

  it("rejects a successful-looking inner transfer nested under a reverted smart-account execution frame", async () => {
    const operation = makeOperation();
    const bundle = makeBundle(operation, true);
    const trace = makeTrace(operation, payTo, BigInt("1200000000000000"), receiptData) as any;
    trace.calls[0].error = "execution reverted";
    const userOpHash = wireUserOperationHashLookup(operation, bundle, trace);
    const mod = await verifier();
    await expect(mod.verifyXLayerTestnetTransfer({
      txHash: userOpHash, payTo, expectedFrom: account, amountCredits: 12,
      approvedAt: new Date(1_699_999_990_000).toISOString(), anchor,
    })).rejects.toThrow("does not prove exactly one successful inner call");
  });

});
