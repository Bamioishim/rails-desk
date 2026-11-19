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

Kane browser verification is separate from unit tests. Once `.github/workflows/kane-preview-gate.yml` is on the default branch, it listens for successful Vercel `deployment_status` events, checks out the deployed commit, substitutes that deployment's preview URL into seven committed Kane tests, and runs them in headless Chrome. It is scoped to open pull requests from branches in this repository; fork PRs are skipped so TestMu credentials are never exposed to fork code.

The seven tests cover the landing-page demo entry, the guided demo, explicit approval plus mock execution, refusal, spending-cap rejection, allowlist rejection, and Rails settings persisting through a reload. The demo checks are intentionally limited to its isolated mock behavior. They do not claim to exercise a real transfer or to connect `/rails` settings to `/demo`.

To activate the gate, add TestMu's Kane username and access key as repository Actions secrets named `LT_USERNAME` and `LT_ACCESS_KEY`. Confirm Vercel's GitHub integration is enabled and sends deployment status events. If the Vercel preview is protected, this workflow needs an approved bypass configured before browser tests can reach it. Require the **Kane browser tests** check in the repository's branch rules after the workflow has run once.

The first authenticated run has no Kane-recorded replay folders yet, so Kane will author the tests and use credits. The workflow uploads generated folders as a `rails-desk-kane-replay-folders-<run id>` artifact; review and commit those `output-<test-name>/` folders beside their test files so Kane can replay recorded steps at lower cost. A PR comment carries the result table, workflow/evidence links, and a coding-agent handoff. After an agent pushes a fix, Vercel creates a new preview and the gate runs again.

This gate is not yet proven end to end until TestMu credentials are configured and an authenticated preview run succeeds. It reports Kane's findings to the PR but does not independently launch a coding agent; an agent working this repository should follow the handoff instructions in `AGENTS.md`.
