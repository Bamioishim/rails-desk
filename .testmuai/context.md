# Rails Desk Kane context

Rails Desk is a control desk for agent-proposed payments. Tests must stay in Demo (mock) mode unless a test says otherwise.

Never enter a seed phrase, private key, or payment card. Never click "Connect wallet" or "X Layer testnet", and never send a transaction. Demo-mode transfers are simulated: a mock receipt is not a real payment.

`/demo` is a scripted showcase isolated in page memory. "Run all three" plays three agent requests back to back: $8 to Alex (Approved), $15 to Jordan (Needs your OK, waits for the user to click Approve or Refuse), and $12 to Mallory (Blocked, not on the allowlist). Chips "$8 to Alex", "$15 to Jordan" and "$12 to Mallory" play one each. Each request appears as a chat bubble typed out, then three checks appear one at a time (Spending cap, Allowlist, Review limit), then a stamp, then a receipt card with an id like RD-0001-abc123 and a time. Animations take a few seconds; wait for them.

`/xlayer` hosts the full interactive console under "Do it for real", plus read-only TapeOut lookups on X Layer. In that console's Demo (mock) mode amounts are in USD and the policy is: allowed recipients Alex, Jordan and Sam, plus the TapeOut name `#1@2.254`; maximum 20; review limit 10. The TapeOut policy circuit label is "Approved" at or below 10, "Needs your OK" above 10 and up to 20, and "Blocked" over the cap or for an unknown recipient.

A blocked payment must use the word "Blocked" everywhere the user sees its outcome. "Refused" is only for a payment the user manually refuses at review.

Keep tests non-destructive and restore any local browser settings they change.
