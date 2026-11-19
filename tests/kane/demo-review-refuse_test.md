---
mode: testing
tags: [smoke, demo]
max_steps: 20
timeout: 90
url: https://preview.invalid/demo
---
# Over the review limit waits for a human, who can refuse

## Refuse a payment that needs your OK
Click the "$15 to Jordan" chip. Wait until the "Review limit" check says $15 is over $10 and needs a human, and the stamp says "Needs your OK". Verify no receipt has been printed yet for Jordan while the "Approve" and "Refuse" buttons are shown. Click "Refuse". Verify a receipt for "Jordan · $15" appears saying "Refused by you", with an id starting with "RD-", and that the Approve and Refuse buttons are gone.
