---
mode: testing
tags: [smoke]
max_steps: 20
timeout: 90
url: https://preview.invalid
---
# Landing page opens the demo

## Follow the hero call to action
Verify the Rails Desk landing page headline says "Your agent proposes. Your rails decide." Click the first hero call-to-action button labeled "Try the live demo". Verify the URL is now on `/demo` and the page heading says "See the rails in action."
