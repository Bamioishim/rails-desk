---
mode: testing
tags: [smoke]
max_steps: 25
timeout: 120
url: https://preview.invalid/xlayer
---
# Valid demo proposal needs your OK, then approval and mock execution

## Review, approve, then execute the mock
Use the "Do it for real" console on this page. Stay in "Demo (mock)" mode. Do not click Connect wallet. Keep the default recipient Alex and amount 12. Click "Check against rails" and verify the page says the proposal needs your OK (it is above the 10 USD review limit) and that no transfer has occurred. Click "Approve" and verify the referee status is "Approved" while a separate "Execute mock transfer" button remains available. Click that button. Verify the status becomes "Complete", the receipt says "Alex · 12 USD" and "Executed (mock)", and the page says no funds moved and no persistent receipt was written.
