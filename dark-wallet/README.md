# Dark Wallet

Dark Wallet is the ZOLana browser wallet for shielded Solana flows, local paper
wallet generation, and agent-reviewed private payment staging.

## Current Surfaces

- `Shield` - stages transparent SOL into the private balance lane.
- `Unshield` - stages shielded SOL back to a transparent recipient.
- `Private Transfer` - stages shielded-address transfers.
- `Paper Wallet` - generates a local Solana paper wallet without needing an
  injected wallet or RPC connection.

## Zcash Paper Wallet Port

The original `paper/` tree comes from a Zcash Sapling paper-wallet generator.
The browser wallet keeps the offline workflow but changes the key material for
Solana:

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

## Private Payment Primitive

The wallet includes a typed staging primitive for:

- `x402`
- `AP2`
- `M2M`

Each staged receipt records amount, lamports, recipient, rail, Solana/EVM
settlement preference, proof layer, durable receipt flag, nonce, and a local
commitment. Durable receipts are stored in browser localStorage and can be
exported as JSON proof payloads for later EVM anchoring or verifier work.

This is a wallet-side primitive for the Dark Protocol path; it is not yet final
on-chain settlement or a deployed verifier contract.

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
```

`HELIUS_RPC_URL` wins when present. Otherwise `HELIUS_API_KEY` builds a Helius
RPC URL for `devnet` or `mainnet-beta`. `SOLANA_CLUSTER` accepts `devnet` or
`mainnet-beta`.

## Development

```bash
npm install
npm run dev
npm run typecheck
npm run build
```
