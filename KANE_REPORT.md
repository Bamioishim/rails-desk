# Kane gate report: FAIL ❌

- Generated: 2026-11-20T00:02:02.984Z by `npm run kane:gate` (kane-cli 0.10.6)
- Commit: `aeaaaaf`
- Target: http://127.0.0.1:3100
- Result: 0/1 Kane tests passed
- Kane credits used: 19.2 (left: 644.0)

| Test | Result | Kane run |
|---|---|---|
| `tests/kane/demo-blocked-wording_test.md` · A blocked payment says "Blocked" everywhere | ❌ failed | [open in Kane](https://test-manager.lambdatest.com/projects/01M7TXC9HAMFHFKZW2RB009S89/test-cases/01M7V42Y8RGH4SV1G359VKGHA9/dashboard/share/US_P7CB193IJEGDZKRFM5YY8NAVGX0FNX37A7XTQO2DMU1W4TZEJYRCZDUVI8RQ1ZSI?type=summary&agentView=true&fqdn=summary-page) |

## Fix request for the coding agent

You are the coding agent on Rails Desk. Kane CLI ran the browser tests below against the app and at least one failed. The gate exits non-zero, so push and deploy stay blocked until it is green.

Do this:
1. Read each failure below: Kane's failing step, the expected vs actual values, and Kane's diagnosis.
2. Decide whether the **app** is wrong (fix the code) or the **test** is wrong (Kane's diagnosis says the test checked the wrong place, or the requirement changed). Never weaken an assertion just to get green.
3. Make the smallest fix in the files listed, then run `npm test` and `npm run build`.
4. Run `npm run kane:gate` again and repeat until this report says PASS.

### ❌ A blocked payment says "Blocked" everywhere

- Test file: `tests/kane/demo-blocked-wording_test.md` (route `/demo`)
- Kane run (video, steps, screenshots): https://test-manager.lambdatest.com/projects/01M7TXC9HAMFHFKZW2RB009S89/test-cases/01M7V42Y8RGH4SV1G359VKGHA9/dashboard/share/US_P7CB193IJEGDZKRFM5YY8NAVGX0FNX37A7XTQO2DMU1W4TZEJYRCZDUVI8RQ1ZSI?type=summary&agentView=true&fqdn=summary-page
- Failing step: The completed check displays Refused, not the required Blocked, so checkpoint analysis would terminally fail.
- Kane's diagnosis: A proposal for disallowed recipient Mallory was rejected, but the completed check showed “Refused” rather than the required consistent status “Blocked.”

What the test requires:

> ## Block an unknown recipient and read every status
> Do not click "Play walkthrough". Set the "Recipient" field to Mallory and keep the amount at 12. Click "Check against rails". The rails must block this proposal, and the user must see one consistent word for it. Verify all of these: the notice says "Blocked: this recipient is not on the allowed list."; the status pill next to the "Referee decision" heading says exactly "Blocked" (not "Refused" or any other word); the receipt's decision line says "Blocked"; and there is no "Approve" button.

Kane's full summary:

> The check result uses the wrong decision word for a recipient who is not on the allowed list. This makes the decision status inconsistent with the required blocked notice, status pill, and receipt wording.
> Update the rejected-recipient decision state so the notice, Referee decision status pill, and receipt all say exactly “Blocked,” and keep the Approve button hidden.
> evidence: objective_contradiction: The completed check displays Refused, not the required Blocked, so checkpoint analysis would terminally fail.

Files likely involved:
- `src/app/demo/page.tsx` lines 44, 45, 46, 51, 94 (contains "Refused")
- `src/lib/policy-circuit.ts` (renders /demo)
- `src/lib/demo-config.ts` (renders /demo)
