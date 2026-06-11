# Dark Swap Surface

This folder describes the swap surface inside the combined `dark/` product.
The canonical routing references live in `../../darkswap/` and the SDK-facing
privacy hooks live in `../../dark-protocol/sdk/typescript/`.

## What It Combines

- Jupiter route lookup and execution references
- Private swap intent shape
- Wallet-side proof and receipt export
- Agent policy checks before route execution
- Helius-backed Solana submission path

## Canonical Files

- `../../darkswap/`
- `../../dark-protocol/sdk/typescript/src/client.ts`
- `../../dark-protocol/sdk/typescript/src/intent.ts`
- `../../dark-wallet/src/sdk/dark-protocol.ts`

## Port Notes

The Zcash side supplied the privacy discipline: commitments, note-like records,
and shielded state transitions. The Solana side supplies high-throughput route
execution, wallet signing, Memo intent anchoring, and Jupiter liquidity access.
