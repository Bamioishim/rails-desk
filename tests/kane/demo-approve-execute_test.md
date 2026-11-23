---
mode: testing
tags: [smoke]
max_steps: 25
timeout: 120
url: https://preview.invalid/demo
---
# Valid demo proposal waits for approval, then mock execution

## Review, approve, then execute the mock
Do not click "Play walkthrough". Keep the default recipient Alex and amount 12. Click "Check against rails" and verify the page says the proposal is waiting for your explicit approval and that no transfer has occurred. Click "Approve" and verify the referee status is "Approved" while a separate "Execute mock transfer" button remains available. Click that button. Verify the status becomes "Complete", the local demo result says "Alex · 12 credits" and "Executed (mock)", and the page says no funds moved and no persistent receipt was written. Verify the local result is explicitly labelled "Not saved to the shared receipt chain" and does not offer a "Check this receipt in Receipts" link.
