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

The test suite uses temporary directories and does not touch `data/receipts.jsonl` or existing browser localStorage data.

## Existing browser receipts

The app does not migrate, clear, or overwrite existing browser receipts as part of the file-log feature. The browser receipt page continues to show its valid/broken chain badge for the localStorage chain. The CLI prints a corresponding valid/broken status for the append-only local file.

## Kane browser acceptance

Kane CLI browser verification is a separate required step. Unit tests are not Kane runs. The seven approved browser flows must be executed in an authenticated Kane environment with Chrome and approved existing credits.
