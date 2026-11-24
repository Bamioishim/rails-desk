# Browser wallet connection for X Layer testnet

Rails Desk uses the standard EIP-1193 provider injected by a browser wallet extension. This keeps wallet signing in the user's wallet and uses `viem`'s existing custom-provider transport; no wallet-connect SDK or new project key is required.

## Wallet setup

- Use a browser with an EVM wallet extension, such as OKX Wallet or MetaMask.
- Add or enable X Layer Testnet (chain ID `1952`) in the wallet. Rails Desk may ask the wallet to switch to or add this test network when connecting.
- Rails Desk never asks for a seed phrase or private key.

This injected connector does not provide QR-code or mobile-app pairing. A browser-injected wallet is required for this connection path.

## Connect and review

1. Select **Connect browser wallet · X Layer Testnet**. The extension shares the selected account and may ask to switch or add X Layer Testnet. Connecting does not request a signature or send a transaction.
2. Rails Desk confirms that the selected account and active network are on X Layer Testnet.
3. For settlement or receipt anchoring, review the exact sender, recipient, amount, chain, and receipt commitment in Rails Desk first. A settlement recipient must differ from the sending wallet; self-transfers are rejected because they do not settle a payment.
4. The wallet then presents its own transaction confirmation. Only approve if the details match your review; cancel if they do not. Rails Desk checks the resulting X Layer testnet transaction/receipt before recording it.

Smart-account settlements submitted through ERC-4337 require the server's `XLAYER_TESTNET_RPC_URL` to support `debug_traceTransaction` with `callTracer`. The verifier requires two L2 confirmations as an inclusion threshold; this is not a claim of irreversible protocol finality. The public default RPC may deny trace requests; in that case Rails Desk leaves the settlement unrecorded rather than inferring that the inner payment succeeded. Configure a trace-capable X Layer Testnet RPC on the server for this wallet flow.

## Safety scope

- Chain ID: `1952` (X Layer Testnet) only.
- Settlement and receipt-anchor actions remain separate and require an explicit approval in the wallet.
- Receipt anchoring is a zero-value self-transaction but still requires testnet gas.
- Contract recipients are not supported for settlement. The verifier checks that the destination has no contract code, because sending the receipt commitment as calldata to an unknown contract could invoke an unintended method.
- No private keys or recovery phrases are read or stored by Rails Desk.
- QR/mobile app pairing is not supported by this injected-provider implementation.
