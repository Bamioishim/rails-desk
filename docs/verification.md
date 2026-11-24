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

## Automated Kane run and credit limitation

GitHub Actions run [#92](https://github.com/Bamioishim/rails-desk/actions/runs/45202364063) completed with 4/5 browser scenarios passing. The landing/demo-entry scenario did not complete because the Kane service returned `insufficient credits`. That is a test-service quota failure, not a recorded application assertion failure.

The automated result remains 4/5. The manual acceptance above separately records the project owner's successful 5/5 walkthrough. No additional Kane run should be triggered until the service credit balance is replenished.

## Production Redis smoke test

`npm run verify:production` creates a fresh desk on the live deployment, submits a synthetic Jordan proposal for 15 credits, then reads the desk twice. It checks that:

1. The live API reports storage: redis.
2. The proposal remains needs_review and is never approved.
3. The returned receipt ID is present after a fresh read.
4. The receipt chain verifies on both reads.

The test does not approve the proposal or execute a transfer. GitHub Actions runs this check after pushes to main and can also run it manually. It leaves one clearly labelled synthetic pending proposal in an isolated desk for each run.

## Production check completed 23 November 2026

The post-merge Production Redis smoke workflow passed on main commit 921b2b80d9f1c69856b8d2fd905ec2a0bd1e7b5f. It created a synthetic 15-credit Jordan proposal and verified two independent fresh reads:

- Storage: redis
- Receipt: rcpt_f300d5ef74312016da
- Both reads returned the same receipt ID and a valid hash chain.
- Proposal status remained needs_review.
- The owner-session release was live before the test ran. The test used the HttpOnly owner cookie and confirmed that desk creation returned an agent key, not an owner key.

No approval or funds movement occurred. See [the successful Production Redis workflow](https://github.com/Bamioishim/rails-desk/actions/runs/45184739958).

## Historical Kane evidence

Earlier automated 5/5 results are historical and apply only to the commits named in their original reports. They are not substituted for the current branch's manual acceptance result or current automated status.
