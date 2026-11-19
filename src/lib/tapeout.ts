/**
 * Read-only TapeOut reads on X Layer mainnet (chain 196).
 *
 * Contract addresses come from TapeKit (MIT): kernel/src/config.js `L2_CONTRACTS` and
 * send/contracts/script/L2Addresses.sol. Every call here is an `eth_call`: no wallet, no gas, no funds.
 */
import { createPublicClient, http, parseAbi, type Address, type Hex } from "viem";
import { xLayer } from "./chains";
import { POLICY_N_IN, POLICY_N_OUT, decodePolicyOutputs, encodePolicyInputs, fromHex, toHex, type PolicyInputs, type PolicyOutputs } from "./policy-circuit";

export const TAPEOUT_XLAYER = {
  area: 2,
  factory: "0x1f09DAeFA827f02CBb40967cc91b259763760761",
  opener: "0x536adD8F30f03b69f6fbF29d425A816A0dC50106",
  siteRegistry: "0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6",
  domainBinding: "0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9",
  deWebHub: "0xe61A9C7213a6Aa616C246a2B569e555B417b25ee",
} as const satisfies Record<string, Address | number>;

const factoryAbi = parseAbi([
  "function cpuCount() view returns (uint256)",
  "function cpuAt(uint256 i) view returns (address)",
]);
const openerAbi = parseAbi([
  "function accountOf(address cpu, uint256 id) view returns (address)",
  "function isOpened(address cpu, uint256 id) view returns (bool)",
]);
const cpuAbi = parseAbi([
  "function name() view returns (string)",
  "function ownerOf(uint256 id) view returns (address)",
  "function circuitInfo(uint256 id) view returns (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount)",
  "function eval(uint256 id, bytes inputs) view returns (bytes)",
]);

let client: ReturnType<typeof createPublicClient> | null = null;
export function xLayerMainnetClient() {
  client ??= createPublicClient({ chain: xLayer, transport: http(process.env.NEXT_PUBLIC_XLAYER_RPC_URL || xLayer.rpcUrls.default.http[0]) });
  return client;
}

/** Name formats from the TapeKit README: `#1@2.254`, `1.2.254`, `1.2.254.tape`. Area code 2 = X Layer. */
export type TapeName = { id: bigint; processorIndex: bigint; label: string };
export function parseTapeName(value: string): TapeName | null {
  const v = value.trim().toLowerCase().replace(/\.tape\/?$/, "");
  const m = v.match(/^#?(\d+)@2\.(\d+)$/) ?? v.match(/^(\d+)\.2\.(\d+)$/);
  if (!m) return null;
  return { id: BigInt(m[1]), processorIndex: BigInt(m[2]), label: `#${m[1]}@2.${m[2]}` };
}
export const isTapeName = (value: string) => parseTapeName(value) !== null;

export type TapeIdentity = {
  label: string; processor: Address; processorName: string; circuitId: string;
  holder: Address; container: Address; opened: boolean; payTo: Address;
};

/** Resolves a TapeOut circuit name on X Layer to its processor, holder and ERC-6551 container. */
export async function resolveTapeIdentity(value: string): Promise<TapeIdentity> {
  const name = parseTapeName(value);
  if (!name) throw new Error("Use a TapeOut name like #1@2.254 or 1.2.254.tape.");
  const c = xLayerMainnetClient();
  const count = await c.readContract({ address: TAPEOUT_XLAYER.factory, abi: factoryAbi, functionName: "cpuCount" });
  if (name.processorIndex >= count) throw new Error(`Processor ${name.processorIndex} does not exist on X Layer (there are ${count}).`);
  const processor = await c.readContract({ address: TAPEOUT_XLAYER.factory, abi: factoryAbi, functionName: "cpuAt", args: [name.processorIndex] });
  const [processorName, holder, container, opened] = await Promise.all([
    c.readContract({ address: processor, abi: cpuAbi, functionName: "name" }).catch(() => "Processor"),
    c.readContract({ address: processor, abi: cpuAbi, functionName: "ownerOf", args: [name.id] }).catch(() => { throw new Error(`Circuit ${name.label} does not exist on X Layer.`); }),
    c.readContract({ address: TAPEOUT_XLAYER.opener, abi: openerAbi, functionName: "accountOf", args: [processor, name.id] }),
    c.readContract({ address: TAPEOUT_XLAYER.opener, abi: openerAbi, functionName: "isOpened", args: [processor, name.id] }),
  ]);
  // An opened container is the circuit's own account; otherwise pay whoever holds the circuit NFT.
  return { label: name.label, processor, processorName, circuitId: name.id.toString(), holder, container, opened, payTo: opened ? container : holder };
}

export async function tapeOutProcessorCount() {
  const count = await xLayerMainnetClient().readContract({ address: TAPEOUT_XLAYER.factory, abi: factoryAbi, functionName: "cpuCount" });
  return Number(count);
}

/** The taped-out copy of the policy circuit, if Bamio has configured one. */
export function configuredPolicyCircuit(): { processor: Address; id: bigint } | null {
  const processor = process.env.NEXT_PUBLIC_TAPEOUT_POLICY_PROCESSOR;
  const id = process.env.NEXT_PUBLIC_TAPEOUT_POLICY_CIRCUIT_ID;
  if (!processor || !/^0x[0-9a-fA-F]{40}$/.test(processor) || !id || !/^\d+$/.test(id)) return null;
  return { processor: processor as Address, id: BigInt(id) };
}

export type OnchainPolicyResult =
  | { status: "not-configured" }
  | { status: "ok"; outputs: PolicyOutputs; processor: Address; id: string; inputs: Hex }
  | { status: "mismatch"; detail: string }
  | { status: "error"; detail: string };

/** Runs the policy through the taped-out circuit with `eval` on X Layer (read-only). */
export async function evaluatePolicyOnchain(input: PolicyInputs): Promise<OnchainPolicyResult> {
  const cfg = configuredPolicyCircuit();
  if (!cfg) return { status: "not-configured" };
  try {
    const c = xLayerMainnetClient();
    const info = await c.readContract({ address: cfg.processor, abi: cpuAbi, functionName: "circuitInfo", args: [cfg.id] });
    if (info[0] !== POLICY_N_IN || info[1] !== POLICY_N_OUT) return { status: "mismatch", detail: `Circuit has ${info[0]} inputs and ${info[1]} outputs; expected ${POLICY_N_IN} and ${POLICY_N_OUT}.` };
    const inputs = toHex(encodePolicyInputs(input));
    const out = await c.readContract({ address: cfg.processor, abi: cpuAbi, functionName: "eval", args: [cfg.id, inputs] });
    return { status: "ok", outputs: decodePolicyOutputs(fromHex(out)), processor: cfg.processor, id: cfg.id.toString(), inputs };
  } catch (error) {
    return { status: "error", detail: error instanceof Error ? error.message.split("\n")[0] : "Could not reach X Layer." };
  }
}
