import { describe, expect, it } from "vitest";
import { POLICY_GATE_COUNT, POLICY_N_IN, POLICY_NETLIST, evaluatePolicyCircuit, encodePolicyInputs, packBits, unpackBits, evalNandNetlist } from "../policy-circuit";

function expected(amount: number, cap: number, review: number, allow: boolean) {
  const a = Math.round(amount * 100), c = Math.round(cap * 100), r = Math.round(review * 100);
  const ok = allow && a > 0 && a <= c;
  return { approved: ok && a <= r, needsReview: ok && a > r, blocked: !ok };
}

describe("policy circuit (TAP-02 netlist)", () => {
  it("is a well-formed NAND-only netlist", () => {
    expect(POLICY_NETLIST.length % 7).toBe(0);
    expect(POLICY_GATE_COUNT).toBeGreaterThan(100);
    for (let o = 0; o < POLICY_NETLIST.length; o += 7) {
      const idx = 2 + POLICY_N_IN + o / 7;
      const a = (POLICY_NETLIST[o + 1] << 16) | (POLICY_NETLIST[o + 2] << 8) | POLICY_NETLIST[o + 3];
      const b = (POLICY_NETLIST[o + 4] << 16) | (POLICY_NETLIST[o + 5] << 8) | POLICY_NETLIST[o + 6];
      expect(POLICY_NETLIST[o]).toBe(0);
      expect(a).toBeLessThan(idx);
      expect(b).toBeLessThan(idx);
    }
  });

  it("matches the landing-page defaults", () => {
    expect(evaluatePolicyCircuit({ amount: 8, maxPerAction: 20, reviewLimit: 10, allowlisted: true })).toEqual({ approved: true, needsReview: false, blocked: false });
    expect(evaluatePolicyCircuit({ amount: 12, maxPerAction: 20, reviewLimit: 10, allowlisted: true })).toEqual({ approved: false, needsReview: true, blocked: false });
    expect(evaluatePolicyCircuit({ amount: 25, maxPerAction: 20, reviewLimit: 10, allowlisted: true })).toEqual({ approved: false, needsReview: false, blocked: true });
    expect(evaluatePolicyCircuit({ amount: 5, maxPerAction: 20, reviewLimit: 10, allowlisted: false }).blocked).toBe(true);
    expect(evaluatePolicyCircuit({ amount: 0, maxPerAction: 20, reviewLimit: 10, allowlisted: true }).blocked).toBe(true);
    expect(evaluatePolicyCircuit({ amount: 20, maxPerAction: 20, reviewLimit: 10, allowlisted: true }).needsReview).toBe(true);
    expect(evaluatePolicyCircuit({ amount: 10, maxPerAction: 20, reviewLimit: 10, allowlisted: true }).approved).toBe(true);
  });

  it("agrees with the reference rules on random inputs", () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let i = 0; i < 400; i++) {
      const amount = Math.round(rand() * 50000) / 100, cap = Math.round(rand() * 50000) / 100, review = Math.round(rand() * 50000) / 100;
      const allow = rand() > 0.3;
      expect(evaluatePolicyCircuit({ amount, maxPerAction: cap, reviewLimit: review, allowlisted: allow })).toEqual(expected(amount, cap, review, allow));
    }
  });

  it("packs bits least-significant first", () => {
    expect(Array.from(packBits([1, 0, 0, 0, 0, 0, 0, 0, 1]))).toEqual([1, 1]);
    expect(unpackBits(new Uint8Array([0b101]), 3)).toEqual([1, 0, 1]);
    expect(encodePolicyInputs({ amount: 0.01, maxPerAction: 0, reviewLimit: 0, allowlisted: true }).length).toBe(Math.ceil(POLICY_N_IN / 8));
  });

  it("evaluates a hand-written NOT netlist", () => {
    expect(evalNandNetlist(new Uint8Array([0, 0, 0, 2, 0, 0, 2]), 1, 1, [1])).toEqual([0]);
  });
});
