# Kane gate report: FAIL ❌

- Generated: 2026-11-19T23:03:32.964Z by `npm run kane:gate` (kane-cli 0.10.6)
- Commit: `0147902`
- Target: http://127.0.0.1:3100
- Result: 0/1 Kane tests passed
- Kane credits used: 18.7 (left: 922.0)

| Test | Result | Kane run |
|---|---|---|
| `tests/kane/demo-blocked-wording_test.md` · A blocked payment says "Blocked" everywhere | ❌ failed | [open in Kane](https://test-manager.lambdatest.com/projects/01M7TXC9HAMFHFKZW2RB009S89/test-cases/01M7V0R1CZ9AR5HYC0R09S8529/dashboard/share/US_JD4PJKNGQ12XDJMQT0KJK2QREULES6L2AM622HSWS2PUQDN80W99VH6CNTV7Q19Y?type=summary&agentView=true&fqdn=summary-page) |

## Fix request for the coding agent

You are the coding agent on Rails Desk. Kane CLI ran the browser tests below against the app and at least one failed. The gate exits non-zero, so push and deploy stay blocked until it is green.

Do this:
1. Read each failure below: Kane's failing step, the expected vs actual values, and Kane's diagnosis.
2. Decide whether the **app** is wrong (fix the code) or the **test** is wrong (Kane's diagnosis says the test checked the wrong place, or the requirement changed). Never weaken an assertion just to get green.
3. Make the smallest fix in the files listed, then run `npm test` and `npm run build`.
4. Run `npm run kane:gate` again and repeat until this report says PASS.

### ❌ A blocked payment says "Blocked" everywhere

- Test file: `tests/kane/demo-blocked-wording_test.md` (route `/demo`)
- Kane run (video, steps, screenshots): https://test-manager.lambdatest.com/projects/01M7TXC9HAMFHFKZW2RB009S89/test-cases/01M7V0R1CZ9AR5HYC0R09S8529/dashboard/share/US_JD4PJKNGQ12XDJMQT0KJK2QREULES6L2AM622HSWS2PUQDN80W99VH6CNTV7Q19Y?type=summary&agentView=true&fqdn=summary-page
- Failing step: The checked Mallory proposal shows Refused in the status and receipt, so required Blocked checkpoints cannot pass.
- Kane's diagnosis: The demo correctly identifies Mallory as blocked by the TapeOut rule, but presents the final decision as “Refused” instead of the required consistent word “Blocked.”

What the test requires:

> ## Block an unknown recipient and read every status
> Stay in "Demo (mock)" mode. Do not click Connect wallet. Set the "Recipient" field to Mallory and keep the amount at 12. Click "Check against rails". The rails must block this proposal, and the user must see one consistent word for it. Verify all of these: the TapeOut policy circuit rule says "Blocked"; the status pill next to the "Referee decision" heading says exactly "Blocked" (not "Refused" or any other word); the receipt's decision line says "Blocked"; and there is no "Approve" button.

Kane's full summary:

> The decision display and receipt use a different word from the TapeOut policy result. This makes one proposal show conflicting decision terminology.
> Use “Blocked” consistently for a TapeOut-blocked proposal in the Referee decision status pill and the receipt decision line, then rerun this demo scenario.
> evidence: objective_contradiction: The checked Mallory proposal shows Refused in the status and receipt, so required Blocked checkpoints cannot pass.

Files likely involved:
- `src/app/demo/page.tsx` lines 25, 28, 54, 59, 60, 68, 72, 75 (contains "Demo (mock)", "Recipient", "Check against rails", "Blocked", "Referee decision", "Refused", "Approve")
- `src/app/receipts/page.tsx` lines 55 (contains "Recipient", "Refused", "Approve")
- `src/lib/policy-circuit.ts` (renders /demo)
- `src/lib/demo-config.ts` (renders /demo)
