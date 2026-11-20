---
mode: testing
tags: [smoke, walkthrough]
max_steps: 30
timeout: 150
url: https://preview.invalid/demo
---
# Play walkthrough runs all three outcomes by itself and narrates them

## Press play once and watch
Click "Play walkthrough" once and do not click anything else. Verify a step list appears with three steps (Alex · 8 credits, Jordan · 15 credits, Mallory · 12 credits) and a "Live log" appears showing timestamped lines from the agent and the referee. The walkthrough types each proposal into the form by itself, one after another.

## The finished walkthrough shows all three outcomes
Wait until the toolbar says "Walkthrough complete" and the main button says "Play again". Verify all three steps show a check mark with their outcome, the counters show 3 receipts and 1 blocked, and the receipts shown on the page include all three: "Alex · 8 credits" saying "Executed (mock)", "Jordan · 15 credits" saying "Executed (mock)" with a reason that mentions it needed your OK, and "Mallory · 12 credits" saying "Blocked". Verify the referee status now shows "Blocked" and the live log contains a line saying the decision for Mallory was BLOCKED.
