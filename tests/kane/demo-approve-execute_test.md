---
mode: testing
tags: [smoke]
max_steps: 25
timeout: 90
url: https://preview.invalid/demo
---
# Valid demo proposal requires approval and execution

## Review, approve, then execute the mock
Keep the default recipient Alex and amount 12. Click "Check against rails" and verify the page says the proposal is waiting for explicit approval. Click "Approve" and verify the status is "Approved" while a separate "Execute mock transfer" button remains available. Click that button. Verify the status becomes "Complete", the receipt says "Executed (mock)", and the page says no funds moved and no persistent receipt was written.