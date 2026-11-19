---
mode: testing
tags: [smoke]
max_steps: 20
timeout: 90
url: https://preview.invalid/demo
---
# User can refuse a demo proposal

## Refuse before execution
Keep the default recipient Alex and amount 12. Click "Check against rails", then click "Refuse". Verify the referee status is "Refused", the receipt reason says "Manually refused in the isolated demo.", and the page says nothing was sent. Verify no execution button is shown.