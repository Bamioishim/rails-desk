# Rails Desk Kane context

Rails Desk is a control desk for agent-proposed payments. Keep tests non-destructive.

Never enter a seed phrase, private key, or payment card, and never send a transaction.

`/demo` is an isolated interactive walkthrough held in page memory. It does not call the receipt API, change configured rails, or persist receipts. Its policy: allowed recipients Alex, Jordan and Sam; maximum 20 credits. A proposal within the policy waits for the user to click "Approve" (or "Refuse"); after approval a separate "Execute mock transfer" step is required. A proposal over the cap or to an unknown recipient is blocked.

A blocked proposal must use the word "Blocked" everywhere the user sees its outcome: the notice, the "Referee decision" status pill and the receipt decision. "Refused" is only for a proposal the user manually refuses. Mock receipts are not real payments.
