# ZOLana Dark

`dark/` is the composition layer for the Solana-native ZOLana product. It keeps
the user-facing surfaces grouped together without duplicating the canonical
source trees.

## Surfaces

| Surface | Canonical implementation | Purpose |
|---------|--------------------------|---------|
| `dark-wallet/` | `../dark-wallet/` | Browser wallet, Solana paper wallet, private-payment receipts, rail exports |
| `dark-agent/` | `../dark-wallet/src/utils/dark-clawd-agent.ts`, `../dark-protocol/sdk/typescript/src/ai-agent.ts`, `../dark-protocol/rail-worker/` | xAI sidecar, policy review, x402/AP2/M2M rail handoff |
| `dark-defi/` | `../dark-protocol/`, `../darkswap/` | Shield/unshield, private transfer, Jupiter routes, DeFi intent plumbing |
| `dark-swap/` | `../darkswap/`, `../dark-protocol/sdk/typescript/` | Swap routing and private-swap SDK integration |

## Port Model

The last-November port moved the cold-storage and shielded-payment ideas from
the Zcash/Sapling paper-wallet workflow into Solana/SVM execution:

1. `paper/` remains the Zcash-style reference for offline entropy, printable
   cold storage, and recovery discipline.
2. `dark-wallet/` generates Solana keypairs locally, prints the public key and
   secret-key JSON, and never sends secret material to an agent.
3. Shield, unshield, private transfer, and private-payment actions anchor
   intent envelopes as wallet-signed Solana Memo transactions on devnet or
   mainnet-beta.
4. `dark-protocol/` carries the Sapling-inspired model forward with notes,
   commitments, nullifiers, encrypted memo concepts, EVM intent proofs, and
   Solana program surfaces.
5. `rail-worker/` validates exported x402/AP2/M2M authorizations, checks expiry
   and replay keys, then either returns `intent-only` or forwards to a configured
   live backend.

## Runtime Environment

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
RAIL_WORKER_BACKEND_TOKEN=
RAIL_WORKER_STORE_PATH=.zolana/rail-ledger.json
X402_FACILITATOR_URL=
AP2_MANDATE_RUNNER_URL=
M2M_SETTLEMENT_URL=
```

## Settlement Boundary

The current implementation is production-shaped but honest about settlement.
Solana Memo anchors, durable receipts, rail authorization exports, EVM verifier
tests, durable rail-worker replay/settlement state, and backend adapter hooks
exist. A live x402 facilitator, AP2 mandate runner, or M2M settlement backend
must be supplied through the env vars above before the system should claim final
payment settlement.
