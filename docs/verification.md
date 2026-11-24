# Verification and release evidence

## Automated checks

Run locally:

~~~bash
npm ci
npm test
npm run typecheck
npm run lint
npm run build
npm run kane:gate
~~~

The Kane gate builds a local production build, starts it, and runs the five browser tests in tests/kane/. It exits non-zero if any test fails. It requires Kane CLI 0.10.6 and LT_USERNAME / LT_ACCESS_KEY credentials. Because Kane is paid, the GitHub workflow is manual-dispatch only; PR pushes and merges do not start it automatically.

GitHub Actions exposes the Kane gate through an explicit workflow dispatch. A run must be deliberately started against the intended commit; there is no automatic paid run on PR updates or main pushes.

## Manual browser acceptance: 5/5 passed on 24 November 2026

The project owner manually exercised all five Kane browser scenarios against the current feature build and confirmed that all five passed:

1. Landing page and demo entry.
2. Complete guided walkthrough and live event log.
3. Owner approval and testnet settlement flow.
4. Blocked-recipient wording and policy outcome.
5. Agent review and proposal status flow.

This is a **manual 5/5 acceptance result**, reported by the project owner. It is not represented as a successful automated Kane run.

## Latest inspected automated Kane attempt and credit limitation

GitHub Actions run [#97](https://github.com/Bamioishim/rails-desk/actions/runs/45303831180) ran against commit `16bbcf7`. Its attached `KANE_REPORT.md` records **0/5** because all five browser scenarios stopped at the same Kane service response: `Credits exhausted: {"error":"insufficient credits"}`. No scenario reached its application assertions, so this report does not establish that five app flows are broken.

The report is an automated gate failure caused by unavailable Kane service credits. It is distinct from the project owner's separately reported manual 5/5 acceptance result above. Do not trigger another paid Kane run until credits are available. Earlier run [#96](https://github.com/Bamioishim/rails-desk/actions/runs/45302945102) is historical and is not the latest inspected Kane attempt.

The current main branch has advanced beyond the commit tested by run #97. Therefore that report is not automated acceptance evidence for the current main HEAD or for the unmerged security branch.

## Security branch verification: 24 November 2026

The rolling-cap and owner-session branch is `fix/rolling-daily-cap-owner-security`. Its free-check workflow [run #6](https://github.com/Bamioishim/rails-desk/actions/runs/45382366399) passed unit tests, TypeScript, ESLint, production build, and both npm audit steps against source commit `e155d3f`. The workflow then recorded its evidence and pushed a generated lockfile/docs commit (`8166060`).

The PR Kane run [#100](https://github.com/Bamioishim/rails-desk/actions/runs/45382374664) completed the app build and started all five browser scenarios, but every scenario stopped at the same Kane service error: `Credits exhausted: {"error":"insufficient credits"}`. No app assertion was reached. A subsequent PR run [#101](https://github.com/Bamioishim/rails-desk/actions/runs/45382491077) was marked `action_required` before a job started. Neither is a successful automated browser acceptance result. Do not spend credits or rerun Kane as part of this change.

The branch now also exposes owner-session rotation in the `/rails` UI. The owner rotates the credential through the existing same-origin endpoint; the new credential remains inside the HttpOnly cookie and is never displayed or copied into agent configuration. The spend-cap controls describe the actual rolling 24-hour behavior.

## CI workflow hardening and isolated demo ledger

The free-check workflow no longer writes generated lockfiles or check reports back to the source branch. It uploads the security report as a workflow artifact, uses read-only repository permissions, and serializes checks per branch with superseded runs cancelled. This avoids the previous concurrent Git push race.

The paid Kane workflow is manual-dispatch only. PR pushes and main pushes no longer launch paid browser runs. The last two automatically launched attempts before this change, runs [#102](https://github.com/Bamioishim/rails-desk/actions/runs/45471685073) and [#103](https://github.com/Bamioishim/rails-desk/actions/runs/45471823680), built the app successfully but returned `Credits exhausted: {\"error\":\"insufficient credits\"}` for all five browser scenarios. Their reports did not reach app assertions. This shows the credentials configured in those runs still had no available Kane credits; it does not establish application test failures.

New walkthrough events are stored in a dedicated `demoReceipts` hash chain with independent verification. The live activity feed combines and labels both streams, while the decision-history table and its export keep app decisions separate. Existing historical demo entries remain in the original chain for integrity and are displayed as demo history rather than silently rewritten.

## Production Redis smoke test

`npm run verify:production` creates a fresh desk on the live deployment, submits a synthetic Jordan proposal for 15 credits, then reads the desk twice. It checks that:

1. The live API reports storage: redis.
2. The proposal remains needs_review and is never approved.
3. The returned receipt ID is present after a fresh read.
4. The receipt chain verifies on both reads.

The test does not approve the proposal or execute a transfer. GitHub Actions runs this check after pushes to main and can also run it manually. It leaves one clearly labelled synthetic pending proposal in an isolated desk for each run.

## Production check completed 24 November 2026

The post-merge Production Redis smoke workflow [run #9](https://github.com/Bamioishim/rails-desk/actions/runs/45302945066) passed against production after PR #8 merged to main commit `7f287f811182720c541db762ae39933ffca502e7`. The live deployment is [rails-desk.vercel.app](https://rails-desk.vercel.app), served by [this READY Vercel production deployment](https://vercel.com/bamioishim/rails-desk/8ND6HzpRKZZy6qndu2cGP7VxjyyW).

The smoke test created a separate synthetic desk and a pending Jordan proposal for 15 credits, then verified two fresh reads:

- Storage: redis
- Receipt: `rcpt_55ad57ace4d927f7be`
- Both reads returned the same receipt ID and a valid hash chain.
- Proposal status remained `needs_review`.
- No approval or funds movement occurred.

The live landing page, `/demo`, `/rails`, and `/receipts` routes each returned HTTP 200 and their expected page headings. This confirms the production pages are serving; it is not a full interactive browser acceptance run.

## Historical production check completed 23 November 2026

The post-merge Production Redis smoke workflow passed on main commit 921b2b80d9f1c69856b8d2fd905ec2a0bd1e7b5f. It created a synthetic 15-credit Jordan proposal and verified two independent fresh reads:

- Storage: redis
- Receipt: rcpt_f300d5ef74312016da
- Both reads returned the same receipt ID and a valid hash chain.
- Proposal status remained needs_review.
- The owner-session release was live before the test ran. The test used the HttpOnly owner cookie and confirmed that desk creation returned an agent key, not an owner key.

No approval or funds movement occurred. See [the successful Production Redis workflow](https://github.com/Bamioishim/rails-desk/actions/runs/45184739958).

## Historical Kane evidence

Earlier automated 5/5 results are historical and apply only to the commits named in their original reports. They are not substituted for the current branch's manual acceptance result or current automated status.


## Rolling spend-cap and owner-key hardening

The `fix/rolling-daily-cap-owner-security` branch adds regression coverage for:
- a proposal created before midnight and approved after midnight;
- spending across UTC midnight under a rolling 24-hour cap;
- a pending proposal retaining its reservation beyond 24 hours until the owner decides;
- owner-key rotation invalidating the previous credential.

It also adds the owner session rotation endpoint and removes the legacy owner key from browser storage after the HttpOnly cookie has been established. The free checks workflow is enabled for this branch. These changes remain unmerged until automated checks and review complete.
