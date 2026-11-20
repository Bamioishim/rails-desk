<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Kane gate: required after every change (closed loop)

This repo is verified with [Kane CLI](https://www.testmuai.com/kane-cli/). Kane drives a real Chrome through the flows in `tests/kane/*_test.md` and judges them in plain language. Its result is the source of truth for "done".

After you change anything under `src/`, `tests/kane/` or `.testmuai/`:

1. Run `npm test` and `npm run build`.
2. Run `npm run kane:gate`. It builds the app, starts it on port 3100, runs every Kane test, writes `KANE_REPORT.md` and `.kane/last-report.json`, and exits non-zero on any failure.
3. If it fails, read `KANE_REPORT.md`. The "Fix request for the coding agent" section is addressed to you: the failing step, expected vs actual values, Kane's diagnosis, the Kane run link, and the files likely involved.
4. Fix the app (or the test, only if Kane's diagnosis shows the test itself is wrong; never weaken an assertion just to pass), then go back to step 1.
5. You are done only when `KANE_REPORT.md` says **PASS**. Commit `KANE_REPORT.md` and `.kane/last-report.json` with the change so the history shows the evidence.

To save credits while iterating, run only the affected tests first (`npm run kane:gate -- --match demo-blocked`), then the full gate before you finish.

Guardrails for Kane tests: stay in Demo (mock) mode, never connect a wallet, never enter keys, seed phrases or cards. See `.testmuai/context.md`.

Credentials: `LT_USERNAME` and `LT_ACCESS_KEY` come from the environment or a gitignored `.env`. Never print, log or commit them.
