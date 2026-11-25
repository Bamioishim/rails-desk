# Security model

## Owner authentication

The browser-facing `rails_desk_owner` cookie contains a random, 30-day owner-session ID, not the long-lived owner key. It is HttpOnly, SameSite=Strict, Path=/, and Secure in production. Only a SHA-256 hash of each session ID and its expiry are stored in the desk record. Owner-only browser actions use this cookie; the agent key remains separately available to copy into an MCP client or other agent.

Existing browsers with the former `rails-desk-keys-v1` localStorage record are migrated once: the client exchanges the legacy owner key with `POST /api/v1/session`, receives a new session ID, then rewrites localStorage with only the desk ID and agent key. Legacy owner-key cookies are upgraded by `GET /api/v1/session`. The server validates the owner key before issuing a session. Logging out calls `DELETE /api/v1/session`, which revokes the presented session server-side before clearing the cookie. A copied session cookie therefore stops working after logout or session rotation.

`POST /api/v1/session/rotate` replaces the current browser session ID and revokes the previous ID without rotating the long-lived owner key. Existing owner sessions are independent; a session rotation affects only the session used for that request. Sessions expire after 30 days.

Trusted server-side integrations can continue to send the long-lived owner bearer key explicitly. Treat it as a server secret and never expose it to an agent or browser storage. Revoking a browser session does not revoke a separately-held owner bearer key.

## Content Security Policy

`src/proxy.ts` creates a per-request nonce and passes the CSP to Next.js in both request and response headers. Production `script-src` uses the nonce and strict-dynamic; it does not permit unsafe-inline or unsafe-eval. The connection policy is restricted to the app's own origin. Objects and framing are blocked, and form actions and base URLs are restricted.

`style-src unsafe-inline` remains because the current UI uses React inline style attributes. This is a separate CSS allowance; it does not permit inline JavaScript. Removing it requires converting those style attributes to classes or another nonce-compatible approach.

## API and data controls

- Owner-only routes authenticate against the HttpOnly cookie (or an explicitly supplied server-side owner bearer credential).
- Agent credentials can propose and read status, but cannot edit policy or make owner decisions.
- Pending review proposals expire after 24 hours. Expiry is recorded as a system receipt, releases the pending budget reservation, and permanently prevents later approval.
- The daily spend control uses a rolling 24-hour window. Pending proposals reserve budget from creation and expire after 24 hours if the owner does not decide. Expiry is recorded as a system receipt, releases the reservation, and prevents later approval. Once approved, a reviewed proposal counts from its approval timestamp. Refused and expired proposals release their reservation. Proposal-history trimming preserves every pending reservation and every approved spend record still inside the rolling window, so high proposal volume cannot erase cap accounting.
- The database stores SHA-256 hashes of owner and agent keys, not their plaintext values.
- Mutations use a per-desk lock and revision compare-and-set when Redis is enabled.
- Write routes reject browser Origin headers that are neither same-origin nor explicitly allowlisted. Requests without an Origin header remain available for server-to-server agent clients.
- Rate limits apply to write routes. CORS is allowlist-based, never wildcard.
- Proposal reasons and agent-supplied fields are treated as data, not executable instructions.
- The receipt hash chain detects modification or broken links within the stored sequence. It is an application-level integrity check, not a public blockchain anchor or proof against a privileged server operator.
- Historical external-settlement metadata, if present in an older stored desk, is kept opaque for compatibility. It is not returned by the current API, reverified, or actionable.

## Production configuration follow-up

Vercel's environment metadata currently reports a `readable-secret` security finding for the configured Upstash Redis token variable. The variable values were not decrypted, copied, or written to the repository. Before treating production secret handling as fully hardened, rotate the Upstash REST token and store the replacement using Vercel's sensitive/encrypted environment-variable setting for the required environments. This follow-up was not performed as part of the code retirement because it changes production credentials and could interrupt Redis access.

## Operational notes

- Keep `LT_USERNAME` and `LT_ACCESS_KEY` in GitHub Actions secrets or a gitignored local `.env`. Never commit them.
- Redis environment variables must be configured separately for each Vercel environment that needs durable storage. Production currently has its own Upstash configuration; Preview has no Redis variables and therefore uses temporary storage rather than sharing production Redis.
- The production persistence smoke test creates a synthetic desk and proposal. It changes production Redis data, so obtain explicit owner approval before running it.
- Rails Desk does not connect wallets, sign transactions, broadcast transactions, or call blockchain RPC services.
