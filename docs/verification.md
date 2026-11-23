# Verification and release evidence

## Automated checks

Run locally:

~~~bash
npm ci
npm test
npm run lint
npm run build
npm run kane:gate
~~~

The Kane gate builds a local production build, starts it, and runs the five browser tests in tests/kane/. It exits non-zero if any test fails. It requires Kane CLI 0.10.6 and LT_USERNAME / LT_ACCESS_KEY credentials.

GitHub Actions runs the Kane gate for pull requests and pushes to main. The post-merge run is the evidence for the exact main commit; earlier PR-branch runs are not a substitute.

## Production Redis smoke test

npm run verify:production creates a fresh desk on the live deployment, submits a synthetic Jordan proposal for 15 credits, then reads the desk twice. It checks that:

1. The live API reports storage: redis.
2. The proposal remains needs_review and is never approved.
3. The returned receipt ID is present after a fresh read.
4. The receipt chain verifies on both reads.

The test does not approve the proposal or execute a transfer. GitHub Actions runs this check after pushes to main and can also run it manually. It leaves one clearly labelled synthetic pending proposal in an isolated desk for each run.

## Production check completed 23 November 2026

The live production alias https://rails-desk.vercel.app was tested while main was at commit 33686d8ab7717dcbd0457d13ad094f61a3f8584a. The smoke test returned storage=redis on two independent fresh reads. Both reads returned receipt rcpt_bc12bfac86e6e33052, the chain verified, and the proposal remained needs_review. No approval or funds movement occurred.

The post-merge workflow will repeat this check against the deployment containing the HttpOnly owner-session change.

## Historical Kane evidence

The previous fail → fix → pass sequence and the 5/5 run from 20 November 2026 are preserved under docs/kane-evidence/. Those historical results document earlier commits only. They do not claim that the current main commit has passed; use the latest GitHub Actions run and its kane-report artifact for that.
