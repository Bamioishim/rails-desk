import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";

/**
 * Where desks are stored.
 * - "redis": Upstash Redis over REST (free tier, add it from the Vercel Marketplace). Durable.
 *   Uses KV_REST_API_URL + KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
 * - "file": JSON files in data/desks (local dev) or RAILS_DESK_DATA_DIR. Durable on a normal server.
 * - "ephemeral": JSON files in /tmp on Vercel when no Redis is configured. Works for a demo,
 *   but data can vanish when the function instance is recycled.
 *
 * Concurrency
 * - Every read-modify-write of a desk (rules, agent key, proposals, decisions, receipt chain)
 *   runs inside withLock(deskId).
 * - In one process, calls for the same desk are queued (local promise chain).
 * - With Redis, a cross-instance lock is also taken: SET lock <token> NX PX <ttl>, released
 *   only by its owner through an atomic Lua compare-and-delete.
 * - On top of the lock, each Redis write is a compare-and-set on a per-desk revision counter
 *   (one Lua script: write only if the revision is still the one we read, then bump it).
 *   Even if a lock expired mid-write, a stale writer cannot overwrite newer state, so the
 *   receipt chain cannot fork.
 */
const redisUrl = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const redisToken = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

export type StorageMode = "redis" | "file" | "ephemeral";
export function storageMode(): StorageMode {
  if (redisUrl() && redisToken()) return "redis";
  return process.env.VERCEL && !process.env.RAILS_DESK_DATA_DIR ? "ephemeral" : "file";
}

/** Thrown when the desk is held by another writer for too long, or the revision moved under us. */
export class StoreBusyError extends Error {
  readonly status = 503;
  constructor(message = "The desk is busy with another request. Retry in a moment.") { super(message); }
}

const dataDir = () => process.env.RAILS_DESK_DATA_DIR || (process.env.VERCEL ? "/tmp/rails-desk" : path.join(process.cwd(), "data", "desks"));
const safeId = (id: string) => { if (!/^[a-z0-9]{8,40}$/.test(id)) throw new Error("Invalid desk id."); return id; };
const deskKey = (id: string) => `rails-desk:desk:${id}`;
const revKey = (id: string) => `rails-desk:rev:${id}`;
const lockKey = (id: string) => `rails-desk:lock:${id}`;

type RedisValue = string | number | null | RedisValue[];
export async function redis(command: (string | number)[]): Promise<RedisValue> {
  const res = await fetch(redisUrl(), { method: "POST", headers: { Authorization: `Bearer ${redisToken()}`, "Content-Type": "application/json" }, body: JSON.stringify(command), cache: "no-store" });
  if (!res.ok) throw new Error(`Storage error (${res.status}).`);
  const body = (await res.json()) as { result?: RedisValue; error?: string };
  if (body.error) throw new Error(`Storage error (${body.error}).`);
  return body.result ?? null;
}

/** Lua: delete the lock only if we still own it. */
export const RELEASE_LOCK_LUA = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`;
/** Lua: write the desk only if its revision is unchanged since we read it, then bump the revision. */
export const CAS_SAVE_LUA = `local cur = redis.call("GET", KEYS[2]) or "0"
if cur ~= ARGV[2] then return 0 end
redis.call("SET", KEYS[1], ARGV[1])
redis.call("INCR", KEYS[2])
return 1`;

export async function loadRaw(id: string): Promise<string | null> {
  return (await loadVersioned(id)).raw;
}

/** Read a desk together with the revision a later saveRaw(id, value, rev) must match (Redis only). */
export async function loadVersioned(id: string): Promise<{ raw: string | null; rev: string }> {
  safeId(id);
  if (storageMode() === "redis") {
    const r = (await redis(["MGET", deskKey(id), revKey(id)])) as (string | null)[] | null;
    return { raw: r?.[0] ?? null, rev: String(r?.[1] ?? "0") };
  }
  try { return { raw: await readFile(path.join(dataDir(), `${id}.json`), "utf8"), rev: "file" }; } catch { return { raw: null, rev: "file" }; }
}

/**
 * Save a desk. With Redis and an expected revision, the write is an atomic compare-and-set
 * and throws StoreBusyError if someone else wrote first. Without a revision (new desk), it
 * only creates the key if it does not exist yet.
 */
export async function saveRaw(id: string, value: string, expectedRev?: string) {
  safeId(id);
  if (storageMode() === "redis") {
    if (expectedRev === undefined) {
      const created = await redis(["SET", deskKey(id), value, "NX"]);
      if (created !== "OK") throw new StoreBusyError("A desk with this id already exists.");
      return;
    }
    const okWrite = await redis(["EVAL", CAS_SAVE_LUA, 2, deskKey(id), revKey(id), value, expectedRev]);
    if (Number(okWrite) !== 1) throw new StoreBusyError("The desk changed while this request was running. Retry it.");
    return;
  }
  await mkdir(dataDir(), { recursive: true });
  const file = path.join(dataDir(), `${id}.json`);
  const tmp = `${file}.${process.pid}.${Date.now()}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, value, "utf8");
  await rename(tmp, file);
}

const LOCK_TTL_MS = Number(process.env.RAILS_DESK_LOCK_TTL_MS) || 10_000;
const LOCK_WAIT_MS = Number(process.env.RAILS_DESK_LOCK_WAIT_MS) || 8_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Cross-instance lock in Redis. Returns a release function. */
export async function acquireRedisLock(id: string, ttlMs = LOCK_TTL_MS, waitMs = LOCK_WAIT_MS): Promise<() => Promise<void>> {
  const key = lockKey(safeId(id));
  const owner = randomBytes(16).toString("hex");
  const deadline = Date.now() + waitMs;
  let delay = 15;
  for (;;) {
    if ((await redis(["SET", key, owner, "NX", "PX", ttlMs])) === "OK") {
      return async () => { try { await redis(["EVAL", RELEASE_LOCK_LUA, 1, key, owner]); } catch { /* the lock expires on its own */ } };
    }
    if (Date.now() >= deadline) throw new StoreBusyError();
    await sleep(delay + Math.floor(Math.random() * delay));
    delay = Math.min(delay * 2, 200);
  }
}

// Serialize read-modify-write per desk inside one server process (all modes),
// plus a Redis lock across instances when Redis is configured.
const locks = new Map<string, Promise<unknown>>();
export async function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const run = async () => {
    if (storageMode() !== "redis") return fn();
    const release = await acquireRedisLock(id);
    try { return await fn(); } finally { await release(); }
  };
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.then(run, run);
  const tail = next.catch(() => undefined);
  locks.set(id, tail);
  void tail.then(() => { if (locks.get(id) === tail) locks.delete(id); });
  return next;
}
