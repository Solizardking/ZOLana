# ZOLana

**Privacy-first, agentic Solana platform for autonomous DeFi, shielded wallets, and offline cold storage**

ZOLana is the combined system: Dark Protocol, Dark Wallet, DarkSwap, paper-wallet tooling, and the broader Zcash-inspired privacy stack, all organized around Clawd agents that can monitor, route, and operate the chain with policy-driven autonomy.

It is inspired by Gorbaganan and shaped around a simple idea: private money should be fast, programmable, and usable by agents without giving up user custody.

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
| Wallets | Dark Wallet plus external wallet integrations like Backpack, Phantom, and Solflare |
| Cold Storage | Offline paper-wallet generation for air-gapped key creation and recovery |
| Autonomy | A chain operator model where agents can manage health, policy, and transaction flows under user-defined rules |

---

## Repository Atlas

| Directory | Purpose |
|-----------|---------|
| [`src/`](./src/README.md) | Zcash full-node daemon, consensus, networking, wallet, RPC, and the privacy core |
| [`dark-protocol/`](./dark-protocol/README.md) | Solana privacy programs, ZK proofs, shield/unshield flows, private swaps, and AI-agent hooks |
| [`dark-wallet/`](./dark-wallet/README.md) | Browser-based privacy wallet with shielded balances, private transfers, and swap UX |
| [`darkswap/`](./darkswap/README.md) | Jupiter routing examples and swap execution references |
| [`paper/`](./paper/README.md) | Offline paper-wallet generator and air-gapped cold-storage tooling |
| [`backpack-master/`](./backpack-master/README.md) | Backpack wallet monorepo for Solana and cross-chain wallet references |
| [`helius-sdk-main/`](./helius-sdk-main/README.md) | Helius RPC, webhooks, DAS, and transaction infrastructure |
| [`jupiter-amm-implementation-main/`](./jupiter-amm-implementation-main/README.md) | Jupiter AMM and routing primitives for swap execution |
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
- Solana paper-wallet tab adapted from the Zcash `paper/` flow
- Dark Clawd sidecar for xAI-backed public-metadata review
- x402 / AP2 / M2M private-payment primitive staging
- Modern UI for private balances, route previews, cold storage, and status

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
├──────────────────────────────┴──────────────────────────────────────┤
│  Infrastructure + Wallet Ecosystem                                  │
│  ─ helius-sdk-main/  ─ backpack-master/  ─ jupiter-amm-implementation-main/ │
└─────────────────────────────────────────────────────────────────────┘
```

### Directory Deep Dive

| Directory | Role | Notes |
|-----------|------|-------|
| `dark-protocol/` | Core privacy programs | 10+ documented instruction surfaces, private swap flows, AI hooks |
| `src/` | Zcash node and consensus | Privacy kernel, wallet, and RPC foundation |
| `dark-wallet/` | Browser privacy wallet | Vite, React, TypeScript, and modern wallet UX |
| `darkswap/` | Swap routing layer | Jupiter quote and swap integration examples |
| `paper/` | Cold storage tooling | Offline generation and printable keys |
| `backpack-master/` | Wallet reference | Solana wallet monorepo and cross-chain wallet context |
| `helius-sdk-main/` | Infra layer | RPC, webhooks, DAS, and smart transaction support |
| `jupiter-amm-implementation-main/` | AMM primitives | Reference routing and liquidity logic |

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

### November Zcash-to-Solana port

The original `paper/` project is a Zcash Sapling paper-wallet generator: it
derives Sapling spending material, emits shielded addresses, and can save a PDF
for offline storage. The ZOLana wallet ports that operating model onto Solana
without copying the Zcash key format directly.

What changed in the port:

- Sapling spending keys become Solana `Keypair.fromSeed` keys.
- The printable sheet carries Solana public key, secret key JSON, and local
  fingerprints instead of Zcash Sapling private key material.
- The wallet asks for optional typed entropy and mixes it with browser-local
  randomness before deriving the seed.
- The paper-wallet tab works without an injected browser wallet or RPC access.
- Printing uses the browser print dialog, so `Save as PDF` remains available
  without adding a heavy PDF dependency to the wallet app.

What stayed conceptually the same:

- Generate cold keys locally.
- Keep private key material offline.
- Fund the public address from an online wallet.
- Reveal or import the secret only during recovery or controlled spend.

### Dark Clawd paper-wallet sidecar

The paper-wallet tab also includes a Dark Clawd sidecar. When `XAI_API_KEY` is
present, the wallet can ask xAI to review public wallet metadata, operator
instructions, and payment posture. Secret key JSON is not sent to the agent.

### Private payment primitive

The wallet now stages a typed private-payment receipt for:

- `x402` - HTTP 402 style payment rail
- `AP2` - agent-to-agent payment flow
- `M2M` - machine-to-machine payment flow

Each staged receipt records the rail, Solana or EVM settlement preference,
durable non-ephemeral receipt intent, and Solana/EVM proof layer. This is not
presented as final on-chain settlement yet; it is the wallet-side primitive
needed to connect the private payment rail to the Dark Protocol program and
external proof infrastructure.

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

### Dark Wallet environment

The browser wallet reads these Vite-exposed values:

```bash
HELIUS_RPC_URL=           # full Helius RPC URL, highest priority
HELIUS_API_KEY=           # builds devnet/mainnet-beta Helius RPC URL
SOLANA_RPC_URL=           # generic Solana RPC fallback
SOLANA_CLUSTER=devnet     # devnet or mainnet-beta
XAI_API_KEY=              # enables the Dark Clawd paper-wallet sidecar
XAI_BASE_URL=             # optional, defaults to https://api.x.ai/v1
XAI_MODEL=                # optional xAI model override
```

Use `SOLANA_CLUSTER=mainnet-beta` for mainnet reads. Use `SOLANA_CLUSTER=devnet`
for development and paper-wallet testing.

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
