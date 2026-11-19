---
mode: testing
tags: [smoke]
max_steps: 25
timeout: 120
url: https://preview.invalid/demo
---
# Policy circuit shows Approved, Needs your OK, and Blocked

## Change the amount and recipient in demo mode
Stay in "Demo (mock)" mode. Do not click Connect wallet. With the default recipient Alex and amount 12, verify the TapeOut policy circuit rule says "Needs your OK". Change the amount to 5 and verify the circuit rule says "Approved". Change the amount to 21 and verify the circuit rule says "Blocked". Set the amount back to 12, change the recipient to Mallory, and verify the circuit rule says "Blocked".
