import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeUpstash } from "./fake-upstash";

type DeskMod = typeof import("../server/desk");
type StoreMod = typeof import("../server/desk-store");

let fake: ReturnType<typeof fakeUpstash>;
beforeEach(() => {
  fake = fakeUpstash({ jitterMs: 4 });
  vi.stubGlobal("fetch", fake.fetch);
  process.env.KV_REST_API_URL = "https://fake-upstash.test";
  process.env.KV_REST_API_TOKEN = "test-token";
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN; });

/** Load a fresh copy of the modules: a separate "server instance" with its own in-process lock map. */
async function instance() {
  vi.resetModules();
  const desk = (await import("../server/desk")) as DeskMod;
  const store = (await import("../server/desk-store")) as StoreMod;
  return { desk, store };
}

describe("Redis lock", () => {
  it("is exclusive, and only the owner can release it", async () => {
    const { store } = await instance();
    const release = await store.acquireRedisLock("abcdef12", 5_000, 1_000);
    await expect(store.acquireRedisLock("abcdef12", 5_000, 80)).rejects.toBeInstanceOf(store.StoreBusyError);
    // A stranger's token cannot delete the lock.
    expect(fake.exec(["EVAL", store.RELEASE_LOCK_LUA, 1, "rails-desk:lock:abcdef12", "not-the-owner"])).toBe(0);
    await release();
    const again = await store.acquireRedisLock("abcdef12", 5_000, 200);
    await again();
  });

  it("waits for the holder and then gets the lock", async () => {
    const { store } = await instance();
    const release = await store.acquireRedisLock("abcdef12", 5_000, 1_000);
    const waiting = store.acquireRedisLock("abcdef12", 5_000, 2_000);
    setTimeout(() => void release(), 60);
    await (await waiting)();
  });

  it("expires on its own if a holder dies", async () => {
    const { store } = await instance();
    await store.acquireRedisLock("abcdef12", 40, 100); // never released
    await (await store.acquireRedisLock("abcdef12", 5_000, 1_000))();
  });
});

describe("compare-and-set save", () => {
  it("rejects a stale write, so state from an older read can't overwrite newer state", async () => {
    const { desk, store } = await instance();
    const { desk: d } = await desk.createDesk("cas");
    const a = await store.loadVersioned(d.id);
    const b = await store.loadVersioned(d.id);
    await store.saveRaw(d.id, a.raw!, a.rev);
    await expect(store.saveRaw(d.id, b.raw!, b.rev)).rejects.toBeInstanceOf(store.StoreBusyError);
  });
});

describe("concurrent proposals across instances", () => {
  it("keep one unbroken receipt chain with no fork and no lost writes", async () => {
    const one = await instance();
    const two = await instance();
    const three = await instance();
    const { ownerKey, agentKey } = await one.desk.createDesk("race");
    const mods = [one.desk, two.desk, three.desk];
    const N = 24;
    const results = await Promise.all(Array.from({ length: N }, (_, i) =>
      mods[i % 3].propose(agentKey, { amount: (i % 15) + 1, recipient: i % 4 === 0 ? "Mallory" : "Alex", reason: `r${i}` })));
    expect(new Set(results.map((r) => r.receipt_id)).size).toBe(N);

    const state = await two.desk.getDesk(ownerKey);
    // A fresh module instance reads the same Redis-backed state, simulating another server instance.
    const restarted = await instance();
    const afterRestart = await restarted.desk.getDesk(ownerKey);
    expect(afterRestart.receipts).toHaveLength(N);
    expect(afterRestart.receipts.every((receipt) => receipt.policySnapshot?.rules.maxPerAction === 20)).toBe(true);
    expect(state.proposals).toHaveLength(N);
    expect(state.receipts).toHaveLength(N);
    expect(state.receipts.map((r) => r.index)).toEqual(Array.from({ length: N }, (_, i) => i + 1));
    const prevs = state.receipts.map((r) => r.previousHash);
    expect(new Set(prevs).size).toBe(N); // no two receipts extend the same parent
    expect(one.desk.verifyDeskChain(state.receipts).valid).toBe(true);
  });

  it("enforces the daily budget under concurrent submissions across server instances", async () => {
    const one = await instance();
    const two = await instance();
    const three = await instance();
    const { ownerKey, agentKey } = await one.desk.createDesk("concurrent-budget");
    await one.desk.updateRules(ownerKey, { allowedRecipients: ["Alex"], maxPerAction: 100, reviewLimit: 100, dailySpendCap: 25 });
    const mods = [one.desk, two.desk, three.desk];
    const N = 18;
    const results = await Promise.all(Array.from({ length: N }, (_, i) =>
      mods[i % mods.length].propose(agentKey, { amount: 10, recipient: "Alex", reason: `budget-race-${i}` })));
    expect(results.filter((proposal) => proposal.status === "approved")).toHaveLength(2);
    expect(results.filter((proposal) => proposal.status === "blocked")).toHaveLength(N - 2);
    const state = await two.desk.getDesk(ownerKey);
    const committed = state.proposals.filter((proposal) => proposal.status === "approved")
      .reduce((sum, proposal) => sum + proposal.amount, 0);
    expect(committed).toBeLessThanOrEqual(25);
    expect(state.proposals).toHaveLength(N);
    expect(state.receipts).toHaveLength(N);
    expect(one.desk.verifyDeskChain(state.receipts).valid).toBe(true);
  });

  it("lets only one of two racing owner decisions win", async () => {
    const one = await instance();
    const two = await instance();
    const { ownerKey, agentKey } = await one.desk.createDesk("decide");
    const p = await one.desk.propose(agentKey, { amount: 15, recipient: "Jordan" });
    const out = await Promise.allSettled([one.desk.decide(ownerKey, p.id, "approve"), two.desk.decide(ownerKey, p.id, "refuse")]);
    expect(out.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(out.filter((o) => o.status === "rejected").map((o) => String((o as PromiseRejectedResult).reason))[0]).toMatch(/Already/);
    const state = await one.desk.getDesk(ownerKey);
    expect(state.receipts).toHaveLength(2);
    expect(state.receipts[0].policySnapshot?.rules.reviewLimit).toBe(10);
    expect(state.receipts[1].policySnapshot?.rules.reviewLimit).toBe(10);
    expect(one.desk.verifyDeskChain(state.receipts).valid).toBe(true);
  });
});
