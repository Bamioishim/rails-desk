# OKX wallet connection for X Layer testnet

Rails Desk's X Layer settlement flow uses the official `@okxconnect/ui` SDK for an explicit, connection-only OKX App Wallet pairing step.

## Required wallet setup

- Install or update the OKX mobile app to version 6.90.1 or later.
- Sign in to the same OKX account that owns the intended test wallet, or import that wallet into the app yourself. Rails Desk never asks for a seed phrase or private key.
- Confirm the app can display the exact wallet address configured for this test: `0x1acb089eeb15dada38878fdace6b33d5de82bb16`.
- Add or enable X Layer Testnet (chain ID 1952) in the wallet if it is not already available.

The previous Google sign-in to OKX Web3 does not prove that the same wallet is available in the mobile app. QR pairing only works after the wallet is accessible there.

## Connection and settlement

1. In an approved-proposal settlement dialog, select **Connect OKX Wallet · QR / mobile app**.
2. Scan the SDK-provided QR code with OKX Wallet on the phone, or follow the mobile deep link when using a mobile browser.
3. Approve the connection in the app. This step only requests the account/session; it does not ask for a message signature and cannot send funds.
4. Rails Desk checks the returned address against the configured test wallet. A different account is rejected.
5. Enter the recipient and select **Send test OKB**. This is a separate action and opens the wallet's transaction confirmation. Only a wallet-approved X Layer testnet transaction can proceed.

The SDK is a public npm dependency and does not require a paid WalletConnect project ID. Network fees apply only if the user separately approves a testnet transaction and are paid in testnet OKB.

## Scope

- Chain ID: `1952` (X Layer Testnet) only.
- No mainnet chain is requested by the connection flow.
- No private keys, recovery phrases, or wallet secrets are read or stored by Rails Desk.
- The connect button requests no signature and sends no transaction.
- The settlement path continues to verify the mined transaction before recording settlement.
