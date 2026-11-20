# Rails Desk: agent instructions

Read and follow [AGENTS.md](AGENTS.md).

**Mandatory:** You are not done until the latest, fresh `KANE_REPORT.md` explicitly says `PASS` for the exact code being evaluated. Run `npm test`, `npm run build`, then `npm run kane:gate` after the final change. Read the report and verify it is current.

If the report is missing, stale, skipped, incomplete, or says `FAIL` or `ERROR`, the task is not verified. Fix the cause and rerun Kane. Never fabricate or manually alter results, never claim completion, and never recommend pushing, merging, or deploying without a current PASS. If Kane cannot run, explain why and leave the task unverified. A skipped run is not a pass.
