# Verification and release evidence

## Current production baseline

The production domain is [rails-desk.vercel.app](https://rails-desk.vercel.app). During the read-only audit on 25 November 2026:

- The Vercel production deployment for the current main commit was READY, and its GitHub Vercel status check was successful.
- The live landing page and `/demo`, `/rails`, and `/receipts` each returned HTTP 200.
- Vercel reported no runtime errors for the preceding seven days.
- The production environment contains the Upstash Redis URL and token variables. Variable names were inspected without decrypting or printing values.
- No X Layer RPC environment variables were configured.
- The authenticated desk API was not read because an owner session was not available to this investigation.
- The production Redis smoke test was not rerun: it creates a synthetic desk and proposal, which would mutate production Redis.

The current production baseline is main commit `700913f370da1d1f62602305adfda9a2c081ed76`. It predates the X Layer retirement changes on this branch. Production continues to serve that baseline until the retirement branch is reviewed, merged, and deployed.

## Read-only limits

HTTP 200 page responses confirm that the routes are being served; they do not prove authenticated workflows, Redis read/write behavior, or interactive browser acceptance. The Vercel runtime-error scan is an operational signal, not a substitute for tests.

No wallet was connected, no signature was requested, no transaction was submitted, no production Redis data was changed, and no paid browser credits were used during this audit.

## Branch verification

The retirement branch removes active wallet, network, settlement, receipt-anchor, and on-chain policy-check code. It preserves the local policy engine, owner approvals, agent proposal API, Redis storage, and application receipt chains.

The free GitHub Actions workflow runs unit tests, TypeScript, ESLint, production build, and npm audits. Its result for the retirement branch is the source of truth for those checks. The paid Kane browser suite remains manual-dispatch only and must not be described as passed unless a fresh run reports PASS.

## Historical evidence (not current feature support)

- The project owner reported a manual 5/5 browser acceptance result on 24 November 2026. One scenario covered the then-existing testnet settlement UI. That scenario is historical and does not describe the product after this retirement.
- Production Redis smoke workflow [run #9](https://github.com/Bamioishim/rails-desk/actions/runs/45302945066) passed on 24 November 2026 against main commit `7f287f811182720c541db762ae39933ffca502e7`. It verified a synthetic pending proposal across two independent reads, confirmed Redis storage and a valid receipt chain, and did not approve the proposal or move funds.
- The same historical smoke run is not evidence that Redis persistence was re-tested on main commit `700913f` or on this branch.
- Free security and quality checks on commit `eb5f4e134ce4711886e9e6ca4367978bf3dfbba1` are recorded in [the historical report](security-checks.md). They are not a current-branch test result.

## Local checks

Run:

```bash
npm ci
npm test
npm run typecheck
npm run lint
npm run build
```

The paid Kane gate is separate and manual. Do not run it without explicit owner approval and available credits. A skipped or unavailable Kane run is not a pass.
