import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";

/**
 * Where desks are stored.
 * - "redis": Upstash Redis over REST (free tier, add it from the Vercel Marketplace). Durable.
 *   Uses KV_REST_API_URL + KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
 * - "file": JSON files in data/desks (local dev) or RAILS_DESK_DATA_DIR. Durable on a normal server.
 * - "ephemeral": JSON files in /tmp on Vercel when no Redis is configured. Works for a demo,
 *   but data can vanish when the function instance is recycled.
 */
const redisUrl = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const redisToken = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

export type StorageMode = "redis" | "file" | "ephemeral";
export function storageMode(): StorageMode {
  if (redisUrl() && redisToken()) return "redis";
  return process.env.VERCEL && !process.env.RAILS_DESK_DATA_DIR ? "ephemeral" : "file";
}

const dataDir = () => process.env.RAILS_DESK_DATA_DIR || (process.env.VERCEL ? "/tmp/rails-desk" : path.join(process.cwd(), "data", "desks"));
const safeId = (id: string) => { if (!/^[a-z0-9]{8,40}$/.test(id)) throw new Error("Invalid desk id."); return id; };

async function redis(command: (string | number)[]) {
  const res = await fetch(redisUrl(), { method: "POST", headers: { Authorization: `Bearer ${redisToken()}`, "Content-Type": "application/json" }, body: JSON.stringify(command), cache: "no-store" });
  if (!res.ok) throw new Error(`Storage error (${res.status}).`);
  return (await res.json()).result as string | null;
}

export async function loadRaw(id: string): Promise<string | null> {
  safeId(id);
  if (storageMode() === "redis") return redis(["GET", `rails-desk:desk:${id}`]);
  try { return await readFile(path.join(dataDir(), `${id}.json`), "utf8"); } catch { return null; }
}

export async function saveRaw(id: string, value: string) {
  safeId(id);
  if (storageMode() === "redis") { await redis(["SET", `rails-desk:desk:${id}`, value]); return; }
  await mkdir(dataDir(), { recursive: true });
  const file = path.join(dataDir(), `${id}.json`);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, value, "utf8");
  await rename(tmp, file);
}

// Serialize read-modify-write per desk inside one server process.
const locks = new Map<string, Promise<unknown>>();
export async function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(id, next.catch(() => undefined));
  return next;
}
