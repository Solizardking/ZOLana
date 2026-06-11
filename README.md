# ZOLana

**Privacy-first, agentic Solana platform for autonomous DeFi, shielded wallets, and offline cold storage**

ZOLana is the combined system: Dark Protocol, Dark Wallet, DarkSwap, paper-wallet tooling, and the broader Zcash-inspired privacy stack, all organized around Clawd agents that can monitor, route, and operate the chain with policy-driven autonomy.

It is inspired by Gorbagana and shaped around a simple idea: private money should be fast, programmable, and usable by agents without giving up user custody.

SOLtoshi is the outward-facing operator persona. ZOLtoshi is the privacy-first chain persona. Same system, different face.

---

## Executive Summary

> ZOLana combines Zcash-style zero-knowledge privacy, Solana-speed execution, Jupiter routing, Helius infrastructure, offline paper-wallet generation, and AI agents in trusted execution environments into one unified privacy-first blockchain platform.

| What | How |
|------|-----|
| Privacy | Zcash Sapling and Orchard-inspired shielded flows, encrypted memos, notes, commitments, and nullifiers |
| Speed | Solana execution with fast confirmation targets, low fees, and high-throughput routing |
| Swaps | Jupiter aggregation for best-route private swaps and liquidity discovery |
| Infrastructure | Helius RPC, webhooks, and data APIs for transaction and asset operations |
| AI Agents | TEE-secured Clawd agents for policy, automation, monitoring, and routing |
| Wallets | Dark Wallet plus external wallet integrations like Backpack and Phantom |
| Cold Storage | Offline paper-wallet generation for air-gapped key creation and recovery |
| Autonomy | A chain operator model where agents can manage health, policy, and transaction flows under user-defined rules |

---

## Current Dark Wallet Port

The active wallet work ports the Zcash paper-wallet model into the Solana
runtime while keeping the original cold-storage discipline.

What is now wired:

1. `dark-wallet/src/components/wallet/PaperWallet.tsx` adds a Solana paper
   wallet tab with local entropy, keypair generation, printable sheet output,
   and JSON export.
2. `dark-wallet/src/utils/runtime.ts` resolves SVM devnet/mainnet-beta RPC from
   `HELIUS_RPC_URL`, `HELIUS_API_KEY`, `SOLANA_RPC_URL`, and `SOLANA_CLUSTER`.
3. `dark-wallet/src/utils/dark-clawd-agent.ts` adds the `XAI_API_KEY` backed
   Dark Clawd sidecar for reviewing public cold-storage metadata and payment
   posture. It also provides deterministic-plus-xAI private-payment rail
   planning that can recommend x402/AP2/M2M, Solana/EVM settlement, EVM proof
   mode, and durable-receipt requirements from public intent metadata only.
   When `RAIL_WORKER_URL` is configured, `/agent/rail-plan` performs the xAI
   review server-side so `XAI_API_KEY` does not need to ship to the browser.
4. `dark-wallet/src/sdk/private-payment.ts` adds durable private payment
   staging for `x402`, `AP2`, and `M2M`, with explicit Solana/EVM settlement,
   lamport-denominated receipts, local commitments, Solana anchor metadata, and
   exportable EIP-712-style EVM intent proof payloads.
5. `dark-wallet/src/sdk/shielded-ledger.ts` adds a durable browser-local
   shielded note ledger. Shield anchors credit note commitments; unshield and
   private-transfer anchors debit those commitments with nullifier-like local
   records so the UX no longer depends on hard-coded mock shielded balances.
6. `dark-wallet/src/sdk/rail-authorization.ts` adds x402/AP2/M2M authorization
   envelopes with expiry, replay key, Solana anchor binding, verified slot, and
   EVM digest binding for agent/facilitator handoff.
7. `dark-protocol/rail-worker/` validates those exported envelopes, enforces
   replay and expiry locally, and can now forward validated requests to
   configured x402, AP2, or M2M settlement backends.

How the last-November Zcash-to-Solana port works:

1. The original `paper/` generator remains the Zcash/Sapling reference for
   offline entropy, printable cold storage, and air-gapped key handling.
2. Dark Wallet keeps that workflow but outputs Solana keypairs for SVM use.
3. Shielding and private transfers stay exposed in the wallet as staged
   privacy operations and now anchor wallet-signed Solana Memo intent
   transactions while Dark Protocol program IDs and live proof plumbing are
   finalized.
4. Helius supplies practical RPC access for devnet and mainnet-beta, while the
   paper-wallet generation path remains fully local and does not require RPC.
5. Shield/unshield/private-transfer now maintain a browser-local shielded note
   ledger after the Solana Memo anchor succeeds. This gives the port a durable
   note/balance surface while the full on-chain note scanner, nullifier set, and
   ZK verifier program are still being finalized.
6. Private-payment receipts are currently wallet-side durable records. They can
   be anchored as Solana Memo intent transactions, then store the resulting
   signature, cluster, explorer URL, and status on the same receipt. The wallet
   can re-fetch that transaction and verify the Memo payload still matches the
   receipt fields before exporting EVM proof intent. The wallet also recomputes
   and checks the EVM intent proof digest against the receipt, configured EVM
   chain, and optional verifier address. It can also export a rail
   authorization envelope for x402/AP2/M2M workers. The EVM proof export is an
   intent payload for later verifier or contract anchoring, not yet final
   privacy settlement.
7. The new `dark/` folder is the combined product map. It groups the Solana
   wallet, agent, DeFi, and swap surfaces while pointing back to the canonical
   implementation folders so code does not fork into stale duplicates.
8. The rail worker can now keep a sanitized durable ledger with
   `RAIL_WORKER_STORE_PATH`, so replay protection and settlement status survive
   process restarts without storing full proof payloads, recipients, or amounts.
9. Dark Wallet can submit an anchored receipt directly to the rail worker when
   `RAIL_WORKER_URL` or `VITE_RAIL_WORKER_URL` is configured, then refresh the
   worker ledger status from the paper-wallet receipt row. It now persists and
   renders the worker's sanitized `evmVerifierPlan` with EVM verifier readiness,
   plan digest, verified Solana slot, and sign/submit commands so the operator
   can continue from browser receipt to EVM intent proof without exposing
   recipient, amount, private keys, signatures, or full proof payloads.
10. The rail worker can independently verify the Solana Memo anchor through
    Helius or another Solana RPC before consuming replay keys or forwarding to a
    settlement backend.
11. After validation and Solana Memo verification, the rail worker now returns a
    sanitized `evmVerifierPlan` with verifier address, digest, verified slot,
    proof-file placeholder, and sign/submit command lines. Durable rail-worker
    ledgers store only readiness fields and plan digest, not full proof payloads,
    recipients, or amounts.
12. The EVM verifier now has a relay CLI that converts wallet proof payloads
    into `cast send recordIntentProof(...)` calls, keeping broadcast dry-run by
    default and requiring an explicit EVM signer signature.
13. The verifier package also has a signer CLI that derives the verifier digest
    with `cast call hashIntent(...)` and signs it with a separate
    `EVM_INTENT_PRIVATE_KEY`, keeping the paper wallet free of EVM keys.
14. The rail worker exposes `GET /rail/preflight` and optional
    `/rail/preflight?probe=1` so operators can verify Helius/Solana RPC,
    server-side xAI availability, EVM verifier configuration, durable replay
    ledger mode, and x402/AP2/M2M backend readiness without sending receipts,
    amounts, recipients, proof payloads, API keys, or backend bearer tokens.

Program re-exploration and port mapping:

| Zcash/Sapling reference | Solana/ZOLana port | Current implementation |
|-------------------------|--------------------|------------------------|
| Offline paper wallet entropy and printable recovery | Solana keypair paper wallet with browser-local entropy | `paper/`, `dark-wallet/src/components/wallet/PaperWallet.tsx` |
| Sapling notes and commitments | Durable wallet receipts, local note ledger, note-like commitments, nullifier-ready intent data | `dark-wallet/src/sdk/private-payment.ts`, `dark-wallet/src/sdk/shielded-ledger.ts`, `dark-protocol/sdk/typescript/src/intent.ts` |
| Shielded transaction metadata discipline | Wallet-signed Solana Memo intent anchors on devnet/mainnet-beta | `dark-wallet/src/sdk/dark-protocol.ts` |
| Viewing/spending separation | Public-only agent review plus local secret-key custody | `dark-wallet/src/utils/dark-clawd-agent.ts` |
| Cross-domain proof handoff | EIP-712-style EVM intent proof and consume-once verifier | `dark-protocol/evm-verifier/` |
| Payment facilitator handoff | x402/AP2/M2M rail authorization worker with optional backend forwarding | `dark-protocol/rail-worker/` |

Relevant env:

Keep real values in a local untracked env file only. Do not commit live keys,
RPC tokens, or private-key material.

```bash
HELIUS_RPC_URL=
HELIUS_API_KEY=
SOLANA_RPC_URL=
SOLANA_CLUSTER=devnet        # or mainnet-beta
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

---

## Repository Atlas

| Directory | Purpose |
|-----------|---------|
| [`dark/`](./dark/README.md) | Combined product map for Dark Wallet, Dark Agent, Dark DeFi, and Dark Swap surfaces |
| [`src/`](./src/README.md) | Zcash full-node daemon, consensus, networking, wallet, RPC, and the privacy core |
| [`dark-protocol/`](./dark-protocol/README.md) | Solana privacy programs, ZK proofs, shield/unshield flows, private swaps, and AI-agent hooks |
| [`dark-protocol/rail-worker/`](./dark-protocol/rail-worker/README.md) | Executable intent-mode x402/AP2/M2M rail authorization worker |
| [`dark-protocol/evm-verifier/`](./dark-protocol/evm-verifier/README.md) | EVM consume-once verifier for private-payment intent proofs |
| [`dark-wallet/`](./dark-wallet/README.md) | Browser-based privacy wallet with shielded balances, private transfers, and swap UX |
| [`darkswap/`](./darkswap/README.md) | Jupiter routing reference examples; not part of the supported public release surface |
| [`paper/`](./paper/README.md) | Offline paper-wallet generator and air-gapped cold-storage tooling |
| [`backpack-master/`](./backpack-master/README.md) | Vendored Backpack wallet reference monorepo; not part of the supported public release surface |
| [`helius-sdk-main/`](./helius-sdk-main/README.md) | Helius RPC, webhooks, DAS, and transaction infrastructure |
| [`jupiter-amm-implementation-main/`](./jupiter-amm-implementation-main/README.md) | Vendored Jupiter AMM reference code; not part of the supported public release surface |
| [`depends/`](./depends/README.md) | Cross-compilation dependency builder and build support |
| [`build-aux/`](./build-aux/README.md) | GNU Autotools support files and build system glue |
| [`contrib/`](./contrib/README.md) | Packaging, Docker, CI/CD, and deployment tooling |
| [`doc/`](./doc/README.md) | Documentation, release notes, and developer guidance |
| [`qa/`](./qa/README.md) | Quality assurance, RPC tests, and validation tooling |
| [`share/`](./share/README.md) | Shared build scripts and configuration helpers |
| [`zcutil/`](./zcutil/README.md) | Utilities for build, fuzz, and release workflows |
| [`test/`](./test/README.md) | Linting and test infrastructure |

---

## Core Components

### 1. Zcash Full Node (`src/`)

The base chain engine and privacy kernel.

- Shielded transactions with zk-SNARK-based privacy primitives
- Private wallet support with spending and viewing key separation
- Consensus, networking, and RPC plumbing
- The long-lived node layer that everything else hangs off

### 2. Dark Protocol (`dark-protocol/`)

The Solana privacy layer and transaction intelligence layer.

- Shielded addresses, notes, commitments, and nullifiers
- Private transfers, unshielding, and swap routing
- Encrypted memos and privacy-preserving metadata
- AI-agent hooks for TEE-secured automation
- Helius and Jupiter integrations for practical execution

### 3. Dark Wallet (`dark-wallet/`)

The browser wallet and user-facing privacy cockpit.

- Shield tokens into private balance
- Unshield tokens back to transparent balance
- Private transfer between shielded addresses
- Wallet connect flows for external wallets
- Modern UI for private balances, route previews, and status

### 4. DarkSwap (`darkswap/`)

The liquidity and routing layer.

- Jupiter quote and swap examples
- Route discovery across Solana liquidity sources
- Reference implementations for swap execution
- A practical place to plug private routing into the wallet and protocol layers

### 5. Paper Wallet / Cold Storage (`paper/`)

The offline key generation and air-gapped recovery surface.

- Paper wallet generation for shielded addresses
- PDF output for printable cold storage
- Air-gapped operation for high-value key creation
- Recovery and vanity address workflows

### 6. Infrastructure (`helius-sdk-main/`)

The network and delivery layer.

- RPC endpoints and smart transaction support
- Webhooks and asset data APIs
- Priority fee and compute optimization
- A safer way to connect the wallet and protocol to live chain data

### 7. Clawd Agent Control Plane

The operational layer that lets agents run the system with policy.

- Chain health monitoring
- Swap routing recommendations
- Treasury and balance policy
- Security checks and redaction
- Validator and service coordination
- Autonomous operation with explicit guardrails

---

## Repository Map

```ascii
┌─────────────────────────────────────────────────────────────────────┐
│                              ZOLana                                 │
├──────────────────────────────┬──────────────────────────────────────┤
│  Privacy Kernel              │  Agentic Solana Layer                │
│  ─ src/                      │  ─ dark-protocol/                    │
│  ─ depends/                  │  ─ dark-wallet/                      │
│  ─ build-aux/                │  ─ darkswap/                         │
│  ─ zcutil/                   │  ─ paper/                            │
│                              │  ─ dark/                             │
├──────────────────────────────┴──────────────────────────────────────┤
│  Infrastructure + Wallet Ecosystem                                  │
│  ─ helius-sdk-main/  ─ backpack-master/  ─ jupiter-amm-implementation-main/ │
└─────────────────────────────────────────────────────────────────────┘
```

### Directory Deep Dive

| Directory | Role | Notes |
|-----------|------|-------|
| `dark/` | Combined product map | Groups wallet, agent, DeFi, and swap surfaces without duplicating source |
| `dark-protocol/` | Core privacy programs | 10+ documented instruction surfaces, private swap flows, AI hooks |
| `src/` | Zcash node and consensus | Privacy kernel, wallet, and RPC foundation |
| `dark-wallet/` | Browser privacy wallet | Vite, React, TypeScript, and modern wallet UX |
| `darkswap/` | Swap routing layer | Jupiter quote and swap integration reference examples |
| `paper/` | Cold storage tooling | Offline generation and printable keys |
| `backpack-master/` | Wallet reference | Vendored wallet monorepo for implementation reference only |
| `helius-sdk-main/` | Infra layer | RPC, webhooks, DAS, and smart transaction support |
| `jupiter-amm-implementation-main/` | AMM primitives | Vendored routing and liquidity reference logic |

---

## How It Fits Together

1. Create cold keys offline with `paper/` if you want air-gapped recovery.
2. Load the wallet in `dark-wallet/` and connect an external wallet when needed.
3. Shield funds into the privacy pool via `dark-protocol/`.
4. Use `darkswap/` and Jupiter routing to discover the best path.
5. Let Clawd agents watch policy, risk, and chain health.
6. Unshield or privately transfer only when the policy and user intent allow it.

This is not just a set of directories. It is an operating model:

- private by default
- transparent when the user asks for it
- agentic when the policy allows it
- offline when custody matters
- auditable at every boundary

---

## Dark Protocol Surface

The protocol layer is the cryptographic and execution core of the platform.

### Documented instruction surface

| # | Instruction | Purpose |
|---|------------|---------|
| 1 | `initialize_protocol` | Set up protocol state and tree structure |
| 2 | `create_shielded_address` | Derive a shielded address for private activity |
| 3 | `shield_tokens` | Move transparent assets into the private pool |
| 4 | `unshield_tokens` | Release shielded assets back to transparent balance |
| 5 | `private_transfer` | Move value between shielded recipients |
| 6 | `private_swap` | Route swaps through private liquidity paths |
| 7 | `add_to_privacy_pool` | Deposit into privacy pool capacity |
| 8 | `remove_from_privacy_pool` | Withdraw from the privacy pool |
| 9 | `register_ai_agent` | Register a TEE-secured automation agent |
| 10 | `execute_ai_action` | Execute an allowed agent action |

### Cryptographic modules

- Pedersen commitments
- Merkle trees and commitment proofs
- Nullifier-based double-spend prevention
- Note encryption and encrypted memos
- Sapling-style address and key derivation
- Groth16-style proving system integration
- Jupiter routing integration for swap flows

---

## Dark Wallet Surface

The wallet is the part users actually touch, but it is also the policy mirror of the protocol.

- Transparent balance and shielded balance views
- Shield, unshield, and private transfer flows
- Swap preview and route selection
- Wallet adapter support for external wallets
- Private memo support
- Real-time status and ledger history
- A clean visual layer that keeps the privacy system understandable

The wallet should make privacy feel operational, not ceremonial.

---

## DarkSwap Surface

DarkSwap is the route and liquidity intelligence layer.

- Jupiter quote discovery
- Best-route selection across Solana liquidity
- Slippage-aware execution
- Swap examples for Node, Rust, and wallet integration
- Private routing patterns for the protocol layer

This is where liquidity becomes policy.

---

## Paper Wallet / Cold Storage

The `paper/` tree is the offline custody lane.

- Generate keys without a live browser wallet
- Print or export as PDF for physical storage
- Keep high-value keys air-gapped
- Use it as the fail-safe if hot wallets or agents are unavailable

For a privacy-first system, cold storage is not optional. It is the backstop.

---

## Clawd Agent Control Plane

Clawd agents are the automation layer that lets ZOLana behave like an operating system instead of a static app.

### Agent roles

- `guardian` - checks risk before value moves
- `router` - evaluates swap paths and liquidity health
- `treasurer` - watches reserves and policy thresholds
- `sentinel` - tracks chain health and service uptime
- `operator` - coordinates routine blockchain tasks
- `recovery` - handles fallback and cold-storage workflows

### Operating rules

- Never hide risk, fees, or routing details
- Ask before moving value unless the policy explicitly allows it
- Prefer privacy by default
- Fail closed when inputs are malformed or the route is uncertain
- Keep offline recovery paths available
- Make automation visible, not magical

### Personas

- SOLtoshi: chain operator, routing, and execution persona
- ZOLtoshi: privacy guardian, recovery, and shielded-asset persona

---

## Architecture

```ascii
┌─────────────────────────────────────────────────────────────────────┐
│                         Clawd Agent Layer                           │
│  Policy • Monitoring • Routing • Recovery • Treasury • Automation  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────────┐
│                        ZOLana Application Layer                    │
│     dark-wallet  •  dark-protocol  •  darkswap  •  paper          │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────────┐
│                   Privacy + Execution Foundation                    │
│   Zcash-style notes • commitments • nullifiers • Solana speed       │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────────┐
│                        Solana and Infra Layer                       │
│  Helius RPC • Jupiter routing • wallets • validators • APIs         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Performance and Target Specs

These are the platform targets and reference values used across the docs.

| Metric | Value |
|--------|-------|
| Private transaction throughput | ~1,500 TPS target |
| AI agent response time | <1 second target |
| Private swap latency | ~800 ms target |
| Shielded balance representation | compact note-based state |
| ZK proof size | compact Groth16-style proofs |
| Note payload size | Sapling-style note payloads |
| Transaction fee | sub-cent / low-fee target |
| Confirmation speed | Solana-speed execution profile |

---

## Roadmap

```ascii
PHASE 1: FOUNDATION
├── Zcash-style privacy kernel
├── Dark Wallet UI
├── Dark Protocol program surface
├── Jupiter routing integration
├── Offline paper-wallet tooling
└── Clawd agent policy layer

PHASE 2: ADVANCED PRIVACY
├── Stronger proof workflows
├── Privacy pools
├── Better nullifier handling
├── Stronger memo encryption
└── Deeper auditability

PHASE 3: AUTONOMOUS OPERATIONS
├── Chain health sentinels
├── Treasury policy agents
├── Route-aware swap operators
├── Recovery workflows
└── Validator and service orchestration

PHASE 4: EXPANSION
├── Cross-chain bridges
├── Mobile wallet surfaces
├── Hardware wallet support
├── Governance and policy tooling
└── Broader private DeFi suite
```

---

## Building the Beast

### Prerequisites

- Rust toolchain
- Solana CLI
- Anchor
- Node.js 18+
- A wallet for browser-based testing

### Quick start

```bash
# Clone the repo
git clone https://github.com/Solizardking/ZOLana.git
cd ZOLana

# Build the core node/tooling
make -j$(nproc) || true

# Build the Dark Protocol layer
cd dark-protocol
anchor build
cd ..

# Run the Dark Wallet
cd dark-wallet
npm install
npm run dev

# Explore swap integrations
cd ../darkswap
# See the component README files for the exact subproject commands

# Build the paper-wallet tooling
cd ../paper/cli
cargo build --release
```

### Development mode

```bash
# Core checks and builds
make check || true

# Protocol
cd dark-protocol && anchor test

# Wallet
cd dark-wallet && npm run build

# Paper wallet
cd paper/cli && cargo test
```

---

## Safety and Operating Principles

- Privacy is the default, not a premium feature
- Recovery must work offline
- Agent autonomy is bounded by policy
- Swaps should show route and risk before execution
- Cold storage stays cold
- Public visibility is opt-in
- The system should fail safely when in doubt

---

## Component Docs

See the component READMEs for implementation-specific details:

- [`dark-protocol/README.md`](./dark-protocol/README.md)
- [`dark-wallet/README.md`](./dark-wallet/README.md)
- [`darkswap/README.md`](./darkswap/README.md)
- [`paper/README.md`](./paper/README.md)
- [`ZOLANA_PROJECT_SUMMARY.md`](./ZOLANA_PROJECT_SUMMARY.md)

---

## License

This repository combines multiple upstream open-source projects and their respective licenses. See the individual component licenses and source trees for details.

---

ZOLana is the privacy-first, agentic Solana stack.
SOLtoshi runs it. ZOLtoshi protects it.
