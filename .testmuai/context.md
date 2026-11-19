# Rails Desk Kane context

Rails Desk is a demonstration of mocked transfers, not a payment product. No real funds, wallets, or external transfers exist. Never enter real payment data or interpret a mock receipt as a real transaction.

The `/demo` walkthrough is isolated in page memory. It does not call the receipt API, change configured Rails, or persist receipts. The `/rails` page stores its settings in the current browser's localStorage. The Vercel preview's file-backed receipt store is not durable; do not create or expect persistent receipts in browser tests. Keep tests non-destructive and restore any local browser settings they change.

Verify visible user outcomes, not claims that the demo has features which are not wired up. In particular, the configured `/rails` settings do not currently feed the isolated `/demo` flow, and the demo's refusal/cancel controls do not write a receipt to the server.