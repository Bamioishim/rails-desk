---
mode: testing
tags: [smoke]
max_steps: 20
timeout: 90
url: https://preview.invalid/demo
---
# Demo allowlist blocks an unknown recipient

## Submit a recipient outside the allowlist
Set the "Recipient" field to Mallory and keep the amount at 12. Click "Check against rails". Verify the page says the recipient is not on the allowed list, the referee status is "Refused", the receipt explains that the recipient is not on the demo allowlist, and there is no "Approve" button.