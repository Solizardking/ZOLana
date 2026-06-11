# Dark DeFi Surface

This folder describes the DeFi surface inside the combined `dark/` product.
The canonical implementation lives in `../../dark-protocol/` and
`../../darkswap/`.

## What It Combines

- Shield and unshield intent flows
- Private transfers with commitment and nullifier concepts
- Jupiter route discovery and swap execution references
- Helius RPC and transaction infrastructure
- Agent-reviewed private-payment receipts
- EVM intent proof binding for cross-chain verification

## Canonical Files

- `../../dark-protocol/sdk/typescript/src/client.ts`
- `../../dark-protocol/sdk/typescript/src/intent.ts`
- `../../dark-protocol/sdk/typescript/src/private-payment.ts`
- `../../dark-protocol/evm-verifier/src/ZolanaPrivatePaymentVerifier.sol`
- `../../darkswap/`

## Current Boundary

The DeFi flow can create and verify durable intent artifacts today. Final live
settlement depends on deployed Solana programs, configured RPC, and the selected
backend rail for x402/AP2/M2M execution.
