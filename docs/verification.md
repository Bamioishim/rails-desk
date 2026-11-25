# Verification and release evidence

## Latest main-branch security merge: 25 November 2026

Proposal-expiry, concurrent-budget, and owner-session hardening are merged into `main`:
- [PR #11: pending-review expiry and concurrent budget enforcement](https://github.com/Bamioishim/rails-desk/pull/11)
- [PR #16: revocable owner sessions and session endpoint protections](https://github.com/Bamioishim/rails-desk/pull/16)

The consolidated free-check workflow [#70](https://github.com/Bamioishim/rails-desk/actions/runs/45700162469) passed on the final hardening branch before merge:
- 56 tests across 9 test files passed.
- TypeScript, ESLint, and production build passed.
- Full and production dependency audit steps completed.
- No paid Kane browser suite was invoked.

The canonical production domain remains [rails-desk.vercel.app](https://rails-desk.vercel.app). A Vercel Preview build containing the same application hardening is [available here](https://rails-desk-nu2gb3jmb-bamioishim.vercel.app); `/`, `/demo`, `/rails`, and `/receipts` returned HTTP 200. This Preview uses ephemeral Preview storage and does not use Production Redis.

A new Production deployment for the merged main commit was requested but Vercel rejected it because the account reached its 100-deployments-per-day API limit (HTTP 402; retry after 24 hours). Therefore the production alias has **not** been updated to the merged code yet. Do not treat the Preview URL as the production deployment. The production redeploy remains pending the quota reset.

## Previous production release baseline: 25 November 2026

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

## Automated checks

GitHub Actions free-check run [#45524905266](https://github.com/Bamioishim/rails-desk/actions/runs/45524905266) passed on PR head commit `983cd77a058de9e3c86f4e5a115608bad6a82492`:

- Unit tests: passed
- TypeScript: passed
- ESLint: passed
- Production build: passed
- Full npm audit: zero vulnerabilities
- Production-only npm audit: zero vulnerabilities

The merged production commit was also built successfully by Vercel and its deployment reached READY.

The latest main-branch free-check run [#45679177608](https://github.com/Bamioishim/rails-desk/actions/runs/45679177608) passed on commit `4e8da39745af628bab08b9d59a4b39a40d7a455b` (25 November 2026):

- Dependency installation: passed
- Full dependency audit: passed
- Production dependency audit: passed
- Unit tests: passed
- TypeScript: passed
- ESLint: passed
- Production build: passed

This run validates the free CI checks only. The paid Kane browser suite was subsequently run successfully on the same main-branch source commit in workflow run [#45680518665](https://github.com/Bamioishim/rails-desk/actions/runs/45680518665), detailed below.

## Current Kane browser acceptance

The manual Kane Gate workflow [#105 / run #45680518665](https://github.com/Bamioishim/rails-desk/actions/runs/45680518665) completed successfully on 25 November 2026 against main commit `fc7f73f542b407faf5b83a78dacadeed37853a2c`.

- Result: **5/5 Kane tests passed** (Kane CLI 0.10.6).
- The gate's preceding dependency installation, unit tests, TypeScript check, ESLint, and production build also passed.
- The uploaded [Kane report artifact](https://api.github.com/repos/Bamioishim/rails-desk/actions/artifacts/15054791703) contains `KANE_REPORT.md` with the test outcomes and individual Kane run links.
- The checked-in [current Kane evidence record](kane-evidence/08-current-main-run-2026-11-25.md) preserves the exact report metadata and all five direct test links.

| Browser scenario | Result | Direct Kane evidence |
|---|---|---|
| User sets rules, agent proposes, user approves | Passed | [Open test run](https://test-manager.lambdatest.com/projects/01M7RFY3EPQVJHTWV91XM2E24C/test-cases/01M8A16Y4MSW1G0VH5E9YMZ1V8/dashboard/share/US_S5RE4T00XFJYCAUNMUZZZCB5T4SUNFX40M84EZ3YEKI3IH0VT2VUN1RDPA3V1XDF?type=summary&agentView=true&fqdn=summary-page) |
| Valid demo proposal waits for approval, then mock execution | Passed | [Open test run](https://test-manager.lambdatest.com/projects/01M7RFY3EPQVJHTWV91XM2E24C/test-cases/01M8A1EVTXDVDARYGKAR918HKH/dashboard/share/US_47GY8FDR12OH3JK4GGTTOEVB3CR25YNENFJPRQBICPXCWWSZJH6O78BJ5NN8DRU0?type=summary&agentView=true&fqdn=summary-page) |
| Blocked payment uses “Blocked” wording throughout | Passed | [Open test run](https://test-manager.lambdatest.com/projects/01M7RFY3EPQVJHTWV91XM2E24C/test-cases/01M8A1JJ8HDX9YHS8098AMC8PD/dashboard/share/US_3YAVMP4B6MRIB215RLK4W5N4FPJOVCN6AV3JFNWFQB17KTQTRJDSQSEMR8073DMN?type=summary&agentView=true&fqdn=summary-page) |
| Demo walkthrough runs all three outcomes and narrates them | Passed | [Open test run](https://test-manager.lambdatest.com/projects/01M7RFY3EPQVJHTWV91XM2E24C/test-cases/01M8A1MEFJ726737ES452EYEWX/dashboard/share/US_0SZKQB8PWTILZ7Y4HQL6WU10QPR5ZBE5Y4XP6AM7QBVNGG59WB9LEXLK6FIFJMVL?type=summary&agentView=true&fqdn=summary-page) |
| Landing page opens the demo and the app | Passed | [Open test run](https://test-manager.lambdatest.com/projects/01M7RFY3EPQVJHTWV91XM2E24C/test-cases/01M8A1RZBHMBNZZZS4VD78R1J0/dashboard/share/US_RW5UHURFDLQLTZX3QXQPJZG6SLX8WDQORAPQRP28221QQI639IOE9XKBPETSNIWC?type=summary&agentView=true&fqdn=summary-page) |

The uploaded workflow artifact contains `KANE_REPORT.md` with the five passing outcomes and these individual Kane dashboard links. It does **not** contain a separate screenshot bundle. This is browser acceptance of the documented mock/demo flows, not a live payment or settlement test.

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

The paid Kane gate is separate and manual. Run it only with explicit owner approval and available credits. A skipped or unavailable Kane run is not a pass. The current approved run and its 5/5 result are recorded above.


## Pending-review expiry and concurrent budget checks

Security hardening PR [#11](https://github.com/Bamioishim/rails-desk/pull/11) was tested on branch `security-expiry-budget-guards` in free CI run [#45694367748](https://github.com/Bamioishim/rails-desk/actions/runs/45694367748) on 25 November 2026.

- Unit tests passed, including the new 24-hour pending-review expiry test.
- Expired proposals receive a `review_expired` receipt, are removed from the pending queue, release their budget reservation, and cannot be approved afterward.
- Concurrent submissions across three simulated server instances were tested against a daily spend cap; only the two proposals within the cap were accepted.
- Existing cross-instance receipt-chain and concurrent owner-decision tests passed.
- TypeScript, ESLint, and production build passed.

The changes are merged into `main` through PR #11. The automated run is test evidence, not production runtime verification.

## General API write Origin guard

Draft [PR #18](https://github.com/Bamioishim/rails-desk/pull/18) adds same-origin or explicitly allowlisted Origin validation to all write routes. Requests without an Origin header remain supported for server-to-server agent clients. The dedicated session routes continue to require an explicit same-origin Origin header and their separate per-IP rate limit.

Free-check run [#45701404553](https://github.com/Bamioishim/rails-desk/actions/runs/45701404553) passed on branch `security/write-origin-guard`:
- 57/57 tests passed.
- TypeScript, ESLint, full and production dependency audits, and production build passed.
- No Kane or paid browser tests were run.

Vercel Preview did not create a deployment because the account build-rate limit was reached. This is an account-level deployment blocker; the GitHub production build passed. The PR is a draft and has not been merged.

## Revocable owner-session hardening

PR [#16](https://github.com/Bamioishim/rails-desk/pull/16) adds server-validated browser sessions:
- Browser cookies contain random session tokens; only SHA-256 hashes and expiry metadata are persisted.
- Logout revokes the current browser session, so a copied cookie no longer authenticates.
- Owner-key rotation invalidates all previous browser sessions and issues a fresh session to the current browser.
- Session exchange, logout, and rotation reject missing or cross-origin Origin headers and use a dedicated per-IP limit.
- Existing raw owner-key cookies are upgraded to revocable sessions on app startup.

The free-check run [#70](https://github.com/Bamioishim/rails-desk/actions/runs/45700162469) passed 56 tests across 9 files, plus TypeScript, ESLint, dependency audits, and production build. This is automated verification; no live production owner session was used or modified.

## General API write Origin guard follow-up

Draft [PR #18](https://github.com/Bamioishim/rails-desk/pull/18) adds same-origin or explicitly allowlisted Origin validation to all write routes. Requests without an Origin header remain supported for server-to-server agent clients. The dedicated session routes continue to require an explicit same-origin Origin header and their separate per-IP rate limit.

Free-check run [#45701404553](https://github.com/Bamioishim/rails-desk/actions/runs/45701404553) passed on branch `security/write-origin-guard`:
- 57/57 tests passed.
- TypeScript, ESLint, full and production dependency audits, and production build passed.
- No Kane or paid browser tests were run.

Vercel Preview did not create a deployment because the account's daily deployment quota was reached. The existing security Preview remains the latest available preview; the GitHub production build passed. PR #18 is ready for review and has not been merged.
