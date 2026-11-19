---
mode: testing
tags: [smoke, wording, demo]
max_steps: 20
timeout: 90
url: https://preview.invalid/demo
---
# A blocked payment says "Blocked" everywhere

## Block an unknown recipient and read every status
Click the "$12 to Mallory" chip. Wait for the agent's chat bubble to finish and for the outcome stamp to appear. The rails must block this payment, and the user must see one consistent word for it. Verify all of these: the "Allowlist" check is marked as failed and says "Mallory is not on your allowlist"; the stamp says exactly "Blocked" (not "Refused" or any other word); the new receipt for "Mallory · $12" says "Blocked"; the word "Refused" appears nowhere on the page; and there is no "Approve" button.
