/**
 * Rails Desk policy circuit.
 *
 * The spending rails are compiled into a pure-NAND TapeOut netlist (TAP-02 format:
 * https://github.com/TapeOutProtocol/TAPs/blob/main/TAPs/TAP-02.md). The same bytes can be
 * taped out on an X Layer TapeOut processor and evaluated on chain with `eval(id, inputs)`.
 * The app always evaluates the netlist locally with the TAP-02 rules, and cross-checks the
 * on-chain result when a taped-out circuit is configured (see src/lib/tapeout.ts).
 *
 * Inputs (LSB first, TAP-02 §5 packing):
 *   0..31   amount in cents (uint32)
 *   32..63  max per action in cents (uint32)
 *   64..95  review limit in cents (uint32)
 *   96      recipient is on the allowlist (1 bit, decided off-circuit)
 * Outputs: [approved, needsReview, blocked]
 */

export const POLICY_WIDTH = 32;
export const POLICY_N_IN = POLICY_WIDTH * 3 + 1;
export const POLICY_N_OUT = 3;
export const MAX_CENTS = 2 ** POLICY_WIDTH - 1;

export type PolicyInputs = { amount: number; maxPerAction: number; reviewLimit: number; allowlisted: boolean };
export type PolicyOutputs = { approved: boolean; needsReview: boolean; blocked: boolean };

type Gate = [number, number];

/** Builds a NAND-only netlist. Signal 0 = constant 0, 1 = constant 1, 2.. = inputs. */
class NetlistBuilder {
  readonly gates: Gate[] = [];
  readonly nIn: number;
  constructor(nIn: number) { this.nIn = nIn; }
  private next() { return 2 + this.nIn + this.gates.length; }
  input(i: number) { return 2 + i; }
  nand(a: number, b: number) { const id = this.next(); this.gates.push([a, b]); return id; }
  not(a: number) { return this.nand(a, a); }
  and(a: number, b: number) { return this.not(this.nand(a, b)); }
  or(a: number, b: number) { return this.nand(this.not(a), this.not(b)); }
  /** XNOR from 5 NANDs: NOT(XOR). */
  xnor(a: number, b: number) {
    const n = this.nand(a, b);
    const xor = this.nand(this.nand(a, n), this.nand(b, n));
    return this.not(xor);
  }
  /** a > b for unsigned little-endian bit vectors. */
  greaterThan(a: number[], b: number[]) {
    let gt = 0; // constant 0
    for (let i = 0; i < a.length; i++) {
      const aAndNotB = this.and(a[i], this.not(b[i]));
      const keep = this.and(this.xnor(a[i], b[i]), gt);
      gt = this.or(aAndNotB, keep);
    }
    return gt;
  }
  isZero(bits: number[]) {
    let any = 0;
    for (const bit of bits) any = any === 0 ? bit : this.or(any, bit);
    return this.not(any);
  }
  bytes() {
    const out = new Uint8Array(this.gates.length * 7);
    this.gates.forEach(([a, b], i) => {
      const o = i * 7;
      out[o] = 0x00;
      out[o + 1] = (a >> 16) & 0xff; out[o + 2] = (a >> 8) & 0xff; out[o + 3] = a & 0xff;
      out[o + 4] = (b >> 16) & 0xff; out[o + 5] = (b >> 8) & 0xff; out[o + 6] = b & 0xff;
    });
    return out;
  }
}

function buildPolicyNetlist() {
  const nb = new NetlistBuilder(POLICY_N_IN);
  const range = (start: number) => Array.from({ length: POLICY_WIDTH }, (_, i) => nb.input(start + i));
  const amount = range(0), cap = range(POLICY_WIDTH), review = range(POLICY_WIDTH * 2);
  const allow = nb.input(POLICY_WIDTH * 3);
  const overCap = nb.greaterThan(amount, cap);
  const overReview = nb.greaterThan(amount, review);
  const zero = nb.isZero(amount);
  // ok = allowlisted AND NOT zero AND NOT overCap
  const ok = nb.and(nb.and(allow, nb.not(zero)), nb.not(overCap));
  const q = nb.nand(ok, nb.not(overReview)); // NOT approved
  const p = nb.nand(ok, overReview);         // NOT needsReview
  // The last three signals are the outputs, in order (TAP-02 §4).
  nb.nand(q, q); // approved
  nb.nand(p, p); // needsReview
  nb.nand(ok, ok); // blocked
  return nb.bytes();
}

export const POLICY_NETLIST: Uint8Array = buildPolicyNetlist();
export const POLICY_GATE_COUNT = POLICY_NETLIST.length / 7;

export function toHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** TAP-02 §5: bit i is bit (i mod 8) of byte floor(i / 8). */
export function packBits(bits: number[]): Uint8Array {
  const out = new Uint8Array(Math.ceil(bits.length / 8));
  bits.forEach((v, i) => { if (v) out[i >> 3] |= 1 << (i & 7); });
  return out;
}
export function unpackBits(bytes: Uint8Array, n: number): number[] {
  return Array.from({ length: n }, (_, i) => ((bytes[i >> 3] ?? 0) >> (i & 7)) & 1);
}

/** One beat of a combinational TAP-02 netlist (NAND records only). */
export function evalNandNetlist(netlist: Uint8Array, nIn: number, nOut: number, inputs: number[]): number[] {
  if (netlist.length % 7 !== 0) throw new Error("Only NAND-only netlists are supported here.");
  const s: number[] = [0, 1, ...Array.from({ length: nIn }, (_, i) => inputs[i] ? 1 : 0)];
  for (let o = 0; o < netlist.length; o += 7) {
    if (netlist[o] !== 0x00) throw new Error(`Unsupported opcode 0x${netlist[o].toString(16)}`);
    const a = (netlist[o + 1] << 16) | (netlist[o + 2] << 8) | netlist[o + 3];
    const b = (netlist[o + 4] << 16) | (netlist[o + 5] << 8) | netlist[o + 6];
    if (a >= s.length || b >= s.length) throw new Error("NAND: future signal");
    s.push(1 - (s[a] & s[b]));
  }
  if (s.length - 2 - nIn < nOut) throw new Error("too few signals for outputs");
  return s.slice(s.length - nOut);
}

export function toCents(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(MAX_CENTS, Math.round(value * 100));
}

export function encodePolicyInputs(input: PolicyInputs): Uint8Array {
  const bits: number[] = [];
  for (const v of [toCents(input.amount), toCents(input.maxPerAction), toCents(input.reviewLimit)]) {
    for (let i = 0; i < POLICY_WIDTH; i++) bits.push(Math.floor(v / 2 ** i) % 2);
  }
  bits.push(input.allowlisted ? 1 : 0);
  return packBits(bits);
}

export function decodePolicyOutputs(bytes: Uint8Array): PolicyOutputs {
  const [approved, needsReview, blocked] = unpackBits(bytes, POLICY_N_OUT);
  return { approved: approved === 1, needsReview: needsReview === 1, blocked: blocked === 1 };
}

/** Local TAP-02 evaluation of the policy circuit. */
export function evaluatePolicyCircuit(input: PolicyInputs): PolicyOutputs {
  const bits = unpackBits(encodePolicyInputs(input), POLICY_N_IN);
  const out = evalNandNetlist(POLICY_NETLIST, POLICY_N_IN, POLICY_N_OUT, bits);
  return { approved: out[0] === 1, needsReview: out[1] === 1, blocked: out[2] === 1 };
}

/** SHA-256 of the netlist bytes, shown in the UI so anyone can match it to the taped-out circuit. */
export async function policyNetlistDigest() {
  const digest = await crypto.subtle.digest("SHA-256", POLICY_NETLIST as unknown as ArrayBuffer);
  return toHex(new Uint8Array(digest));
}
