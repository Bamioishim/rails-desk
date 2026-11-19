#!/usr/bin/env node
// Rails Desk policy circuit tool (Node 22.18+/24: imports the TypeScript source directly).
//
//   node scripts/policy-circuit.mjs export [--out file.json]   netlist + metadata (TAP-02 format)
//   node scripts/policy-circuit.mjs calldata                   calldata for tapeout(bytes,uint32,uint32)
//   node scripts/policy-circuit.mjs check --processor 0x.. --id N [--rpc URL]
//        read-only: compares the taped-out circuit on X Layer with this netlist and runs `eval` on sample cases
//
// Nothing here signs or sends a transaction. Taping out is done by the circuit owner in their own wallet.
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createPublicClient, encodeFunctionData, http, parseAbi } from "viem";
import {
  POLICY_GATE_COUNT, POLICY_N_IN, POLICY_N_OUT, POLICY_NETLIST, decodePolicyOutputs, encodePolicyInputs,
  evaluatePolicyCircuit, fromHex, toHex,
} from "../src/lib/policy-circuit.ts";

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const meta = () => ({
  format: "TAP-02", nIn: POLICY_N_IN, nOut: POLICY_N_OUT, gates: POLICY_GATE_COUNT,
  sha256: "0x" + createHash("sha256").update(POLICY_NETLIST).digest("hex"), netlist: toHex(POLICY_NETLIST),
});
const abi = parseAbi([
  "function tapeout(bytes netlist, uint32 nIn, uint32 nOut) payable returns (uint256)",
  "function circuitInfo(uint256 id) view returns (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount)",
  "function netlist(uint256 id) view returns (bytes)",
  "function eval(uint256 id, bytes inputs) view returns (bytes)",
]);
const CASES = [
  { amount: 8, maxPerAction: 20, reviewLimit: 10, allowlisted: true },
  { amount: 12, maxPerAction: 20, reviewLimit: 10, allowlisted: true },
  { amount: 25, maxPerAction: 20, reviewLimit: 10, allowlisted: true },
  { amount: 5, maxPerAction: 20, reviewLimit: 10, allowlisted: false },
  { amount: 0, maxPerAction: 20, reviewLimit: 10, allowlisted: true },
];

if (cmd === "export") {
  const json = JSON.stringify(meta(), null, 2);
  const out = opt("out");
  if (out) { writeFileSync(out, json + "\n"); console.log(`Wrote ${out} (${POLICY_GATE_COUNT} gates)`); } else console.log(json);
} else if (cmd === "calldata") {
  console.log(encodeFunctionData({ abi, functionName: "tapeout", args: [toHex(POLICY_NETLIST), POLICY_N_IN, POLICY_N_OUT] }));
} else if (cmd === "check") {
  const processor = opt("processor"), id = opt("id");
  if (!processor || !id) { console.error("Usage: check --processor 0x... --id N"); process.exit(2); }
  const client = createPublicClient({ transport: http(opt("rpc") ?? "https://rpc.xlayer.tech") });
  const info = await client.readContract({ address: processor, abi, functionName: "circuitInfo", args: [BigInt(id)] });
  const onchain = await client.readContract({ address: processor, abi, functionName: "netlist", args: [BigInt(id)] });
  const same = onchain.toLowerCase() === toHex(POLICY_NETLIST).toLowerCase();
  console.log(`circuitInfo: nIn=${info[0]} nOut=${info[1]} nState=${info[2]} gates=${info[3]}`);
  console.log(`netlist matches this build: ${same ? "yes" : "NO"}`);
  let ok = same;
  for (const c of CASES) {
    const out = decodePolicyOutputs(fromHex(await client.readContract({ address: processor, abi, functionName: "eval", args: [BigInt(id), toHex(encodePolicyInputs(c))] })));
    const local = evaluatePolicyCircuit(c);
    const match = JSON.stringify(out) === JSON.stringify(local);
    ok &&= match;
    console.log(`${JSON.stringify(c)} -> ${JSON.stringify(out)} ${match ? "OK" : "MISMATCH"}`);
  }
  process.exit(ok ? 0 : 1);
} else {
  console.log("Commands: export [--out file] | calldata | check --processor 0x.. --id N [--rpc URL]");
  console.log(JSON.stringify({ ...meta(), netlist: `${toHex(POLICY_NETLIST).slice(0, 34)}… (${POLICY_NETLIST.length} bytes)` }, null, 2));
}
