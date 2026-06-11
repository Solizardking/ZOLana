# ZOLana Dark

`dark/` is the composition layer for the Solana-native ZOLana product. It keeps
the user-facing surfaces grouped together without duplicating the canonical
source trees.

## Surfaces

| Surface | Canonical implementation | Purpose |
|---------|--------------------------|---------|
| `dark-wallet/` | `../dark-wallet/` | Browser wallet, Solana paper wallet, local shielded note ledger, private-payment receipts, rail exports |
| `dark-agent/` | `../dark-wallet/src/utils/dark-clawd-agent.ts`, `../dark-protocol/sdk/typescript/src/ai-agent.ts`, `../dark-protocol/rail-worker/` | xAI sidecar, deterministic rail planning, policy review, x402/AP2/M2M rail handoff |
| `dark-defi/` | `../dark-protocol/`, `../darkswap/` | Shield/unshield, private transfer, Jupiter routes, DeFi intent plumbing |
| `dark-swap/` | `../darkswap/`, `../dark-protocol/sdk/typescript/` | Swap routing and private-swap SDK integration |

## Port Model

The last-November port moved the cold-storage and shielded-payment ideas from
the Zcash/Sapling paper-wallet workflow into Solana/SVM execution:

1. `paper/` remains the Zcash-style reference for offline entropy, printable
   cold storage, and recovery discipline.
2. `dark-wallet/` generates Solana keypairs locally, prints the public key and
   secret-key JSON, and never sends secret material to an agent.
3. Dark Clawd plans private-payment rails from public metadata before the
   operator stages or submits a receipt. It can recommend x402/AP2/M2M,
   Solana/EVM settlement, EVM proof mode, durable receipts, Solana Memo
   verification, and rail-worker readiness without seeing secrets. The browser
   can run the deterministic policy locally, but the preferred xAI path is the
   rail worker `/agent/rail-plan` endpoint so `XAI_API_KEY` remains server-side.
4. Shield, unshield, private transfer, and private-payment actions anchor
   intent envelopes as wallet-signed Solana Memo transactions on devnet or
   mainnet-beta.
5. The wallet records successful shield anchors as local note credits, and
   records unshield/private-transfer anchors as local note debits with
   nullifier-like records. This is the durable browser-side bridge from the
   Sapling note model to the SVM intent rail while the full on-chain verifier
   and note scanner are finalized.
6. `dark-protocol/` carries the Sapling-inspired model forward with notes,
   commitments, nullifiers, encrypted memo concepts, EVM intent proofs, and
   Solana program surfaces.
7. `rail-worker/` validates exported x402/AP2/M2M authorizations, checks expiry
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
EVM_RPC_URL=
EVM_PRIVATE_KEY=
EVM_INTENT_PRIVATE_KEY=
EVM_INTENT_SIGNER=
EVM_INTENT_SIGNATURE=
SOLANA_VERIFIED_SLOT=
RAIL_WORKER_BACKEND_TOKEN=
RAIL_WORKER_STORE_PATH=.zolana/rail-ledger.json
RAIL_WORKER_URL=http://127.0.0.1:4020
RAIL_WORKER_CORS_ORIGIN=http://127.0.0.1:5173
RAIL_WORKER_VERIFY_SOLANA_ANCHOR=1
RAIL_WORKER_REQUIRE_SOLANA_VERIFICATION=1
RAIL_WORKER_SOLANA_COMMITMENT=confirmed
X402_FACILITATOR_URL=
AP2_MANDATE_RUNNER_URL=
M2M_SETTLEMENT_URL=
```

## Settlement Boundary

The current implementation is production-shaped but honest about settlement.
Solana Memo anchors, durable local shielded-note state, durable receipts, rail
authorization exports, direct wallet submission to the rail worker, independent
worker-side Solana Memo verification, EVM verifier tests, dry-run-first EVM proof
signing and relay scripts, durable rail-worker replay/settlement state, and
backend adapter hooks exist. A live x402
facilitator, AP2 mandate runner, or M2M settlement backend must be supplied
through the env vars above before the system should claim final payment
settlement.
