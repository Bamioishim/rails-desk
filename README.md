# Rails Desk

Rails Desk is a safety layer for AI agents that propose payments. It checks each proposal against owner-defined rules and returns **approved**, **needs your OK**, or **blocked**, with a SHA-256 hash-chained receipt. It records decisions only: **no real funds move**.

[Live app](https://rails-desk.vercel.app) · [Demo video](https://youtu.be/D_56omuFeks) · [GitHub](https://github.com/Bamioishim/rails-desk)

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
npm run lint
npm run build
~~~

## Try the live demo

1. Open [/demo](https://rails-desk.vercel.app/demo) and press **Play walkthrough**. It shows an approved proposal, one waiting for owner review, and one blocked by policy.
2. Open [/rails](https://rails-desk.vercel.app/rails) to create a desk and configure the recipient allowlist, maximum amount, and review limit.
3. Connect an agent with the agent key shown in **Connect your agent**. The key can submit proposals and read their status, but cannot change policy or approve a proposal.
4. Open [/receipts](https://rails-desk.vercel.app/receipts) to review pending proposals and inspect the hash-chained decision history.

The walkthrough is simulated. Approving a proposal records an owner decision; it does not execute a payment.

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
~~~

- **Next.js App Router** serves the web app and JSON API.
- **Policy engine** checks positive amounts, per-action maximum, case-insensitive recipient allowlist, and owner review threshold. Policy snapshots are recorded with decisions.
- **Owner session** uses a same-site HttpOnly cookie, Secure in production. The agent key remains in browser storage only so the owner can copy it into an agent client.
- **Storage** uses Upstash Redis when configured; local development can use JSON files. On serverless hosting, filesystem fallback is temporary and is not durable.
- **Receipts** form a SHA-256-linked sequence. This is tamper-evident within the stored record, not an independently anchored public proof.

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
| POST | /api/v1/demo/events | owner cookie | Append a clearly labelled simulated demo event |

The app's session endpoint at /api/v1/session is used for one-time migration of existing browser sessions and logout. Trusted server-side integrations may still use an owner bearer key where explicitly configured.

Example agent request:

~~~bash
curl -X POST https://rails-desk.vercel.app/api/v1/proposals \
  -H "Authorization: Bearer rd_agent_..." \
  -H "Content-Type: application/json" \
  -d '{"amount":8,"recipient":"Alex","reason":"Design invoice"}'
~~~

The response includes the proposal status, decision reasons, and receipt_id.

## MCP

Download [rails-desk-mcp.mjs](https://rails-desk.vercel.app/rails-desk-mcp.mjs) and configure your MCP client with RAILS_DESK_URL and RAILS_DESK_AGENT_KEY. It exposes propose_payment and get_proposal.

## Current limits

- No blockchain transaction or real-money transfer is executed.
- An owner approval is a recorded decision only.
- The production smoke test checks Redis persistence against the live deployment; see the verification notes and latest GitHub Actions result.
- The receipt chain is hash-linked and server-verified. For stronger independent auditability, its head must be periodically anchored outside the application.
- Phone approvals and external on-chain settlement are not implemented.

## More documentation

- [Security model and deployment controls](docs/security.md)
- [Verification, Kane gate, and production persistence checks](docs/verification.md)
- [Historical Kane evidence](docs/kane-evidence/)
