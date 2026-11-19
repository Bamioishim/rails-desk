---
mode: testing
tags: [smoke, demo]
max_steps: 30
timeout: 150
url: https://preview.invalid/demo
---
# Run all three shows Approved, Needs your OK, and Blocked

## Play every outcome back to back
Verify the page heading says "See the rails in action." Click "Run all three". First the agent's chat bubble asks to pay Alex $8; wait for the stamp, verify it says "Approved", and verify the three checks (Spending cap, Allowlist, Review limit) appeared. Next the bubble asks to pay Jordan $15; wait until the stamp says "Needs your OK" and an "Approve" button appears, then click "Approve". Next the bubble asks to pay Mallory $12; wait until the stamp says "Blocked". Verify the Receipts section now shows three receipts, each with an id starting with "RD-" and a time: "Mallory · $12" with "Blocked", "Jordan · $15" with "Approved by you", and "Alex · $8" with "Approved". Verify there is a "Now do it for real on X Layer" link.
