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

The Kane gate builds a local production build, starts it, and runs the five browser tests in tests/kane/. It exits non-zero if any test fails. It requires Kane CLI 0.10.6 and LT_USERNAME / LT_ACCESS_KEY credentials.

GitHub Actions runs the Kane gate for pull requests and pushes to main. A post-merge run is the evidence for the exact main commit; PR-branch runs are not a substitute.

## Manual browser acceptance: 5/5 passed on 24 November 2026

The project owner manually exercised all five Kane browser scenarios against the current feature build and confirmed that all five passed:

1. Landing page and demo entry.
2. Complete guided walkthrough and live event log.
3. Owner approval and testnet settlement flow.
4. Blocked-recipient wording and policy outcome.
5. Agent review and proposal status flow.

This is a **manual 5/5 acceptance result**, reported by the project owner. It is not represented as a successful automated Kane run.

## Latest post-merge automated Kane run and credit limitation

GitHub Actions run [#96](https://github.com/Bamioishim/rails-desk/actions/runs/45302945102) ran against main commit `7f287f811182720c541db762ae39933ffca502e7` after PR #8 merged. The five browser scenarios all stopped at the same Kane service response: `Credits exhausted: {"error":"insufficient credits"}`. The report records 0/5 because none of the scenarios could complete; it contains no app-specific failed assertion or expected-versus-actual UI mismatch.

The same run completed `npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` successfully before the Kane step. The service-credit failure remains an automated gate failure, not an automated application acceptance result.

The project owner separately reported manual acceptance of all five scenarios. That owner-reported manual 5/5 result is recorded above and is not represented as an automated Kane pass. Do not trigger another paid Kane run until credits are available. The earlier [run #92](https://github.com/Bamioishim/rails-desk/actions/runs/45202364063), which completed 4/5, is historical and is superseded by run #96 for the post-merge main commit.

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
