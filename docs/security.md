# Security model

## Owner authentication

The browser-facing owner credential is stored in the rails_desk_owner cookie with HttpOnly, SameSite=Strict, Path=/, a 30-day expiry, and Secure in production. Client-side JavaScript cannot read it. Owner-only browser actions use same-origin requests and the cookie; the agent key remains separately available to copy into an MCP client or other agent.

Existing browsers with the former rails-desk-keys-v1 localStorage record are migrated once: the client exchanges the legacy owner key with POST /api/v1/session, then rewrites localStorage with only the desk ID and agent key. The server validates the key before setting the cookie. Logging out clears the cookie and removes the local browser record.

Trusted server-side integrations can continue to send an owner bearer key explicitly. Never expose that key to an agent.

## Content Security Policy

src/proxy.ts creates a per-request nonce and passes the CSP to Next.js in both request and response headers. Production script-src uses the nonce and strict-dynamic; it no longer permits unsafe-inline or unsafe-eval. The policy restricts connections to the app origin and configured X Layer RPC hosts, blocks objects and framing, and restricts form actions and base URLs.

style-src unsafe-inline remains because the current UI uses React inline style attributes. This is a separate CSS allowance; it does not permit inline JavaScript. Removing it requires converting those style attributes to classes or another nonce-compatible approach.

## API and data controls

- Owner-only routes authenticate against the HttpOnly cookie (or an explicitly supplied server-side owner bearer credential).
- Agent credentials can propose and read status, but cannot edit policy or make owner decisions.
- The database stores SHA-256 hashes of owner and agent keys, not their plaintext values.
- Mutations use a per-desk lock and revision compare-and-set when Redis is enabled.
- Rate limits apply to write routes. CORS is allowlist-based, never wildcard.
- Proposal reasons and agent-supplied fields are treated as data, not executable instructions.
- The receipt hash chain detects modification or broken links within the stored sequence. It is not a public blockchain anchor or proof against a privileged server operator.

## Operational notes

- Keep LT_USERNAME and LT_ACCESS_KEY in GitHub Actions secrets or a gitignored local .env. Never commit them.
- Redis environment variables must be configured separately for each Vercel environment that needs durable storage.
- The production persistence smoke test creates a synthetic proposal and verifies that its receipt survives independent API reads. It never approves the proposal and never moves funds.
