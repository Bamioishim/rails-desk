import { DeskError } from "./desk";
import { StoreBusyError } from "./desk-store";
import { clientIp, hit, LIMITS, rateLimitEnabled, type Limit, type LimitResult } from "./rate-limit";

/**
 * CORS: there is no wildcard. Agents call the API server to server (curl, SDKs, the MCP
 * server), where CORS does not apply, and the Rails Desk app calls it from the same origin,
 * which needs no CORS headers. Extra browser origins can be allowed with
 * RAILS_DESK_ALLOWED_ORIGINS="https://a.example,https://b.example".
 */
export function allowedOrigins(): string[] {
  return (process.env.RAILS_DESK_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
}
export function corsHeaders(request?: Request): Record<string, string> {
  const origin = request?.headers.get("origin");
  if (!origin || !allowedOrigins().includes(origin)) return {};
  return { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS", "Access-Control-Max-Age": "600", Vary: "Origin" };
}

export const noStore = { "Cache-Control": "no-store" };
const headers = (request?: Request, extra?: Record<string, string>) => ({ ...noStore, ...corsHeaders(request), ...(extra ?? {}) });

export const ok = (data: unknown, status = 200, request?: Request) => Response.json(data, { status, headers: headers(request) });
export function fail(error: unknown, request?: Request) {
  if (error instanceof DeskError) return Response.json({ error: error.message }, { status: error.status, headers: headers(request) });
  if (error instanceof StoreBusyError) return Response.json({ error: error.message }, { status: 503, headers: headers(request, { "Retry-After": "1" }) });
  if (error instanceof SyntaxError) return Response.json({ error: "Body must be JSON." }, { status: 400, headers: headers(request) });
  return Response.json({ error: error instanceof Error ? error.message : "Unexpected error." }, { status: 500, headers: headers(request) });
}
/** Preflight: 204 with CORS headers only for allowed origins; otherwise no CORS headers, so browsers block it. */
export const options = (request: Request) => new Response(null, { status: 204, headers: headers(request) });
export async function json(request: Request) { const t = await request.text(); return t ? JSON.parse(t) : {}; }

export function tooMany(r: LimitResult, request?: Request) {
  return Response.json(
    { error: `Too many requests. Limit is ${r.limit} per window; retry in ${r.retryAfterSec}s.`, retry_after: r.retryAfterSec },
    { status: 429, headers: headers(request, { "Retry-After": String(r.retryAfterSec), "X-RateLimit-Limit": String(r.limit), "X-RateLimit-Remaining": "0" }) },
  );
}

type Scope = "key" | "desk-create" | "session";
/**
 * Rate-limit a write route. "key": per API key (60/min) plus a per-IP backstop (300/min).
 * "desk-create": per IP (20/hour); "session": per IP (10/minute). Returns a 429 Response when over, otherwise null.
 */
export async function limit(request: Request, scope: Scope): Promise<Response | null> {
  if (!rateLimitEnabled()) return null;
  const ip = clientIp(request);
  const checks: [Limit, string][] = scope === "desk-create"
    ? [[LIMITS.desksPerIp(), ip]]
    : scope === "session"
      ? [[LIMITS.sessionPerIp(), ip]]
      : [[LIMITS.perIp(), ip], [LIMITS.perKey(), request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || `anon:${ip}`]];
  for (const [l, id] of checks) {
    const r = await hit(l, id);
    if (!r.allowed) return tooMany(r, request);
  }
  return null;
}

/** Browser session mutations require an explicit same-origin Origin header. */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}
