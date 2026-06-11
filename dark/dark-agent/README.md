# Dark Agent Surface

This folder describes the agentic layer inside the combined `dark/` product.
The canonical implementation is split across the wallet, SDK, and rail worker.

## What It Combines

- `XAI_API_KEY` backed Dark Clawd paper-wallet review
- Public-only wallet posture analysis
- SDK AI-agent hooks for policy and execution planning
- x402/AP2/M2M rail authorization validation
- Optional backend forwarding to a facilitator, mandate runner, or M2M
  settlement service

## Canonical Files

- `../../dark-wallet/src/utils/dark-clawd-agent.ts`
- `../../dark-protocol/sdk/typescript/src/ai-agent.ts`
- `../../dark-protocol/sdk/typescript/src/rail-authorization.ts`
- `../../dark-protocol/rail-worker/src/worker.mjs`
- `../../dark-protocol/rail-worker/src/server.mjs`

## Guardrails

The agent should not receive Solana secret-key JSON, private entropy, seed
phrases, or unredacted payment secrets. It can review public addresses, chain,
rail, expiry, amount, proof digest, and policy metadata.
