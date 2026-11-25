# Current main-branch Kane gate report: PASS

- Generated: 2026-11-25T19:10:44.240Z by `npm run kane:gate` (Kane CLI 0.10.6)
- Workflow: [GitHub Actions run #105](https://github.com/Bamioishim/rails-desk/actions/runs/45680518665)
- Commit tested: `fc7f73f542b407faf5b83a78dacadeed37853a2c`
- Target: `http://127.0.0.1:3100` (fresh local production build)
- Result: **5/5 Kane tests passed**
- Artifact: [Download/view the workflow report artifact](https://api.github.com/repos/Bamioishim/rails-desk/actions/artifacts/15054791703)

| Test | Result | Direct Kane run |
|---|---|---|
| `tests/kane/app-agent-review_test.md` · A user sets rules, an agent proposes, the user approves | Passed | [Open in Kane](https://test-manager.lambdatest.com/projects/01M7RFY3EPQVJHTWV91XM2E24C/test-cases/01M8A16Y4MSW1G0VH5E9YMZ1V8/dashboard/share/US_S5RE4T00XFJYCAUNMUZZZCB5T4SUNFX40M84EZ3YEKI3IH0VT2VUN1RDPA3V1XDF?type=summary&agentView=true&fqdn=summary-page) |
| `tests/kane/demo-approve-execute_test.md` · Valid demo proposal waits for approval, then mock execution | Passed | [Open in Kane](https://test-manager.lambdatest.com/projects/01M7RFY3EPQVJHTWV91XM2E24C/test-cases/01M8A1EVTXDVDARYGKAR918HKH/dashboard/share/US_47GY8FDR12OH3JK4GGTTOEVB3CR25YNENFJPRQBICPXCWWSZJH6O78BJ5NN8DRU0?type=summary&agentView=true&fqdn=summary-page) |
| `tests/kane/demo-blocked-wording_test.md` · A blocked payment says "Blocked" everywhere | Passed | [Open in Kane](https://test-manager.lambdatest.com/projects/01M7RFY3EPQVJHTWV91XM2E24C/test-cases/01M8A1JJ8HDX9YHS8098AMC8PD/dashboard/share/US_3YAVMP4B6MRIB215RLK4W5N4FPJOVCN6AV3JFNWFQB17KTQTRJDSQSEMR8073DMN?type=summary&agentView=true&fqdn=summary-page) |
| `tests/kane/demo-walkthrough_test.md` · Play walkthrough runs all three outcomes by itself and narrates them | Passed | [Open in Kane](https://test-manager.lambdatest.com/projects/01M7RFY3EPQVJHTWV91XM2E24C/test-cases/01M8A1MEFJ726737ES452EYEWX/dashboard/share/US_0SZKQB8PWTILZ7Y4HQL6WU10QPR5ZBE5Y4XP6AM7QBVNGG59WB9LEXLK6FIFJMVL?type=summary&agentView=true&fqdn=summary-page) |
| `tests/kane/landing-demo-entry_test.md` · Landing page opens the demo and the app | Passed | [Open in Kane](https://test-manager.lambdatest.com/projects/01M7RFY3EPQVJHTWV91XM2E24C/test-cases/01M8A1RZBHMBNZZZS4VD78R1J0/dashboard/share/US_RW5UHURFDLQLTZX3QXQPJZG6SLX8WDQORAPQRP28221QQI639IOE9XKBPETSNIWC?type=summary&agentView=true&fqdn=summary-page) |

The workflow artifact contains the generated Markdown report and Kane dashboard links. It did not include a separate screenshot bundle. This validates the mock/demo browser scenarios only; it is not a live payment, settlement, or production authenticated end-to-end test. No funds moved.
