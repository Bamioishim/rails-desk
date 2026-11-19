---
mode: testing
tags: [smoke, wording]
max_steps: 20
timeout: 90
url: https://preview.invalid/demo
---
# A blocked payment says "Blocked" everywhere

## Block an unknown recipient and read every status
Stay in "Demo (mock)" mode. Do not click Connect wallet. Set the "Recipient" field to Mallory and keep the amount at 12. Click "Check against rails". The rails must block this proposal, and the user must see one consistent word for it. Verify all of these: the TapeOut policy circuit rule says "Blocked"; the status pill next to the "Referee decision" heading says exactly "Blocked" (not "Refused" or any other word); the receipt's decision line says "Blocked"; and there is no "Approve" button.
