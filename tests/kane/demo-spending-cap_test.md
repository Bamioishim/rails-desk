---
mode: testing
tags: [smoke]
max_steps: 20
timeout: 90
url: https://preview.invalid/demo
---
# Demo spending cap blocks an over-limit amount

## Submit an amount over the cap
Set the "Amount · demo credits" field to 21 and keep recipient Alex. Click "Check against rails". Verify the page says the proposal exceeds the 20-credit spending cap, the referee status is "Refused", the receipt gives the cap as the reason, and there is no "Approve" button.