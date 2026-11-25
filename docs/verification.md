# Verification and release evidence

## Current production release: 25 November 2026

The X Layer retirement is merged into `main` at commit `8783e6336c58870e864eaa8c42f7ad4cc9a13807`.

The production Vercel deployment for that exact commit is READY:

- Deployment: [Vercel production deployment](https://vercel.com/bamioishim/rails-desk/6nkqPG51gmMoAoLfDdTStgDw9GWw)
- Production domain: [rails-desk.vercel.app](https://rails-desk.vercel.app)

Post-deployment read-only checks:

- `/`, `/demo`, `/rails`, and `/receipts` returned HTTP 200.
- The retired `GET /api/v1/desk/anchors` route returned HTTP 404.
- The retired `GET /api/v1/proposals/legacy/settlement` route returned HTTP 404.
- The four rendered app routes contained no active X Layer wallet, OKX, or testnet settlement UI.
- Vercel reported no runtime errors in the 30-minute window after deployment.

## Isolated legacy receipt read-only branch

Branch: `fix/legacy-receipts-read-only`

Application changes are isolated from production. The branch disables POST writes to the legacy file-backed receipt endpoint, preserves GET history, and removes unused provider write methods. Existing production records and Redis state have not been modified.

Preview deployment for application commit `a9d8dbfd54e3cf555c7ed04b2fd093261ae37263`:
- Vercel deployment reached READY.
- Production build compiled successfully.
- TypeScript completed successfully during the Next.js build.
- Preview `GET /api/receipts` returned HTTP 200 with a valid empty history and `Cache-Control: no-store`.
- The latest branch preview also serves `/rails` and `/receipts` with HTTP 200.

Free GitHub Actions run [#45631383244](https://github.com/Bamioishim/rails-desk/actions/runs/45631383244) passed on branch commit `c32711f2857d36bf8baee82f382574c657ab7cd9`:
- Vitest unit tests: passed, including the API-level approval-flow integration test.
- TypeScript: passed.
- ESLint: passed.
- Production build: passed.
- Full npm audit: zero vulnerabilities.
- Production-only npm audit: zero vulnerabilities.
- Vitest lockfile version: `4.1.12`.

The new `src/app/api/v1/__tests__/workflow.test.ts` test exercises desk creation, owner policy setup, an agent proposal that needs review, rejection of an agent's attempt to approve, owner approval, final proposal status, and a valid two-entry receipt chain. This is an API-level integration test. It ends at the verified owner decision because the current product is decision-only: it does not execute payments or move funds.

The paid Kane browser suite was not invoked; no paid credits were used. The historical 5/5 Kane report on commit `87cae1c` is not evidence for this branch. No current-branch Kane screenshots are available. No production deployment or merge has been authorized.


## Automated checks

GitHub Actions free-check run [#45524905266](https://github.com/Bamioishim/rails-desk/actions/runs/45524905266) passed on PR head commit `983cd77a058de9e3c86f4e5a115608bad6a82492`:

- Unit tests: passed
- TypeScript: passed
- ESLint: passed
- Production build: passed
- Full npm audit: zero vulnerabilities
- Production-only npm audit: zero vulnerabilities

The merged production commit was also built successfully by Vercel and its deployment reached READY. The paid Kane browser suite was not run.

## Production Redis persistence

Production Redis smoke workflow [#45526309628](https://github.com/Bamioishim/rails-desk/actions/runs/45526309628) passed on 25 November 2026 against main commit `8783e6336c58870e864eaa8c42f7ad4cc9a13807`.

- Storage reported: `redis`
- Fresh read #1 and fresh read #2 returned the same receipt: `rcpt_e12a8b952f51f77664`
- Both reads verified the receipt chain as valid.
- Proposal status remained `needs_review`.
- No owner approval or funds movement occurred.

This smoke test creates an isolated synthetic desk and pending proposal in production Redis and leaves that synthetic record there; no existing user desk is changed. It therefore does write test data; the run above completed successfully. The workflow is now path-filtered to application and dependency changes so documentation-only pushes do not create additional production test records.

## Production checks not performed

- No pre-existing owner desk or owner session was accessed. The production Redis smoke test created an isolated synthetic desk and used the owner session returned for that test to perform its two authenticated reads.
- No interactive browser acceptance run was performed against production.

A public route returning HTTP 200 confirms that it is served; it does not prove authenticated API behavior or full interactive acceptance.

## Product boundary after X Layer retirement

Rails Desk is a policy and approval layer only. It has no wallet connection, blockchain network integration, RPC endpoint, smart-account bundler, transaction verifier, payment settlement API, or public-chain receipt anchor.

The retirement removes X Layer testnet wallet and settlement code, receipt-anchor code, X Layer mainnet TapeOut reads, chain-specific UI, and the unused `viem` dependency. The local policy engine, owner approvals, agent proposal API, Redis storage, and application receipt chains remain.

Older settlement metadata and anchor fields are retained opaquely in existing stored desks for compatibility. They are omitted from current API responses, are not reverified, and cannot be acted on. Historical receipt entries remain unchanged so existing hash chains are not rewritten.

## Historical evidence

- The project owner reported a manual 5/5 browser acceptance result on 24 November 2026. One scenario covered the then-existing X Layer testnet settlement flow. That result is historical and does not validate the current decision-only product.
- The earlier Production Redis smoke workflow [run #9](https://github.com/Bamioishim/rails-desk/actions/runs/45302945066) passed on 24 November 2026 against main commit `7f287f811182720c541db762ae39933ffca502e7`. It is superseded as the latest persistence check by run #45526309628.
- The historical free security report in [security-checks.md](security-checks.md) applies only to the source commit recorded in that file.
- Earlier Kane runs are evidence for their named commits only. They are not a current browser result.

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
