# Rails Desk

Rails Desk is a mocked-transfer control desk. Agents can propose transfers, but deterministic local rails decide whether a proposal is approved or refused. Approval can be cancelled before the explicit mock execution step.

## Scope and safety

- No real funds, wallets, blockchain networks, or transfers.
- Spending-cap and case-insensitive recipient allowlist checks are deterministic.
- Approval, refusal, and cancellation are recorded with their reason.
- Existing browser receipts are preserved in localStorage as separate legacy history; they are not deleted or silently migrated.
- New app approvals, policy refusals, user refusals and cancellations append to the same JSON Lines file at `data/receipts.jsonl`.
- The app receipt page reads that file through the Node API route and displays the same chain checked by the CLI verifier.
- The Node route re-evaluates each proposal against the configured rails included with the request before recording an approved mock execution. This is still a local demo with no user accounts or authentication, not a production security boundary.

The file-backed log is suitable for a local Node development process with a writable project directory. It is not a production database. Vercel/serverless filesystems are ephemeral and the project directory may be read-only, so this file is not durable or reliable across invocations or instances there. Configure a persistent database or object store before deploying for real use. Anyone with filesystem access can rewrite the entire file and recompute its hashes; the chain is tamper-evident, not immutable.

## Local setup

Requires Node.js 20+ and npm.

```bash
npm ci
npm run dev
```

Open http://localhost:3000.

## Tests and checks

```bash
npm test
npm run lint
npm run build
```

## Local file receipt log

Append a mock receipt. The same deterministic default rails apply: cap 20, recipients Alex, Jordan, and Sam.

```bash
npm run receipts:append -- --amount 10 --recipient Alex --reason "local test receipt"
```

Check the full chain:

```bash
npm run receipts:verify
```

A valid chain prints `VALID · N entries`. A failed check prints `BROKEN · first broken entry: N` and exits non-zero. The verifier stops at the first malformed, altered, misnumbered, or incorrectly linked entry. It refuses to append to a broken chain.

For isolated tests, pass a separate file path:

```bash
node scripts/receipts.mjs append --amount 10 --recipient Alex --reason "isolated" --file /tmp/rails-desk-test.jsonl
node scripts/receipts.mjs verify --file /tmp/rails-desk-test.jsonl
```

The test suite uses temporary directories and does not touch `data/receipts.jsonl` or existing browser localStorage data. API route tests call the actual GET/POST handlers directly; no server is started.

## Existing browser receipts

Existing browser receipts are loaded into a separate preserved-history section and remain in the original localStorage key. New app decisions are written to the file-backed chain; the receipt page displays that file chain and its server-side verification status. The CLI verifier checks the same file. The two histories are deliberately kept separate because the app cannot safely assume it can rewrite or migrate an individual user's browser data.

## Kane browser acceptance

Kane CLI browser verification is a separate required step. Unit tests are not Kane runs. The seven approved browser flows must be executed in an authenticated Kane environment with Chrome and approved existing credits.

## Use it with your own agent

1. Open **/rails**. A desk is created for you; your owner key stays in this browser.
2. Set your rules: allowed recipients, maximum per action, and a review limit.
3. Copy the agent key from **Connect your agent** and give it to your agent.

```bash
curl -X POST https://<your-deployment>/api/v1/proposals \
  -H "Authorization: Bearer rd_agent_..." \
  -H "Content-Type: application/json" \
  -d '{"amount": 8, "recipient": "Alex", "reason": "Logo design invoice"}'
# → {"id":"prop_…","status":"approved" | "needs_review" | "blocked","reasons":[…],"receipt_id":"rcpt_…", …}
```

Proposals above the review limit appear on **/receipts** under *Needs your OK* with Approve / Refuse. Every decision is appended to a SHA-256 receipt chain.

| Endpoint | Key | Purpose |
|---|---|---|
| `POST /api/v1/desks` | none | Create a desk; returns `ownerKey` and `agentKey` |
| `GET /api/v1/desk` | owner | Rules, proposals, receipts, chain check |
| `PUT /api/v1/desk` | owner | Replace rules `{allowedRecipients, maxPerAction, reviewLimit}` |
| `POST /api/v1/desk/agent-key` | owner | Rotate the agent key |
| `POST /api/v1/proposals` | agent | Propose `{amount, recipient, reason}` |
| `GET /api/v1/proposals/:id` | agent or owner | Read status, e.g. after review |
| `POST /api/v1/proposals/:id/decision` | owner | `{decision: "approve" \| "refuse"}` |

The agent key can propose and read, but cannot change rules or approve its own proposals. Keys are stored only as hashes.

**MCP:** download `/rails-desk-mcp.mjs` (no dependencies) and add it to your MCP client with `RAILS_DESK_URL` and `RAILS_DESK_AGENT_KEY`. Tools: `propose_payment`, `get_proposal`.

**Storage:** Upstash Redis when `KV_REST_API_URL`/`KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`) are set, which is the free Vercel Marketplace integration. Otherwise JSON files in `data/desks` (or `RAILS_DESK_DATA_DIR`). On Vercel without Redis, files go to `/tmp` and can be cleared; the app says so.

## Verified with Kane CLI

Browser behaviour is checked by [Kane CLI](https://www.lambdatest.com/kane-cli) tests in `tests/kane/`, run by `npm run kane:gate` against a production build. On this branch the gate first failed (blocked payments said "Refused", see `docs/kane-evidence/01-fail-blocked-wording.md`), the fix landed in `ff8324b`, and the gate then passed (`docs/kane-evidence/02-pass-after-fix.md`). The latest run is in `KANE_REPORT.md`.
