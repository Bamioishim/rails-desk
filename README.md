# Rails Desk

Rails Desk is a control desk for agent payments. Agents can propose transfers, but deterministic rails decide whether a proposal is approved, needs a person, or is blocked. Approval can be cancelled before the explicit execution step.

The demo has two modes:

- **Demo (mock)**: fully simulated, no wallet needed. This is the default.
- **X Layer testnet**: after you approve, you sign the transfer in your own browser wallet on X Layer testnet (chain 1952). The receipt hash is written into the transaction.

In both modes, the rails are also evaluated as a TapeOut circuit, and recipients can be TapeOut identities read from X Layer. See [X Layer and TapeOut](#x-layer-and-tapeout).

## Scope and safety

- No real funds. X Layer mode uses X Layer **testnet** only, signed in the user's own wallet. Rails Desk never holds a private key.
- TapeOut reads use X Layer mainnet `eth_call` only: no transactions, no gas.
- Spending-cap and case-insensitive recipient allowlist checks are deterministic.
- Approval, refusal, and cancellation are recorded with their reason.
- Existing browser receipts are preserved in localStorage as separate legacy history; they are not deleted or silently migrated.
- New app approvals, policy refusals, user refusals and cancellations append to the same JSON Lines file at `data/receipts.jsonl`.
- The app receipt page reads that file through the Node API route and displays the same chain checked by the CLI verifier.
- The Node route re-evaluates each proposal against the configured rails included with the request before recording an approved mock execution. This is still a local demo with no user accounts or authentication, not a production security boundary.

The file-backed log is suitable for a local Node development process with a writable project directory. It is not a production database. Vercel/serverless filesystems are ephemeral and the project directory may be read-only, so this file is not durable or reliable across invocations or instances there. Configure a persistent database or object store before deploying for real use. Anyone with filesystem access can rewrite the entire file and recompute its hashes; the chain is tamper-evident, not immutable.

## Local setup

Requires Node.js 20+ and npm.

```bash
npm ci
npm run dev
```

Open http://localhost:3000.

## Tests and checks

```bash
npm test
npm run lint
npm run build
```

## Local file receipt log

Append a mock receipt. The same deterministic default rails apply: cap 20, recipients Alex, Jordan, and Sam.

```bash
npm run receipts:append -- --amount 10 --recipient Alex --reason "local test receipt"
```

Check the full chain:

```bash
npm run receipts:verify
```

A valid chain prints `VALID · N entries`. A failed check prints `BROKEN · first broken entry: N` and exits non-zero. The verifier stops at the first malformed, altered, misnumbered, or incorrectly linked entry. It refuses to append to a broken chain.

For isolated tests, pass a separate file path:

```bash
node scripts/receipts.mjs append --amount 10 --recipient Alex --reason "isolated" --file /tmp/rails-desk-test.jsonl
node scripts/receipts.mjs verify --file /tmp/rails-desk-test.jsonl
```

The test suite uses temporary directories and does not touch `data/receipts.jsonl` or existing browser localStorage data. API route tests call the actual GET/POST handlers directly; no server is started.

## Existing browser receipts

Existing browser receipts are loaded into a separate preserved-history section and remain in the original localStorage key. New app decisions are written to the file-backed chain; the receipt page displays that file chain and its server-side verification status. The CLI verifier checks the same file. The two histories are deliberately kept separate because the app cannot safely assume it can rewrite or migrate an individual user's browser data.

## Kane browser acceptance

Kane CLI browser verification is a separate required step. Unit tests are not Kane runs. The seven approved browser flows must be executed in an authenticated Kane environment with Chrome and approved existing credits.

## X Layer and TapeOut

Built for X Layer TapeOut Accelerate. Everything below is new on the `feat/xlayer-tapeout` branch.

| What | Where | Status |
|---|---|---|
| Transfers on approval | X Layer testnet (1952), `src/lib/xlayer-wallet.ts` | Real testnet transactions from an injected wallet (OKX Wallet, MetaMask…). Pays test OKB by default, or a testnet ERC-20 if `NEXT_PUBLIC_XLAYER_TESTNET_TOKEN` is set |
| Receipts anchored on chain | calldata of each transfer | `"RDK1"` tag + SHA-256 of the receipt. `/xlayer` re-reads the tx and checks it |
| TapeOut identities | X Layer mainnet, `src/lib/tapeout.ts` | Names like `#1@2.254` resolve through the TapeOut factory (`cpuAt`), the circuit NFT (`ownerOf`) and the container opener (`accountOf`, `isOpened`). Payments go to the open container, else the holder |
| Policy circuit | `src/lib/policy-circuit.ts` | Rails compiled into a 938-gate NAND netlist in TapeOut's TAP-02 format (97 inputs, 3 outputs). Evaluated in the app on every check; confirmed with `eval` on X Layer once taped out |

TapeOut contracts on X Layer mainnet (from TapeKit `kernel/src/config.js`): factory `0x1f09DAeFA827f02CBb40967cc91b259763760761`, container opener `0x536adD8F30f03b69f6fbF29d425A816A0dC50106`, site registry `0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6`, DeWEB hub `0xe61A9C7213a6Aa616C246a2B569e555B417b25ee`.

### Try X Layer mode

1. Add X Layer testnet to your wallet (the app asks to switch automatically): chain 1952, RPC `https://testrpc.xlayer.tech/terigon`, explorer `https://web3.okx.com/explorer/x-layer-testnet`.
2. Get test OKB from the faucet: https://web3.okx.com/xlayer/faucet
3. Open `/demo`, choose **Connect wallet**, propose e.g. Alex · 12, check, approve, then **Send on X Layer testnet**. By default the named payees pay your own wallet (a self-transfer), so only gas is spent. Set `NEXT_PUBLIC_DEMO_PAYEES` to use other addresses.
4. Open `/xlayer` to see the receipt and press **Verify on chain**.

Settings are in `.env.example`. They are all public `NEXT_PUBLIC_*` values; never add a private key.

### Tape out the policy circuit (optional, mainnet)

```bash
npm run circuit -- export --out policy-circuit.json   # netlist, gate count, SHA-256
npm run circuit -- calldata                            # calldata for tapeout(bytes,uint32,uint32)
```

Taping out is a mainnet transaction, so it is done by the owner in their own wallet, never by this repo. On X Layer a processor charges `TAPEOUT_FEE` (0.0013 OKB on the processors checked) and burns one transistor token per gate (938). A read-only simulation against processor 254 on X Layer passed the netlist checks and stopped only at the transistor burn (`ERC1155InsufficientBalance … needed 938`). After taping out:

```bash
npm run circuit -- check --processor 0x... --id N      # read-only: compares bytes and runs eval
```

Then set `NEXT_PUBLIC_TAPEOUT_POLICY_PROCESSOR` and `NEXT_PUBLIC_TAPEOUT_POLICY_CIRCUIT_ID`. Every check then calls `eval` on X Layer and blocks the proposal if the chain and the app disagree.

### Not done yet

- TapeSend messages: the DeWEB hub exists on X Layer, but sending needs an opened circuit container and wallet-derived keys. A natural next step is sending each receipt to the agent's container.
- DeWEB hosting: DeWEB serves static files from a circuit container. The demo pages could be exported statically, but the receipt API route cannot run there.
- The file-backed receipt log (`data/receipts.jsonl`) is not durable on Vercel. Onchain receipts are kept in the browser, and the transaction itself is the lasting record.

