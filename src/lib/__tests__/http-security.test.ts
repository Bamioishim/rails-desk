import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeUpstash } from "./fake-upstash";
import { NextRequest } from "next/server";
import { proxy } from "../../proxy";
import { allowedOrigins, corsHeaders, limit, ok, options } from "../server/http";
import { hit, resetMemoryLimiter } from "../server/rate-limit";

const req = (headers: Record<string, string> = {}, method = "POST") => new Request("http://localhost/api/v1/proposals", { method, headers });

describe("CORS", () => {
  afterEach(() => { delete process.env.RAILS_DESK_ALLOWED_ORIGINS; });

  it("never sends a wildcard, and sends nothing for unknown or missing origins", () => {
    expect(ok({}).headers.get("access-control-allow-origin")).toBeNull();
    expect(ok({}, 200, req({ origin: "https://evil.example" })).headers.get("access-control-allow-origin")).toBeNull();
    const pre = options(req({ origin: "https://evil.example" }, "OPTIONS"));
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("echoes only origins listed in RAILS_DESK_ALLOWED_ORIGINS", () => {
    process.env.RAILS_DESK_ALLOWED_ORIGINS = "https://a.example, https://b.example/";
    expect(allowedOrigins()).toEqual(["https://a.example", "https://b.example"]);
    const h = corsHeaders(req({ origin: "https://b.example" }));
    expect(h["Access-Control-Allow-Origin"]).toBe("https://b.example");
    expect(h.Vary).toBe("Origin");
    expect(options(req({ origin: "https://a.example" }, "OPTIONS")).headers.get("access-control-allow-origin")).toBe("https://a.example");
    expect(corsHeaders(req({ origin: "https://c.example" }))).toEqual({});
  });

  it("rejects untrusted Origins on API writes while allowing same-origin and configured origins", async () => {
    await expect(limit(req({ origin: "https://attacker.example" }), "key")).rejects.toThrow(/Cross-origin write request blocked/);
    expect(await limit(req({ origin: "http://localhost" }), "key")).toBeNull();

    process.env.RAILS_DESK_ALLOWED_ORIGINS = "https://trusted.example";
    expect(await limit(req({ origin: "https://trusted.example" }), "key")).toBeNull();
  });

  it("server-to-server calls (no Origin header) still get a normal response", async () => {
    const res = ok({ hello: 1 }, 201, req({ authorization: "Bearer x" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ hello: 1 });
  });
});

describe("rate limiter (memory)", () => {
  beforeEach(() => { resetMemoryLimiter(); delete process.env.KV_REST_API_URL; delete process.env.UPSTASH_REDIS_REST_URL; });

  it("allows up to the limit in a window, then refuses until the next window", async () => {
    const l = { bucket: "t", limit: 3, windowMs: 60_000 };
    const t0 = 1_800_000_000_000; // start of a window
    for (let i = 0; i < 3; i++) expect((await hit(l, "k", t0 + i)).allowed).toBe(true);
    const over = await hit(l, "k", t0 + 10_000);
    expect(over.allowed).toBe(false);
    expect(over.retryAfterSec).toBe(50);
    expect((await hit(l, "other", t0 + 10_000)).allowed).toBe(true);
    expect((await hit(l, "k", t0 + 60_000)).allowed).toBe(true);
  });

  it("returns 429 JSON with Retry-After from a route guard", async () => {
    process.env.RAILS_DESK_RATE_DESKS_PER_IP_PER_HOUR = "2";
    try {
      const r = () => req({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
      expect(await limit(r(), "desk-create")).toBeNull();
      expect(await limit(r(), "desk-create")).toBeNull();
      const blocked = await limit(r(), "desk-create");
      expect(blocked?.status).toBe(429);
      expect(Number(blocked?.headers.get("retry-after"))).toBeGreaterThan(0);
      expect((await blocked!.json()).error).toMatch(/Too many requests/);
      expect(await limit(req({ "x-forwarded-for": "198.51.100.7" }), "desk-create")).toBeNull();
    } finally { delete process.env.RAILS_DESK_RATE_DESKS_PER_IP_PER_HOUR; }
  });

  it("limits per API key", async () => {
    process.env.RAILS_DESK_RATE_PER_KEY_PER_MIN = "2";
    try {
      const r = (k: string) => req({ authorization: `Bearer ${k}`, "x-forwarded-for": "203.0.113.10" });
      expect(await limit(r("key-a"), "key")).toBeNull();
      expect(await limit(r("key-a"), "key")).toBeNull();
      expect((await limit(r("key-a"), "key"))?.status).toBe(429);
      expect(await limit(r("key-b"), "key")).toBeNull();
    } finally { delete process.env.RAILS_DESK_RATE_PER_KEY_PER_MIN; }
  });

  it("can be switched off", async () => {
    process.env.RAILS_DESK_RATE_LIMIT = "off"; process.env.RAILS_DESK_RATE_DESKS_PER_IP_PER_HOUR = "1";
    try { for (let i = 0; i < 3; i++) expect(await limit(req({ "x-forwarded-for": "203.0.113.11" }), "desk-create")).toBeNull(); }
    finally { delete process.env.RAILS_DESK_RATE_LIMIT; delete process.env.RAILS_DESK_RATE_DESKS_PER_IP_PER_HOUR; }
  });
});

describe("rate limiter (Redis)", () => {
  let fake: ReturnType<typeof fakeUpstash>;
  beforeEach(() => { fake = fakeUpstash({ jitterMs: 0 }); vi.stubGlobal("fetch", fake.fetch); process.env.KV_REST_API_URL = "https://fake-upstash.test"; process.env.KV_REST_API_TOKEN = "t"; });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN; });

  it("counts in Redis with an expiring window key", async () => {
    const l = { bucket: "r", limit: 2, windowMs: 60_000 };
    const res = await Promise.all([hit(l, "k"), hit(l, "k"), hit(l, "k")]);
    expect(res.filter((r) => r.allowed)).toHaveLength(2);
    const [key, entry] = [...fake.data.entries()].find(([k]) => k.startsWith("rails-desk:rl:r:"))!;
    expect(key).toMatch(/^rails-desk:rl:r:\d+:[0-9a-f]{24}$/);
    expect(entry.exp).toBeGreaterThan(Date.now());
  });

  it("falls back to memory if Redis is down instead of failing requests", async () => {
    vi.stubGlobal("fetch", (async () => new Response("down", { status: 500 })) as unknown as typeof fetch);
    resetMemoryLimiter();
    expect((await hit({ bucket: "d", limit: 1, windowMs: 60_000 }, "k")).allowed).toBe(true);
  });
});

describe("security headers", () => {
  it("sends a nonce-based script CSP without unsafe-inline or unsafe-eval", () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const response = proxy(new NextRequest("https://rails-desk.test/"));
      const csp = response.headers.get("Content-Security-Policy") ?? "";
      const scriptSrc = csp.split(";").find((part) => part.trim().startsWith("script-src")) ?? "";
      expect(scriptSrc).toMatch(/'nonce-[^']+'/);
      expect(scriptSrc).toMatch(/'strict-dynamic'/);
      expect(scriptSrc).not.toMatch(/unsafe-inline|unsafe-eval/);
      expect(csp).toMatch(/frame-ancestors 'none'/);
      expect(csp).toMatch(/object-src 'none'/);
      expect(csp).toMatch(/connect-src 'self'/);
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
      expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    } finally { vi.unstubAllEnvs(); }
  });
});
