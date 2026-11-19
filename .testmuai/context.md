# Rails Desk Kane context

Rails Desk is a control desk for agent-proposed payments. Tests must stay in Demo (mock) mode unless a test says otherwise.

Never enter a seed phrase, private key, or payment card. Never click "Connect wallet" or "X Layer testnet", and never send a transaction. Demo-mode transfers are simulated: a mock receipt is not a real payment.

The `/demo` walkthrough is isolated in page memory. It does not call the receipt API, change configured Rails, or persist receipts. The `/xlayer` page may read public TapeOut data on X Layer; that is a read-only lookup, not a payment. The Vercel preview's file-backed receipt store is not durable. Keep tests non-destructive and restore any local browser settings they change.

The demo policy (independent of `/rails` settings) is: allowed recipients Alex, Jordan and Sam, plus the TapeOut name `#1@2.254`; maximum 20; review limit 10. In Demo (mock) mode the TapeOut policy circuit label is "Approved" at or below 10, "Needs your OK" above 10 and up to 20, and "Blocked" over the cap or for an unknown recipient. After a blocked check the referee status is "Refused". After a check that needs review, the notice says it needs your OK.
