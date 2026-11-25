import { createHash } from "node:crypto";
import { redis, storageMode } from "./desk-store";

/**
 * Fixed-window rate limiter.
 * - With Redis (Upstash), counters are shared by every server instance: one atomic Lua call
 *   does INCR + PEXPIRE on a key named after the current window.
 * - Without Redis, counters live in this process's memory (enough for one server; on
 *   serverless each instance counts on its own).
 * Limits are generous on purpose: a person testing the demo should never see a 429.
 * If Redis is unreachable the limiter falls back to memory instead of failing the request.
 */
export type Limit = { bucket: string; limit: number; windowMs: number };
export type LimitResult = { allowed: boolean; limit: number; remaining: number; retryAfterSec: number };

const envNum = (name: string, fallback: number) => { const n = Number(process.env[name]); return Number.isFinite(n) && n > 0 ? n : fallback; };
export const LIMITS = {
  /** Per API key: proposals, decisions, rule changes, key rotation. */
  perKey: (): Limit => ({ bucket: "key", limit: envNum("RAILS_DESK_RATE_PER_KEY_PER_MIN", 60), windowMs: 60_000 }),
  /** Per client IP across all write routes (backstop for made-up keys). */
  perIp: (): Limit => ({ bucket: "ip", limit: envNum("RAILS_DESK_RATE_PER_IP_PER_MIN", 300), windowMs: 60_000 }),
  /** Per client IP: new desks. */
  desksPerIp: (): Limit => ({ bucket: "desks", limit: envNum("RAILS_DESK_RATE_DESKS_PER_IP_PER_HOUR", 20), windowMs: 3_600_000 }),
  /** Per client IP: browser session exchange and logout. */
  sessionPerIp: (): Limit => ({ bucket: "session", limit: envNum("RAILS_DESK_RATE_SESSIONS_PER_IP_PER_MIN", 10), windowMs: 60_000 }),
};

export const rateLimitEnabled = () => process.env.RAILS_DESK_RATE_LIMIT !== "off";

export const RATE_LUA = `local n = redis.call("INCR", KEYS[1])
if n == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[1]) end
return n`;

const memory = new Map<string, { count: number; resetAt: number }>();
let lastSweep = 0;
function memoryHit(key: string, resetAt: number, now: number) {
  if (now - lastSweep > 60_000 || memory.size > 10_000) {
    lastSweep = now;
    for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
  }
  const cur = memory.get(key);
  if (!cur || cur.resetAt <= now) { memory.set(key, { count: 1, resetAt }); return 1; }
  cur.count += 1;
  return cur.count;
}

const digest = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);

export async function hit(l: Limit, identity: string, now = Date.now()): Promise<LimitResult> {
  const window = Math.floor(now / l.windowMs);
  const resetAt = (window + 1) * l.windowMs;
  const key = `rails-desk:rl:${l.bucket}:${window}:${digest(identity)}`;
  let count: number;
  if (storageMode() === "redis") {
    try { count = Number(await redis(["EVAL", RATE_LUA, 1, key, l.windowMs * 2])); }
    catch { count = memoryHit(key, resetAt, now); }
  } else {
    count = memoryHit(key, resetAt, now);
  }
  return { allowed: count <= l.limit, limit: l.limit, remaining: Math.max(0, l.limit - count), retryAfterSec: Math.max(1, Math.ceil((resetAt - now) / 1000)) };
}

/** Best-effort client IP (Vercel sets x-forwarded-for; the first entry is the client). */
export function clientIp(request: Request) {
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** For tests. */
export function resetMemoryLimiter() { memory.clear(); lastSweep = 0; }
