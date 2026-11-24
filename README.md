# Rails Desk

Rails Desk is a safety layer for AI agents that propose payments. It checks each proposal against owner-defined rules and returns **approved**, **needs your OK**, or **blocked**, with a SHA-256 hash-chained receipt. After owner approval, the owner can optionally sign a native test-OKB transfer on X Layer testnet. No mainnet or real-money transfers are supported.

[Live app](https://rails-desk.vercel.app) · [Demo video](https://youtu.be/D_56omuFeks) · [GitHub](https://github.com/Bamioishim/rails-desk)

## Verification status

- **Manual browser acceptance: 5/5 passed**, independently reported by the project owner on 24 November 2026. See [the manual acceptance record](docs/verification.md).
- **Latest post-merge automated Kane run: 0/5.** All five scenarios stopped at the same `insufficient credits` service error before producing application assertions. This is not evidence that five app flows are broken. The automated gate remains red; see [run #96](https://github.com/Bamioishim/rails-desk/actions/runs/45302945102) and the [full verification record](docs/verification.md).
- The post-merge unit tests, typecheck, lint, and production build passed. The [production Redis smoke test](https://github.com/Bamioishim/rails-desk/actions/runs/45302945066) also passed.
- Production is live at [rails-desk.vercel.app](https://rails-desk.vercel.app), deployed from merge commit `7f287f811182720c541db762ae39933ffca502e7`.
- Do not rerun the paid Kane browser suite until its credits are replenished.

## Quickstart

Requires Node.js 20+.

~~~bash
git clone https://github.com/Bamioishim/rails-desk.git
cd rails-desk
npm ci
npm run dev
~~~

Open http://localhost:3000. The landing page is /, guided walkthrough /demo, policy desk /rails, and review queue /receipts.

Run the checks:

~~~bash
npm test
npm run typecheck
npm run lint
npm run build
~~~

## Try the live demo

1. Open [/demo](https://rails-desk.vercel.app/demo) and press **Play walkthrough**. It shows an approved proposal, one waiting for owner review, and one blocked by policy.
2. Open [/rails](https://rails-desk.vercel.app/rails) to create a desk and configure the recipient allowlist, maximum amount, and review limit.
3. Connect an agent with the agent key shown in **Connect your agent**. The key can submit proposals and read their status, but cannot change policy or approve a proposal.
4. Open [/receipts](https://rails-desk.vercel.app/receipts) to review pending proposals and inspect the hash-chained decision history.

The walkthrough is simulated. Owner approval records a decision; a separate owner-signed action can execute a native test-OKB transfer on X Layer testnet.

## Architecture

~~~text
Agent / MCP client
      │  agent key
      ▼
POST /api/v1/proposals ──► Policy evaluator
                              │
                  ┌───────────┼───────────┐
                  ▼           ▼           ▼
               approved   needs_review  blocked
                  │           │           │
                  └───────────┴───────────┘
                              ▼
                    SHA-256 receipt chain
                              │
                       Owner review UI
                              │
                 Optional owner-signed testnet transfer
                              │
                  Server verifies mined transaction
~~~

- **Next.js App Router** serves the web app and JSON API.
- **Policy engine** checks positive amounts, per-action maximum, a UTC-calendar-day spend cap (including proposals awaiting owner review), case-insensitive recipient allowlist, and owner review threshold. Policy snapshots are recorded with decisions.
- **Owner session** uses a same-site HttpOnly cookie, Secure in production. The agent key remains in browser storage only so the owner can copy it into an agent client.
- **Storage** uses Upstash Redis when configured; local development can use JSON files. On serverless hosting, filesystem fallback is temporary and is not durable.
- **Receipts** form a SHA-256-linked sequence. Owners can periodically anchor a receipt hash on X Layer testnet with a zero-value self-transaction; the transaction calldata contains the `RDK1` tag and 32-byte hash. This is independently inspectable transaction data, not a contract-based registry.

## API

Amounts are credits in the demo. Agent calls use Authorization: Bearer <agent-key>.

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | /api/v1/desks | none | Create a desk; sets owner session cookie and returns an agent key |
| GET | /api/v1/desk | owner cookie | Read rules, proposals, receipts, and chain verification |
| PUT | /api/v1/desk | owner cookie | Replace policy rules |
| POST | /api/v1/desk/agent-key | owner cookie | Rotate the agent key |
| POST | /api/v1/proposals | agent key | Submit a proposal |
| GET | /api/v1/proposals/:id | agent key | Read proposal status |
| POST | /api/v1/proposals/:id/decision | owner cookie | Approve or refuse a pending proposal |
| POST | /api/v1/proposals/:id/settlement | owner cookie | Verify and record a mined X Layer testnet transfer for an approved proposal |
| POST | /api/v1/desk/anchors | owner cookie | Verify and record an X Layer testnet receipt-head anchor |
| POST | /api/v1/demo/events | owner cookie | Append a clearly labelled simulated demo event |

The app's session endpoint at /api/v1/session is used for one-time migration of existing browser sessions and logout. Trusted server-side integrations may still use an owner bearer key where explicitly configured.

Example agent request:

~~~bash
curl -X POST https://rails-desk.vercel.app/api/v1/proposals \\
  -H "Authorization: Bearer rd_agent_..." \\
  -H "Content-Type: application/json" \\
  -d '{"amount":8,"recipient":"Alex","reason":"Design invoice"}'
~~~

The response includes the proposal status, decision reasons, and receipt_id.

## MCP

Download [rails-desk-mcp.mjs](https://rails-desk.vercel.app/rails-desk-mcp.mjs) and configure your MCP client with RAILS_DESK_URL and RAILS_DESK_AGENT_KEY. It exposes propose_payment and get_proposal.

## MCP examples

Runnable setup instructions for Claude Desktop, Cursor, and a custom Node.js MCP client are in [`examples/mcp/`](examples/mcp/README.md). The custom client submits a proposal and reads its status after owner review; it does not execute a payment.

## Current limits

- Settlement is limited to native test OKB on X Layer testnet. It requires an injected owner wallet and testnet funds; no mainnet or real-money transfer is supported.
- Owner approval and settlement are separate states. An approved proposal is not settled until the server verifies the successful testnet transaction.
- Receipt-head anchoring is owner-triggered from the Receipts page, with a suggested interval of every 25 new receipts. It uses a zero-value self-transaction rather than a deployed registry contract. The live wallet transaction flow still needs end-to-end verification before production claims.
- The production smoke test checks Redis persistence against the live deployment; see [verification notes](docs/verification.md).
- The receipt chain is hash-linked and server-verified. Testnet anchors are stored with the desk and link to the transaction on the X Layer testnet explorer.
- Phone approvals and automatic scheduled anchoring are not implemented.

## More documentation

- [Security model and deployment controls](docs/security.md)
- [Verification and test evidence](docs/verification.md)
