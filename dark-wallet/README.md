# Dark Wallet

Dark Wallet is the ZOLana browser wallet for shielded Solana flows, local paper
wallet generation, and agent-reviewed private payment staging.

## Current Surfaces

- `Shield` - anchors a shield commitment as a Solana Memo transaction and
  credits the browser-local shielded note ledger.
- `Unshield` - anchors an unshield commitment for a transparent recipient and
  debits local shielded notes.
- `Private Transfer` - anchors shielded-address transfer commitments and debits
  local shielded notes with nullifier-like records.
- `Paper Wallet` - generates a local Solana paper wallet without needing an
  injected wallet or RPC connection.

## Zcash Paper Wallet Port

The original `paper/` tree comes from a Zcash Sapling paper-wallet generator.
The last-November browser wallet port keeps the offline workflow but changes
the key material for Solana:

- Sapling spending keys are replaced with Solana `Keypair.fromSeed`.
- The printable sheet carries public key, secret key JSON, and fingerprints.
- Optional typed entropy is mixed with browser-local randomness.
- Printing uses the browser print dialog, so PDF export works without a PDF
  dependency.
- The paper-wallet tab works before wallet connect.

## Dark Clawd Agent

The paper-wallet tab can call xAI as a Dark Clawd sidecar when `XAI_API_KEY` is
configured. The agent receives public metadata and operator instructions only;
secret key JSON is not sent to the model.

The private-payment primitive also has `Plan With Dark Clawd`. This runs a
deterministic local policy plan first, then optionally asks xAI to review that
plan. The planner sees only public intent metadata and fingerprints: amount,
rail, settlement, proof layer, durable-receipt flag, Helius/RPC configuration,
EVM verifier availability, rail-worker availability, Solana anchor status, and
receipt/memo fingerprints. It never sends seed phrases, secret-key JSON, or raw
private memos.

The planner can recommend switching between `x402`, `AP2`, and `M2M`, forcing
durable receipt mode, using EVM proofing for high-value or mainnet-beta flows,
and waiting for Solana Memo verification before rail submission.

## Private Payment Primitive

The wallet includes a typed staging primitive for:

- `x402`
- `AP2`
- `M2M`

Each staged receipt records amount, lamports, recipient, rail, Solana/EVM
settlement preference, proof layer, durable receipt flag, nonce, and a local
commitment. Durable receipts are stored in browser localStorage. After a
connected wallet anchors a receipt, the same record stores Solana signature,
cluster, explorer URL, confirmation commitment, and status. The receipt history
can then verify the stored signature by fetching the Solana transaction,
decoding the Memo payload, and matching receipt ID, amount, commitment, rail,
settlement, proof layer, recipient, and payer. Receipts can also be exported as
JSON proof payloads with an EIP-712-style EVM intent proof for later anchoring
or verifier work.

The wallet can also locally verify an exported proof payload by recomputing its
digest from the receipt, Solana anchor metadata, `EVM_CHAIN_ID`, and optional
`EVM_PRIVATE_PAYMENT_VERIFIER`. This proves the payload is internally
consistent before it is handed to an EVM verifier or relayer.

Rail authorization exports for `x402`, `AP2`, and `M2M` can be checked the same
way. The wallet recomputes the expected authorization id, replay key, EVM intent
digest, Solana anchor signature, and rail-specific constraints before the file
is passed to a payment server, agent, or machine-to-machine session.

`Export Rail Auth` emits a protocol-shaped authorization envelope for the
selected rail:

- `x402` - HTTP 402-style payment-required envelope with `PAYMENT-REQUIRED`
  and `PAYMENT-SIGNATURE` header names.
- `AP2` - Dark Clawd mandate envelope with amount, recipient, expiry, nonce,
  Solana Memo verification requirement, and EVM proof requirement.
- `M2M` - machine-session envelope with payer/payee, settlement window,
  replay key, and binding digest.

The exported envelope can be posted to
`dark-protocol/rail-worker` at `/rail/authorize`. That worker validates the
wallet proof, Solana anchor binding, EVM digest binding, expiry, and replay key.
If no backend URL is configured, the worker returns `mode: "intent-only"`. If
`X402_FACILITATOR_URL`, `AP2_MANDATE_RUNNER_URL`, or `M2M_SETTLEMENT_URL` is
configured, the worker forwards the locally verified request to that live rail
backend and returns normalized settlement status.

When `RAIL_WORKER_URL` or `VITE_RAIL_WORKER_URL` is set, the paper-wallet tab can
submit an anchored receipt directly to the worker and refresh the worker ledger
status without manually exporting JSON. The wallet stores the returned rail
authorization ID and sanitized settlement status with the local receipt.

This is still an intent/proof/rail primitive for the Dark Protocol path; final
production settlement depends on the selected deployed Solana programs, EVM
verifier address, and live rail backend.

## SVM Intent Anchoring

Shield, unshield, private transfer, and private-payment receipts now produce
wallet-signed Solana transactions using the Memo program. The payload contains a
ZOLana Dark intent envelope with action, amount in lamports, commitment, and
hashed memo metadata. Private-payment anchors additionally persist the Solana
signature back into the non-ephemeral receipt, and the `Verify Anchor` action
re-reads the chain to prove the Memo intent still matches that receipt. The
connected wallet pays the normal transaction fee and the configured RPC path
(`HELIUS_RPC_URL`, `HELIUS_API_KEY`, or `SOLANA_RPC_URL`) submits it on devnet
or mainnet-beta.

## Local Shielded Note Ledger

`src/sdk/shielded-ledger.ts` stores a sanitized browser-local ledger under
`zolana.dark.shielded-ledger.v1`. Successful shield anchors create credit
entries with amount, commitment, owner, signature, and optional memo hash.
Successful unshield and private-transfer anchors create debit entries with
nullifier-like identifiers. The dashboard, unshield screen, and private-transfer
screen read this ledger instead of showing a hard-coded zero balance.

The ledger is intentionally local state for the current browser profile. It does
not replace the final on-chain note scanner or ZK nullifier set, and it does not
store paper-wallet secret material or plaintext private memos.

No SOL is transferred into a placeholder custody account by these intent
transactions. They are durable SVM anchors for the privacy workflow while the
Dark Protocol verifier, note accounting, and final settlement programs are
completed.

## Environment

The Vite app exposes these variables:

```bash
HELIUS_RPC_URL=
HELIUS_API_KEY=
SOLANA_RPC_URL=
SOLANA_CLUSTER=devnet
XAI_API_KEY=
XAI_BASE_URL=
XAI_MODEL=
EVM_CHAIN_ID=1
EVM_PRIVATE_PAYMENT_VERIFIER=
RAIL_WORKER_URL=http://127.0.0.1:4020
```

`HELIUS_RPC_URL` wins when present. Otherwise `HELIUS_API_KEY` builds a Helius
RPC URL for `devnet` or `mainnet-beta`. `SOLANA_CLUSTER` accepts `devnet` or
`mainnet-beta`. Prefix the same values with `VITE_` when Vite only exposes
client-side env through `VITE_*`.

## Development

```bash
npm install
npm run dev
npm run typecheck
npm run build
```
