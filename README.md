# Rails Desk

Agents that can spend money will eventually send funds to the wrong place.

Rails Desk is the human-controlled gate that sits between the agent and the money.

Owner sets rails once. Agent proposes. You only see what needs a human. Every decision is receipted.

[**Live demo**](https://rails-desk.vercel.app) · [**Kane browser acceptance: 5/5 passed**](https://github.com/Bamioishim/rails-desk/actions/runs/45680518665) · [Product walkthrough](https://youtu.be/D_56omuFeks) · [GitHub](https://github.com/Bamioishim/rails-desk)

## For judges: the 2-minute path

1. **Walkthrough:** [Open the guided demo](https://rails-desk.vercel.app/demo) and press **Play walkthrough**. See an approved proposal, one waiting for owner review, and one blocked by policy.
2. **Rails:** [Open the policy desk](https://rails-desk.vercel.app/rails) to see how recipient allowlists, per-action limits, review thresholds, and daily spend caps govern agent proposals.
3. **Receipts:** [Open the receipt history](https://rails-desk.vercel.app/receipts) to inspect the recorded decisions and SHA-256-linked receipt chain.

Rails Desk is a policy and approval layer for AI-agent payment proposals. It checks each proposal against owner-defined rules and returns **approved**, **needs your OK**, or **blocked**, with a SHA-256 hash-chained receipt.

**Rails Desk records decisions; it does not execute payments.** It has no wallet connection, blockchain settlement, transaction broadcasting, or public-chain receipt anchoring. Approval means policy approval or owner consent only. No funds move.

[Live app](https://rails-desk.vercel.app) · [Product walkthrough](https://youtu.be/D_56omuFeks) · [GitHub](https://github.com/Bamioishim/rails-desk)

## Product flow

1. An agent submits a payment proposal using its agent key.
2. Rails Desk evaluates the amount, per-action maximum, recipient allowlist, owner-review threshold, and rolling 24-hour spend cap.
3. The proposal is marked **approved**, **needs your OK**, or **blocked**.
4. An owner can approve or refuse proposals awaiting review.
5. Every app decision is recorded in a SHA-256-linked receipt chain. The walkthrough has a separate demo receipt chain.

An approved proposal is not a payment. Rails Desk does not connect to wallets or execute transactions.

## Current verification

**Latest main-branch checks: PASS**

- **Kane browser acceptance:** 5/5 passed on 25 November 2026. [Workflow run #105](https://github.com/Bamioishim/rails-desk/actions/runs/45680518665) · [Kane report artifact](https://api.github.com/repos/Bamioishim/rails-desk/actions/artifacts/15054791703) · [Checked-in per-test evidence](docs/kane-evidence/08-current-main-run-2026-11-25.md).
- **Free CI:** dependency installation, full and production dependency audits, unit tests, TypeScript, ESLint, and production build passed in [run #45679177608](https://github.com/Bamioishim/rails-desk/actions/runs/45679177608).
- **Production Redis smoke:** passed in [run #45526309628](https://github.com/Bamioishim/rails-desk/actions/runs/45526309628).

The Kane suite covers the documented agent-review, mock approval/execution, blocked wording, demo walkthrough, and landing-page entry flows. It tests the mock/demo product, not live payment settlement. No funds move in Rails Desk. The current run artifact contains the Markdown report and direct per-test Kane links, but no separate screenshot bundle.

See [full verification notes and direct test evidence](docs/verification.md) before treating these checks as proof of production payment execution.

## Quickstart

Requires Node.js 20+.

```bash
git clone https://github.com/Bamioishim/rails-desk.git
cd rails-desk
npm ci
npm run dev
```

Open http://localhost:3000. The landing page is `/`, guided walkthrough `/demo`, policy desk `/rails`, and review history `/receipts`.

Run the free local checks:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Try the live demo

1. Open [/demo](https://rails-desk.vercel.app/demo) and press **Play walkthrough**. It shows an approved proposal, one waiting for owner review, and one blocked by policy.
2. Open [/rails](https://rails-desk.vercel.app/rails) to create a desk and configure the recipient allowlist, maximum amount, and review limit.
3. Connect an agent with the agent key shown in **Connect your agent**. The key can submit proposals and read their status, but cannot change policy or approve a proposal.
4. Open [/receipts](https://rails-desk.vercel.app/receipts) to review pending proposals and inspect the hash-chained decision history.

The walkthrough is simulated. Mock execution in the walkthrough does not move funds. Owner approval records a decision only.

## Architecture

```text
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
                 Decision recorded; no payment
```

- **Next.js App Router** serves the web app and JSON API.
- **Policy engine** checks positive amounts, per-action maximum, a rolling 24-hour spend cap (including pending proposals reserved from creation and expiring after 24 hours, with reviewed approvals counted from approval time), case-insensitive recipient allowlist, and owner-review threshold. Policy snapshots are recorded with decisions.
- **Owner session** uses a same-site HttpOnly cookie, Secure in production. The `/rails` page includes a self-service owner-session rotation control. The browser holds a revocable 30-day session ID in an HttpOnly cookie; logout revokes it server-side. The long-lived owner bearer key is not displayed or stored in browser localStorage. The agent key remains separately available to copy into an agent client.
- **Storage** uses Upstash Redis when configured; local development can use JSON files. On serverless hosting, filesystem fallback is temporary and is not durable.
- **Receipts** form a SHA-256-linked sequence for app decisions. Simulated walkthrough events use a separate SHA-256-linked demo chain. These are application-level integrity checks, not public blockchain anchors or proof against a privileged server operator.

## API

Amounts are credits in the demo. Agent calls use `Authorization: Bearer <agent-key>`.

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/desks` | none | Create a desk; sets owner session cookie and returns an agent key |
| GET | `/api/v1/desk` | owner cookie | Read rules, proposals, receipts, and receipt-chain verification |
| PUT | `/api/v1/desk` | owner cookie | Replace policy rules |
| POST | `/api/v1/desk/agent-key` | owner cookie | Rotate the agent key |
| POST | `/api/v1/session/rotate` | owner cookie | Rotate the owner session |
| POST | `/api/v1/proposals` | agent key | Submit a proposal |
| GET | `/api/v1/proposals/:id` | agent key | Read proposal status |
| POST | `/api/v1/proposals/:id/decision` | owner cookie | Approve or refuse a pending proposal |
| POST | `/api/v1/demo/events` | owner cookie | Append a simulated event to the separate demo receipt chain |

The session endpoint at `/api/v1/session` supports one-time migration of existing browser sessions and logout. The owner can rotate the owner session with `POST /api/v1/session/rotate`. Trusted server-side integrations may use an owner bearer key where explicitly configured.

Example agent request:

```bash
curl -X POST https://rails-desk.vercel.app/api/v1/proposals \
  -H "Authorization: Bearer rd_agent_..." \
  -H "Content-Type: application/json" \
  -d '{"amount":8,"recipient":"Alex","reason":"Design invoice"}'
```

The response includes the proposal status, decision reasons, and receipt ID.

## MCP

Download [rails-desk-mcp.mjs](https://rails-desk.vercel.app/rails-desk-mcp.mjs) and configure your MCP client with `RAILS_DESK_URL` and `RAILS_DESK_AGENT_KEY`. It exposes `propose_payment` and `get_proposal`. The MCP server can submit proposals and read their status; it cannot approve them or execute payments.

Runnable setup instructions for Claude Desktop, Cursor, and a custom Node.js MCP client are in [`examples/mcp/`](examples/mcp/README.md). The custom client submits a proposal and reads its status after owner review; it does not execute a payment.

## Current limits

- Amounts are application credits, not token balances or a promise to transfer money.
- No wallet provider, blockchain network, RPC endpoint, smart-account bundler, transaction verifier, settlement API, or public-chain anchor is part of the product.
- Owner approval records consent for a proposal. A separate payment execution system would need its own product requirements, security review, and explicit integration; none is included here.
- The walkthrough uses simulated outcomes. Its mock-execution label is illustrative only; no funds move.
- The production Redis smoke test writes a synthetic desk and proposal. See [verification notes](docs/verification.md) for the last recorded run and the scope of current production checks.
- Phone approvals and automatic scheduled actions are not implemented.

## More documentation

- [Security model and deployment controls](docs/security.md)
- [Verification and test evidence](docs/verification.md)
