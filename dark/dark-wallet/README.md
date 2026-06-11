# Dark Wallet Surface

This folder describes the wallet surface inside the combined `dark/` product.
The canonical implementation lives in `../../dark-wallet/`.

## What It Combines

- Solana paper-wallet generation ported from the Zcash/Sapling paper workflow
- Browser-local entropy and printable cold-storage output
- Helius-backed devnet/mainnet-beta RPC routing
- Shield, unshield, private transfer, and private-payment intent anchoring
- xAI Dark Clawd review that receives public metadata only
- x402/AP2/M2M rail authorization export for external workers
- Direct rail-worker submission and ledger refresh when `RAIL_WORKER_URL` is set

## Canonical Files

- `../../dark-wallet/src/components/wallet/PaperWallet.tsx`
- `../../dark-wallet/src/sdk/dark-protocol.ts`
- `../../dark-wallet/src/sdk/private-payment.ts`
- `../../dark-wallet/src/sdk/rail-authorization.ts`
- `../../dark-wallet/src/sdk/rail-worker-client.ts`
- `../../dark-wallet/src/utils/dark-clawd-agent.ts`
- `../../dark-wallet/src/utils/runtime.ts`

## Port Notes

The Zcash paper-wallet model generated offline shielded key material. The
Solana port keeps that cold-storage workflow but emits Solana keypairs and
anchors privacy actions as SVM intent transactions. The private state remains
wallet-side until the Dark Protocol verifier and settlement programs finalize
the note accounting path.
