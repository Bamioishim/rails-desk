---
mode: testing
tags: [smoke, app]
max_steps: 30
timeout: 150
url: https://preview.invalid/rails
---
# A user sets rules, an agent proposes, the user approves

## Rules persist
Wait until the "Agent API key" field shows a key starting with "rd_agent_". Change "Review limit" to 6 and click "Save policy changes". Verify "Rails saved" appears. Reload the page and verify "Review limit" still shows 6.

## Agent proposal needs your OK
Click "Test: Jordan · 15". Verify the result message says "Needs your OK" and mentions the 6 review limit and a receipt id starting with "rcpt_".

## Approve it on the Receipts page
Click "Open receipts". In the "Needs your OK" section verify a row "Jordan · 15 credits", then click its "Approve" button. Verify the section then says "Nothing waiting" and the "Decision history" table has a row for Jordan with "Approved by you after review."
