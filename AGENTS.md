<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Mandatory Kane completion gate

Kane verification is an absolute completion requirement for every code, test, configuration, or documentation change in this repository.

**You are not done until the latest `KANE_REPORT.md` explicitly says `PASS`.**

1. Run `npm test` and `npm run build`.
2. Run `npm run kane:gate` after the final change. This is the canonical Kane command. It must generate a fresh `KANE_REPORT.md` and `.kane/last-report.json` for the exact code being evaluated.
3. Read the complete report. Confirm its generated timestamp is after the final change, its commit matches the checked-out commit, and its result is `PASS`. A report from an earlier commit or earlier code state is stale and does not count.
4. If the report is missing, stale, incomplete, skipped, or reports `FAIL` or `ERROR`, the task is **not verified**. Fix the cause and rerun the gate.
5. Never fabricate, edit, reinterpret, or manually mark Kane results as passing. Never weaken a test assertion merely to obtain a pass.
6. Do not claim completion, describe the change as fully tested, or recommend pushing, merging, or deploying while the latest report is missing, stale, skipped, or red.
7. If Kane cannot run because credentials, CLI access, browser access, or the environment is unavailable, state that limitation plainly. Leave the task unverified. A skipped run is not a pass.
8. Run the gate again after any subsequent change. A previously passing report does not validate later edits.

The final rule is absolute: **no current Kane PASS, no completion claim and no push recommendation.**

Kane tests must stay in Demo (mock) mode. Never connect a wallet, enter keys, seed phrases, or card details. See `.testmuai/context.md`.

Credentials: `LT_USERNAME` and `LT_ACCESS_KEY` come from the environment or a gitignored `.env`. Never print, log, or commit them.
