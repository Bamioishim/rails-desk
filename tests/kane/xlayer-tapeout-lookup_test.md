---
mode: testing
tags: [smoke]
max_steps: 25
timeout: 120
url: https://preview.invalid/xlayer
---
# X Layer page looks up a TapeOut identity

## Read live TapeOut data and look up the default name
Do not connect a wallet or send a transaction. Verify the page heading says "X Layer and TapeOut". Wait until the "TapeOut processors on X Layer" value is a number (not "…"). Verify a "Look up a TapeOut identity" section is present and the TapeOut name field is "#1@2.254". Click "Look up". Verify the page reports that #1@2.254 is circuit #1 on Policy Processor, and that the container is not opened yet so payments go to the holder.
