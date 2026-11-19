<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


## Kane preview gate and failure handoff

- When a PR receives a failed Kane preview-gate comment, read its result table and evidence link before changing code. Distinguish an application failure from a Kane authentication, setup, timeout, or protected-preview access failure.
- Fix the underlying application issue when a browser assertion exposes a real regression; do not weaken or delete a valid assertion just to make the check green. If the flow is stale or the app behavior intentionally changed, update the test and explain why.
- Run `npm test`, `npm run lint`, and `npm run build` after code changes. Push the fix to the same-repository PR branch so Vercel creates a fresh preview. Wait for the new Kane run and report success only when all seven flows pass.
- Kane tests are mock-only. Never imply that a mocked execution moved real funds. The `/demo` flow is isolated and does not write persistent receipts; `/rails` settings are browser-local and are not connected to `/demo`.
