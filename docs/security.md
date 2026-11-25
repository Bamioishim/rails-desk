# Security model

## Owner authentication

The browser-facing owner credential is an opaque random session token in the `rails_desk_owner` cookie with HttpOnly, SameSite=Strict, Path=/, a 30-day expiry, and Secure in production. The token is generated independently of the owner API key. Only its SHA-256 hash, creation time, and expiry are stored in the desk record; the raw session token is never persisted. Client-side JavaScript cannot read it. Up to ten active browser sessions are retained per desk, with expired sessions pruned when a new one is issued.

Existing browsers with the former `rails-desk-keys-v1` localStorage record are migrated once: the client exchanges the legacy owner key with `POST /api/v1/session`, then rewrites localStorage with only the desk ID and agent key. The server validates the owner key, creates a revocable session, and sets the HttpOnly cookie. Existing raw owner-key cookies from the previous release are also upgraded to revocable sessions on app startup through `GET /api/v1/session`. Once the new cookie has been established, the client removes the legacy localStorage record even if rewriting the reduced record fails. Logging out calls `DELETE /api/v1/session`, revokes that exact session hash server-side, and clears the cookie. A copied session cookie stops authenticating after logout.

Session exchange, logout, and owner-session rotation require an explicit `Origin` header matching the request URL's origin. Missing, malformed, and cross-origin values are rejected. These mutations also use a dedicated per-IP rate limit of 10 requests per minute by default (`RAILS_DESK_RATE_SESSIONS_PER_IP_PER_MIN` can tune it). The standard write-route limits remain separate.

`POST /api/v1/session/rotate` rotates the underlying owner API key, revokes all existing browser sessions, and issues a fresh session to the current browser in the same flow. The previous owner key and every previous browser session are invalidated. Trusted server-side integrations using a separately stored owner bearer key must update that credential as well.

Trusted server-side integrations can continue to send an owner bearer key explicitly. Never expose that key to an agent.

Session hashes live in the desk record, so they inherit the configured desk-storage durability. Production Redis keeps sessions shared across server instances; Preview without Redis uses ephemeral storage and does not provide durable cross-instance sessions.
## Content Security Policy

`src/proxy.ts` creates a per-request nonce and passes the CSP to Next.js in both request and response headers. Production `script-src` uses the nonce and strict-dynamic; it does not permit unsafe-inline or unsafe-eval. The connection policy is restricted to the app's own origin. Objects and framing are blocked, and form actions and base URLs are restricted. The matcher applies to application routes while excluding Next static/image assets and the favicon.

A read-only live header audit on 25 November 2026 checked `/`, `/rails`, `/receipts`, unauthenticated `GET /api/v1/desk` (401), `GET /api/v1/proposals` (405), and a nonexistent path (404). All six responses included CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and the restrictive Permissions-Policy. The HTML routes also returned HSTS and COOP. [Audit run](https://agent.tinyfish.ai/runs/d11e2d3d-f7fd-4d8e-a6ca-a0593967e27d).

`style-src unsafe-inline` remains because the current UI uses React inline style attributes. This is a separate CSS allowance; it does not permit inline JavaScript. Removing it requires converting those style attributes to classes or another nonce-compatible approach.

## API and data controls

- Owner-only routes authenticate against the HttpOnly cookie (or an explicitly supplied server-side owner bearer credential).
- Agent credentials can propose and read status, but cannot edit policy or make owner decisions.
- The daily spend control uses a rolling 24-hour window. Pending proposals reserve budget from creation for at most 24 hours. A proposal still awaiting review after that window is marked expired, receives an expiry receipt, releases its reservation, and can never be approved. Owner decisions and new proposals run the expiry check under the per-desk mutation lock. Once approved, a reviewed proposal counts from its approval timestamp. Refused and expired proposals release their reservation. Proposal-history trimming preserves every unexpired pending reservation and every approved spend record still inside the rolling window.
- The database stores SHA-256 hashes of owner and agent keys, not their plaintext values.
- Mutations use a per-desk lock and revision compare-and-set when Redis is enabled.
- Rate limits apply to write routes. CORS is allowlist-based, never wildcard. Browser writes with an Origin header must be same-origin or explicitly allowlisted; session exchange, logout, and owner-key rotation additionally require an explicit same-origin Origin. Server-to-server requests without Origin remain supported on non-session API routes.
- Proposal reasons and agent-supplied fields are treated as data, not executable instructions.
- The receipt hash chain detects modification or broken links within the stored sequence. It is an application-level integrity check, not a public blockchain anchor or proof against a privileged server operator.
- Historical external-settlement metadata, if present in an older stored desk, is kept opaque for compatibility. It is not returned by the current API, reverified, or actionable.

## Production configuration follow-up

Vercel's environment metadata currently reports a `readable-secret` security finding for the Production Upstash Redis token variable. The variable value was not decrypted, copied, or written to the repository. It is an integration-managed Vercel environment variable, and Vercel rejected changing its type directly to `sensitive`. A safe remediation therefore needs a replacement credential managed as a custom sensitive variable (or an explicitly planned integration disconnect/reconnect), followed by a production redeploy and Redis smoke test. Do not reset the Upstash database password until the replacement credential is ready and the cutover sequence is confirmed, because resetting credentials revokes the existing REST token and briefly restarts the database. This follow-up remains pending.

## Operational notes

- Keep `LT_USERNAME` and `LT_ACCESS_KEY` in GitHub Actions secrets or a gitignored local `.env`. Never commit them.
- Redis environment variables must be configured separately for each Vercel environment that needs durable storage. As of the 25 November 2026 configuration audit, Production has Upstash URL/token variables, while Preview has neither and therefore uses ephemeral storage; no shared Production/Preview Redis database was found. No separate Preview Redis instance is currently configured.
- The production persistence smoke test creates a synthetic desk and proposal. It changes production Redis data, so obtain explicit owner approval before running it.
- Rails Desk does not connect wallets, sign transactions, broadcast transactions, or call blockchain RPC services.
