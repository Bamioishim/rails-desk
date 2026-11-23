---
mode: testing
tags: [smoke, app]
max_steps: 35
timeout: 180
url: https://preview.invalid/rails
---
# A user sets rules, an agent proposes, the user approves

## Rules persist
Wait until the "Agent API key" field shows a key starting with "rd_agent_". Change "Review limit" to 6 and click "Save policy changes". Verify "Rails saved" appears. Reload the page and verify "Review limit" still shows 6.

## Agent proposal needs your OK
In the "Submit a payment proposal" form, enter "Jordan" in "Recipient", "15" in "Amount (credits)", and "Team lunch" in "Payment context". Click "Submit proposal". This form submits through the generated agent API key. Verify the result says "Transfer needs your approval" and includes the detail "6 review limit" and a receipt id starting with "rcpt_".

## Approve it on the Receipts page
Click "Open review & receipts". Verify the "Needs your OK" count is 1 and the pending transfers section contains "Jordan · 15 credits". Click its "Approve" button. Verify the pending section then says "Nothing waiting" and the "Decision history" table has a row for Jordan with "Approved by you after review."
