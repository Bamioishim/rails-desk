import {
  concatHex,
  createPublicClient,
  decodeEventLog,
  decodeFunctionData,
  formatEther,
  http,
  isAddress,
  parseAbi,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import {
  entryPoint07Address,
  getUserOperationHash,
  type PackedUserOperation,
  type UserOperation,
} from "viem/account-abstraction";
import { xLayerTestnet } from "../chains";

const ANCHOR_TAG = "0x52444b31" as const;
const MIN_L2_CONFIRMATIONS = BigInt(2);
const ENTRY_POINT_ADDRESS = entryPoint07Address;
const ENTRY_POINT_ABI = parseAbi([
  "function handleOps((address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)[] ops,address beneficiary)",
  "event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)",
]);
const USER_OPERATION_EVENT_TOPIC = "0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f" as Hex;
const client = createPublicClient({
  chain: xLayerTestnet,
  transport: http(process.env.XLAYER_TESTNET_RPC_URL || process.env.NEXT_PUBLIC_XLAYER_TESTNET_RPC_URL || xLayerTestnet.rpcUrls.default.http[0]),
});

type Transaction = Awaited<ReturnType<typeof client.getTransaction>>;
type TransactionReceipt = Awaited<ReturnType<typeof client.getTransactionReceipt>>;
type ExecutionReference = { tx: Transaction; receipt: TransactionReceipt; txHash: Hex; userOperationHash?: Hex };
type CallFrame = {
  type?: string;
  from?: string;
  to?: string | null;
  value?: string;
  input?: string;
  error?: string;
  revertReason?: string;
  calls?: CallFrame[];
};

function isHash32(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

/** Resolve either an outer transaction hash or an injected provider's UserOperation hash. */
async function loadExecutionReference(submittedHash: Hex): Promise<ExecutionReference> {
  try {
    const [tx, receipt] = await Promise.all([
      client.getTransaction({ hash: submittedHash }),
      client.getTransactionReceipt({ hash: submittedHash }),
    ]);
    return { tx, receipt, txHash: submittedHash };
  } catch {
    let result: unknown;
    try {
      const request = client.request as unknown as (args: { method: "eth_getUserOperationReceipt"; params: [Hex] }) => Promise<unknown>;
      result = await request({ method: "eth_getUserOperationReceipt", params: [submittedHash] });
    } catch {
      throw new Error("Could not resolve the submitted hash as an X Layer transaction or a bundler UserOperation receipt; execution is unverifiable.");
    }
    if (!result || typeof result !== "object") {
      throw new Error("The bundler did not return a UserOperation receipt for the submitted hash; execution is unverifiable.");
    }
    const receiptResult = result as Record<string, unknown>;
    const nestedReceipt = receiptResult.receipt && typeof receiptResult.receipt === "object"
      ? receiptResult.receipt as Record<string, unknown>
      : {};
    const operationHash = receiptResult.userOpHash;
    const outerHash = receiptResult.transactionHash ?? nestedReceipt.transactionHash;
    if (!isHash32(operationHash) || operationHash.toLowerCase() !== submittedHash.toLowerCase() || !isHash32(outerHash)) {
      throw new Error("The bundler receipt does not correlate the supplied UserOperation hash to an outer transaction hash.");
    }
    if (receiptResult.success !== true) {
      throw new Error(receiptResult.success === false
        ? "The bundler reports that the ERC-4337 UserOperation failed."
        : "The bundler receipt does not provide an operation-specific success value.");
    }
    let tx: Transaction;
    let receipt: TransactionReceipt;
    try {
      [tx, receipt] = await Promise.all([
        client.getTransaction({ hash: outerHash }),
        client.getTransactionReceipt({ hash: outerHash }),
      ]);
    } catch {
      throw new Error("The bundler receipt points to an outer transaction that cannot be fetched and verified.");
    }
    if (tx.hash.toLowerCase() !== outerHash.toLowerCase() || receipt.transactionHash.toLowerCase() !== outerHash.toLowerCase()) {
      throw new Error("The bundler receipt's outer transaction hash does not match the fetched transaction and receipt.");
    }
    return { tx, receipt, txHash: outerHash, userOperationHash: operationHash };
  }
}

/** Fail closed unless the transaction remains in the same canonical block after two L2 confirmations. */
async function confirmedCanonicalBlock(txHash: Hex, tx: Transaction, receipt: TransactionReceipt) {
  if (tx.hash.toLowerCase() !== txHash.toLowerCase() || receipt.transactionHash.toLowerCase() !== txHash.toLowerCase()) {
    throw new Error("The transaction and receipt do not match the supplied outer transaction hash.");
  }
  if (!tx.blockHash || tx.blockNumber === null || tx.blockNumber === undefined || !receipt.blockHash) {
    throw new Error("The X Layer transaction is not included in a canonical block yet. Retry verification without sending again.");
  }
  if (tx.blockNumber !== receipt.blockNumber || tx.blockHash.toLowerCase() !== receipt.blockHash.toLowerCase()) {
    throw new Error("The transaction and receipt no longer identify the same block. The transaction may have been reorganized; retry verification without sending again.");
  }

  let latestBlock: bigint;
  let canonicalBlock: Awaited<ReturnType<typeof client.getBlock>>;
  let currentTx: Transaction;
  let currentReceipt: TransactionReceipt;
  try {
    [latestBlock, canonicalBlock, currentTx, currentReceipt] = await Promise.all([
      client.getBlockNumber(),
      client.getBlock({ blockNumber: receipt.blockNumber }),
      client.getTransaction({ hash: txHash }),
      client.getTransactionReceipt({ hash: txHash }),
    ]);
  } catch {
    throw new Error("Could not confirm the X Layer transaction's canonical block status. Retry verification without sending again.");
  }

  const confirmationCount = latestBlock >= receipt.blockNumber ? latestBlock - receipt.blockNumber + BigInt(1) : BigInt(0);
  if (confirmationCount < MIN_L2_CONFIRMATIONS) {
    throw new Error(`The X Layer transaction has ${confirmationCount} of ${MIN_L2_CONFIRMATIONS} required L2 confirmations. Wait for more blocks, then retry verification without sending again.`);
  }
  if (!canonicalBlock.hash || canonicalBlock.hash.toLowerCase() !== receipt.blockHash.toLowerCase() ||
      currentTx.hash.toLowerCase() !== txHash.toLowerCase() || !currentTx.blockHash || currentTx.blockNumber !== receipt.blockNumber || currentTx.blockHash.toLowerCase() !== receipt.blockHash.toLowerCase() ||
      currentReceipt.transactionHash.toLowerCase() !== txHash.toLowerCase() || currentReceipt.status !== "success" || currentReceipt.blockNumber !== receipt.blockNumber ||
      !currentReceipt.blockHash || currentReceipt.blockHash.toLowerCase() !== receipt.blockHash.toLowerCase()) {
    throw new Error("The X Layer transaction is no longer in the same successful canonical block. It may have been reorganized; retry verification without sending again.");
  }
  return canonicalBlock;
}

function unpackUserOperation(packed: PackedUserOperation): UserOperation<"0.7"> {
  const accountGasLimits = packed.accountGasLimits.slice(2);
  const gasFees = packed.gasFees.slice(2);
  if (accountGasLimits.length !== 64 || gasFees.length !== 64) {
    throw new Error("The EntryPoint bundle contains malformed packed gas limits; the UserOperation cannot be verified.");
  }

  const initCode = packed.initCode.slice(2);
  if (initCode.length !== 0 && initCode.length < 40) {
    throw new Error("The EntryPoint bundle contains malformed factory data; the UserOperation cannot be verified.");
  }
  const factory = initCode.length ? `0x${initCode.slice(0, 40)}` as Address : undefined;
  const factoryData = initCode.length ? `0x${initCode.slice(40)}` as Hex : undefined;

  const paymasterAndData = packed.paymasterAndData.slice(2);
  if (paymasterAndData.length !== 0 && paymasterAndData.length < 104) {
    throw new Error("The EntryPoint bundle contains malformed paymaster data; the UserOperation cannot be verified.");
  }
  const paymaster = paymasterAndData.length ? `0x${paymasterAndData.slice(0, 40)}` as Address : undefined;
  const paymasterVerificationGasLimit = paymasterAndData.length ? BigInt(`0x${paymasterAndData.slice(40, 72)}`) : undefined;
  const paymasterPostOpGasLimit = paymasterAndData.length ? BigInt(`0x${paymasterAndData.slice(72, 104)}`) : undefined;
  const paymasterData = paymasterAndData.length ? `0x${paymasterAndData.slice(104)}` as Hex : undefined;

  return {
    sender: packed.sender,
    nonce: packed.nonce,
    factory,
    factoryData,
    callData: packed.callData,
    callGasLimit: BigInt(`0x${accountGasLimits.slice(32)}`),
    verificationGasLimit: BigInt(`0x${accountGasLimits.slice(0, 32)}`),
    preVerificationGas: packed.preVerificationGas,
    maxPriorityFeePerGas: BigInt(`0x${gasFees.slice(0, 32)}`),
    maxFeePerGas: BigInt(`0x${gasFees.slice(32)}`),
    paymaster,
    paymasterVerificationGasLimit,
    paymasterPostOpGasLimit,
    paymasterData,
    signature: packed.signature,
  };
}

function decodeHandleOps(tx: Transaction): PackedUserOperation[] {
  if (tx.to?.toLowerCase() !== ENTRY_POINT_ADDRESS.toLowerCase()) {
    throw new Error("The transaction is not an X Layer ERC-4337 EntryPoint bundle.");
  }
  try {
    const decoded = decodeFunctionData({ abi: ENTRY_POINT_ABI, data: tx.input });
    if (decoded.functionName !== "handleOps") throw new Error("Unexpected EntryPoint method.");
    return decoded.args[0] as PackedUserOperation[];
  } catch {
    throw new Error("Could not decode the EntryPoint handleOps bundle; execution is unverifiable.");
  }
}

function operationHash(operation: PackedUserOperation): Hex {
  return getUserOperationHash({
    chainId: xLayerTestnet.id,
    entryPointAddress: ENTRY_POINT_ADDRESS,
    entryPointVersion: "0.7",
    userOperation: unpackUserOperation(operation),
  });
}

function findSuccessfulUserOperation(
  tx: Transaction,
  receipt: TransactionReceipt,
  expectedSender: Address,
  expectedData: Hex,
  expectedOperationHash?: Hex,
) {
  const operations = decodeHandleOps(tx);
  const matchingOperations = operations.filter((operation) => operation.sender.toLowerCase() === expectedSender.toLowerCase());
  if (matchingOperations.length !== 1) {
    throw new Error("The EntryPoint bundle does not contain exactly one UserOperation from the expected wallet; execution is ambiguous.");
  }
  const operation = matchingOperations[0];
  if (!operation.callData.toLowerCase().includes(expectedData.slice(2).toLowerCase())) {
    throw new Error("The expected receipt anchor is not present in the matching UserOperation calldata.");
  }

  let expectedHash: Hex;
  try {
    expectedHash = operationHash(operation);
  } catch {
    throw new Error("The matching UserOperation uses an unsupported or malformed encoding; execution is unverifiable.");
  }
  if (expectedOperationHash && expectedHash.toLowerCase() !== expectedOperationHash.toLowerCase()) {
    throw new Error("The UserOperation embedded in the outer transaction does not match the supplied bundler UserOperation hash.");
  }

  const eventLogs = receipt.logs.filter((log) =>
    log.address.toLowerCase() === ENTRY_POINT_ADDRESS.toLowerCase() &&
    log.topics[0]?.toLowerCase() === USER_OPERATION_EVENT_TOPIC.toLowerCase(),
  );
  const matchingEvents = eventLogs.flatMap((log) => {
    try {
      if (!log.transactionHash || log.transactionHash.toLowerCase() !== tx.hash.toLowerCase() ||
          !log.blockHash || log.blockHash.toLowerCase() !== receipt.blockHash?.toLowerCase() ||
          log.blockNumber !== receipt.blockNumber || log.removed) return [];
      const decoded = decodeEventLog({ abi: ENTRY_POINT_ABI, data: log.data, topics: log.topics as [Hex, ...Hex[]], strict: true });
      if (decoded.eventName !== "UserOperationEvent") return [];
      const args = decoded.args;
      return args.userOpHash.toLowerCase() === expectedHash.toLowerCase() &&
        args.sender.toLowerCase() === expectedSender.toLowerCase() && args.nonce === operation.nonce
        ? [{ args, log }]
        : [];
    } catch {
      return [];
    }
  });
  if (matchingEvents.length !== 1) {
    throw new Error("The transaction does not contain exactly one canonical UserOperationEvent matching the bundled operation; execution is unverifiable.");
  }
  if (!matchingEvents[0].args.success) {
    throw new Error("The ERC-4337 UserOperation failed even though its outer EntryPoint transaction succeeded.");
  }
  return operation;
}

function isCallFrame(value: unknown): value is CallFrame {
  if (!value || typeof value !== "object") return false;
  const frame = value as CallFrame;
  return typeof frame.from === "string" && typeof frame.to === "string" && typeof frame.input === "string" && typeof frame.type === "string";
}

async function getCallTrace(txHash: Hex): Promise<CallFrame> {
  const request = client.request as unknown as (args: {
    method: "debug_traceTransaction";
    params: [Hex, { tracer: "callTracer" }];
  }) => Promise<unknown>;
  let trace: unknown;
  try {
    trace = await request({ method: "debug_traceTransaction", params: [txHash, { tracer: "callTracer" }] });
  } catch {
    throw new Error("A trace-capable X Layer RPC is required to verify the inner UserOperation execution. No settlement or receipt anchor was recorded.");
  }
  if (!isCallFrame(trace) || trace.to?.toLowerCase() !== ENTRY_POINT_ADDRESS.toLowerCase() || !Array.isArray(trace.calls) || trace.error || trace.revertReason) {
    throw new Error("The RPC returned an incomplete call trace.");
  }
  return trace;
}

function assertExactSuccessfulInnerCall(input: {
  trace: CallFrame;
  operation: PackedUserOperation;
  expectedFrom: Address;
  expectedTo: Address;
  expectedValue: bigint;
  expectedData: Hex;
}) {
  const { trace, operation, expectedFrom, expectedTo, expectedValue, expectedData } = input;
  let matchingExecutionFrames = 0;
  let matchingCalls = 0;
  let revertedMatches = 0;

  const visit = (frame: CallFrame, insideOperation: boolean, ancestorsSucceeded = true) => {
    const isOperationFrame = frame.type?.toUpperCase() === "CALL" &&
      frame.from?.toLowerCase() === ENTRY_POINT_ADDRESS.toLowerCase() &&
      frame.to?.toLowerCase() === expectedFrom.toLowerCase() &&
      frame.input?.toLowerCase() === operation.callData.toLowerCase();
    if (isOperationFrame) matchingExecutionFrames++;
    const withinOperation = insideOperation || isOperationFrame;

    const candidate = ancestorsSucceeded && withinOperation && frame.type?.toUpperCase() === "CALL" &&
      frame.from?.toLowerCase() === expectedFrom.toLowerCase() &&
      frame.to?.toLowerCase() === expectedTo.toLowerCase() &&
      frame.input?.toLowerCase() === expectedData.toLowerCase() &&
      typeof frame.value === "string" && BigInt(frame.value) === expectedValue;
    if (candidate) {
      matchingCalls++;
      if (frame.error || frame.revertReason) revertedMatches++;
    }
    const subtreeSucceeded = ancestorsSucceeded && !frame.error && !frame.revertReason;
    for (const child of frame.calls ?? []) visit(child, withinOperation, subtreeSucceeded);
  };

  visit(trace, false);
  if (matchingExecutionFrames !== 1 || matchingCalls !== 1 || revertedMatches !== 0) {
    throw new Error("The call trace does not prove exactly one successful inner call for this UserOperation; execution is unverifiable.");
  }
}

/** Verify a native OKB transfer, including a bundled ERC-4337 operation when its exact inner call is traceable. */
export async function verifyXLayerTestnetTransfer(input: {
  txHash: Hex;
  payTo: Address;
  expectedFrom: Address;
  amountCredits: number;
  approvedAt: string;
  anchor: Hex;
}) {
  if (!isAddress(input.payTo)) throw new Error("Recipient must be a valid EVM address.");
  if (!isAddress(input.expectedFrom)) throw new Error("The expected wallet must be a valid EVM address.");
  if (input.payTo.toLowerCase() === input.expectedFrom.toLowerCase()) throw new Error("A self-transfer cannot settle an approved payment.");
  if (!Number.isFinite(input.amountCredits) || input.amountCredits <= 0) throw new Error("The approved transfer amount must be positive.");
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.anchor)) throw new Error("The receipt anchor must be a 32-byte hash.");

  const { tx, receipt, txHash, userOperationHash } = await loadExecutionReference(input.txHash);
  if (receipt.status !== "success") throw new Error("The X Layer testnet transaction did not succeed.");
  const canonicalBlock = await confirmedCanonicalBlock(txHash, tx, receipt);
  const approvedAt = Date.parse(input.approvedAt);
  if (!Number.isFinite(approvedAt) || Number(canonicalBlock.timestamp) * 1000 + 999 < approvedAt) {
    throw new Error("The testnet transfer must be mined after the proposal was approved.");
  }
  if (tx.chainId !== xLayerTestnet.id) throw new Error("Transaction is not on X Layer testnet.");
  if (userOperationHash && tx.to?.toLowerCase() !== ENTRY_POINT_ADDRESS.toLowerCase()) {
    throw new Error("The bundler receipt's outer transaction is not an X Layer EntryPoint bundle.");
  }

  const rate = Number(process.env.NEXT_PUBLIC_DEMO_OKB_PER_USD ?? "0.0001");
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("The testnet OKB conversion rate is not configured correctly.");
  const expectedAmount = input.amountCredits * rate;
  if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) throw new Error("The expected X Layer testnet transfer amount is invalid.");
  const expectedValue = parseEther(expectedAmount.toFixed(8));
  if (expectedValue <= BigInt(0)) throw new Error("The configured conversion rate rounds this proposal to zero OKB; no zero-value settlement is allowed.");
  const expectedData = concatHex([ANCHOR_TAG, input.anchor]);

  let recipientCode: Hex | undefined;
  try {
    recipientCode = await client.getCode({ address: input.payTo, blockNumber: receipt.blockNumber });
  } catch {
    throw new Error("Could not verify whether the X Layer recipient is a contract. Settlement is blocked rather than risking an unknown contract call.");
  }
  if (recipientCode && recipientCode !== "0x") {
    throw new Error("Contract recipients are not supported for X Layer testnet settlement; use an externally owned account address.");
  }

  if (tx.to?.toLowerCase() === input.payTo.toLowerCase()) {
    if (tx.from.toLowerCase() !== input.expectedFrom.toLowerCase()) throw new Error("Transaction sender does not match the reviewed wallet.");
    if (tx.value !== expectedValue) throw new Error("Transaction value does not match the approved proposal amount.");
    if (tx.input.toLowerCase() !== expectedData.toLowerCase()) throw new Error("Transaction calldata does not contain the expected receipt anchor.");
  } else {
    if (tx.to?.toLowerCase() !== ENTRY_POINT_ADDRESS.toLowerCase() || tx.value !== BigInt(0)) {
      throw new Error("The transaction is neither the expected direct transfer nor a zero-value EntryPoint bundle.");
    }
    const operation = findSuccessfulUserOperation(tx, receipt, input.expectedFrom, expectedData, userOperationHash);
    const trace = await getCallTrace(txHash);
    assertExactSuccessfulInnerCall({
      trace,
      operation,
      expectedFrom: input.expectedFrom,
      expectedTo: input.payTo,
      expectedValue,
      expectedData,
    });
  }

  return {
    chainId: 1952 as const,
    txHash,
    from: input.expectedFrom.toLowerCase(),
    payTo: input.payTo.toLowerCase(),
    asset: "test OKB" as const,
    units: formatEther(expectedValue),
    blockNumber: receipt.blockNumber.toString(),
  };
}

/** Verify a direct or EntryPoint-bundled receipt-head anchor; smart-account calls require a successful matching UserOperationEvent and exact call trace. */
export async function verifyXLayerReceiptHeadAnchor(input: { txHash: Hex; anchor: Hex }) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.anchor)) throw new Error("The receipt head must be a 32-byte hash.");
  const { tx, receipt, txHash, userOperationHash } = await loadExecutionReference(input.txHash);
  if (receipt.status !== "success") throw new Error("The X Layer receipt-anchor transaction did not succeed.");
  const canonicalBlock = await confirmedCanonicalBlock(txHash, tx, receipt);
  if (tx.chainId !== xLayerTestnet.id) throw new Error("Receipt anchor is not on X Layer testnet.");
  if (userOperationHash && tx.to?.toLowerCase() !== ENTRY_POINT_ADDRESS.toLowerCase()) {
    throw new Error("The bundler receipt's outer transaction is not an X Layer EntryPoint bundle.");
  }
  const expectedData = concatHex([ANCHOR_TAG, input.anchor]);

  if (tx.to?.toLowerCase() === tx.from.toLowerCase()) {
    if (tx.value !== BigInt(0)) throw new Error("Receipt anchor must not transfer value.");
    if (tx.input.toLowerCase() !== expectedData.toLowerCase()) throw new Error("Transaction calldata does not contain the expected receipt-head hash.");
    let senderCode: Hex | undefined;
    try {
      senderCode = await client.getCode({ address: tx.from, blockNumber: receipt.blockNumber });
    } catch {
      throw new Error("Could not verify that the direct receipt-anchor sender is an externally owned account.");
    }
    if (senderCode !== "0x") throw new Error("A direct self-transaction from a contract wallet is not a verifiable receipt anchor; use a successful EntryPoint bundle with an execution trace.");
    return {
      chainId: 1952 as const,
      txHash,
      from: tx.from.toLowerCase(),
      blockNumber: receipt.blockNumber.toString(),
      anchoredAt: new Date(Number(canonicalBlock.timestamp) * 1000).toISOString(),
    };
  }

  if (tx.to?.toLowerCase() !== ENTRY_POINT_ADDRESS.toLowerCase() || tx.value !== BigInt(0)) {
    throw new Error("Receipt anchor must be a zero-value self-call or a zero-value EntryPoint bundle.");
  }
  const operations = decodeHandleOps(tx);
  const matchingOperations = operations.filter((operation) => operation.callData.toLowerCase().includes(expectedData.slice(2).toLowerCase()));
  if (matchingOperations.length !== 1) {
    throw new Error("The EntryPoint bundle does not contain exactly one UserOperation with the requested receipt anchor; execution is ambiguous.");
  }
  const operation = matchingOperations[0];
  const sender = operation.sender;
  const successfulOperation = findSuccessfulUserOperation(tx, receipt, sender, expectedData, userOperationHash);
  const trace = await getCallTrace(txHash);
  assertExactSuccessfulInnerCall({
    trace,
    operation: successfulOperation,
    expectedFrom: sender,
    expectedTo: sender,
    expectedValue: BigInt(0),
    expectedData,
  });
  return {
    chainId: 1952 as const,
    txHash,
    from: sender.toLowerCase(),
    blockNumber: receipt.blockNumber.toString(),
    anchoredAt: new Date(Number(canonicalBlock.timestamp) * 1000).toISOString(),
  };
}
