# Rails Desk Kane context

Rails Desk is a control desk for agent-proposed payments. Keep tests non-destructive.

Never enter a seed phrase, private key, or payment card, and never send a transaction.

`/demo` is an isolated interactive walkthrough held in page memory. It does not call the receipt API, change configured rails, or persist receipts. Its policy: allowed recipients Alex, Jordan and Sam; maximum 20 credits; review limit 10 credits. A proposal within the policy and at or under 10 credits is approved by the rails; above 10 it needs your OK and waits for the user to click "Approve" (or "Refuse"). After approval a separate "Execute mock transfer" step is required. "Play walkthrough" plays three proposals by itself: Alex 8 (approved, executed), Jordan 15 (needs your OK, approved by the walkthrough, executed) and Mallory 12 (blocked). Each takes several seconds; the whole walkthrough takes about 35 seconds and shows a step list, counters and a "Live log". When finished the toolbar says "Walkthrough complete" and the button says "Play again". On the landing page "Try the live demo" opens /demo and "Open the app" opens the real app at /rails ("Set your rails"). The logo is an image with alt text "Rails Desk"; there is no wordmark text. A proposal over the cap or to an unknown recipient is blocked.

A blocked proposal must use the word "Blocked" everywhere the user sees its outcome: the notice, the "Referee decision" status pill and the receipt decision. "Refused" is only for a proposal the user manually refuses. Mock receipts are not real payments.
