# Rails Desk

Rails Desk is a mocked-transfer control desk. Agents can propose transfers, but deterministic local rails decide whether a proposal is approved or refused. Approval can be cancelled before the explicit mock execution step.

## Scope and safety

- No real funds, wallets, blockchain networks, or transfers.
- Spending-cap and case-insensitive recipient allowlist checks are deterministic.
- Approval, refusal, and cancellation are recorded with their reason.
- Browser receipts remain in the existing browser localStorage store.
- New local test receipts can also be written to an append-only JSON Lines file at `data/receipts.jsonl`.
- Receipt verification recomputes every SHA-256 hash, checks sequence numbers and previous-hash links, and reports the first broken entry.

The file-backed log is local development storage, not a production database. It is not durable on ephemeral/serverless hosting and can be modified by anyone with filesystem access. Hash links are tamper-evident, not cryptographic proof against an attacker who can rewrite the entire file and recompute every hash. Back up the file if it matters.

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
npm run receipts:append -- --amount 10 --r¶»§q«^