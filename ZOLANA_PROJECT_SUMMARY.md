# ZOLana: Project Summary

## Executive Summary

ZOLana is a privacy-first blockchain ecosystem combining **Zcash's battle-tested zero-knowledge cryptography** (Sapling/Orchard zk-SNARKs) with **Solana's high-performance execution** (400ms blocks, 65K+ TPS, sub-cent fees), **Jupiter DEX aggregation**, **Helius infrastructure**, and **AI agents in Trusted Execution Environments (TEE)**.

## Project Vision

**Dark Protocol** represents the evolution of DeFi from transparent, exploitable infrastructure to privacy-first, institutional-grade financial rails. ZOLana is the platform that brings it all together.

---

## Repository Structure (Actual)

```
ZOLana/
├── dark-protocol/                  # Core privacy framework (Anchor/Rust + TS SDK)
│   ├── programs/
│   │   ├── dark-protocol/         # Main privacy protocol program
│   │   └── shielded-wallet/       # Shielded wallet program
│   ├── sdk/typescript/            # TypeScript SDK client
│   ├── client/                    # React client components
│   ├── archive/                   # Archived documentation (implementation guides)
│   ├── Anchor.toml                # Anchor configuration
│   ├── Cargo.toml                 # Rust workspace
│   └── package.json               # Node.js config
│
├── src/                            # Zcash full-node (zcashd) C++ source
├── depends/                        # Zcash cross-compilation build deps
├── build-aux/                      # GNU Autotools build support
├── contrib/                        # Zcash packaging, Docker, CI/CD
├── doc/                            # Zcash documentation & release notes
├── qa/                             # Zcash QA: RPC tests, supply-chain
├── share/                          # Zcash build scripts
├── zcutil/                         # Zcash utilities (build, fuzz, release)
├── test/                           # Test infrastructure (lint)
│
├── backpack-master/                # Backpack wallet monorepo (Coral)
├── dark-wallet/                    # Privacy wallet frontend (Vite + React + Tailwind)
├── darkswap/                       # Jupiter DEX integration examples
├── helius-sdk-main/                # Helius Solana SDK (RPC, webhooks, DAS)
├── jupiter-amm-implementation-main/ # Jupiter AMM Rust SDK
├── paper/                          # Academic research paper
│
├── Cargo.toml                      # Root Rust workspace (librustzcash)
├── Cargo.lock                      # Rust lockfile
├── configure.ac                    # Autotools config
├── Makefile.am                     # Autotools makefile
├── rust-toolchain.toml             # Rust version pinning
├── package.json                    # Root Node.js config
├── README.md                       # This file
└── ZOLANA_PROJECT_SUMMARY.md      # Detailed project overview
```

## Core Components

### 1. Zcash Full Node (`src/`)
The Zcash blockchain daemon with shielded transactions (Sapling + Orchard), RPC API, Equihash PoW consensus, and private wallet with viewing keys.

### 2. Dark Protocol (`dark-protocol/`)
Solana Anchor framework for privacy-preserving programs:
- **Programs**: `dark-protocol` (privacy protocol), `shielded-wallet` (shielded wallet)
- **SDK**: TypeScript client with privacy, swap, and AI agent modules
- **Client**: React components for shield/unshield/transfer/swap/AI actions

### 3. Dark Wallet (`dark-wallet/`)
Browser-based privacy wallet built with Vite + React + TypeScript + Tailwind.

### 4. DEX Integration (`darkswap/`)
Jupiter DEX examples: core AMM SDK, quote API (Node.js), swap API client.

### 5. Infrastructure (`helius-sdk-main/`)
Helius SDK for RPC, webhooks, DAS API, optimized transactions.

### 6. Wallet (`backpack-master/`)
Backpack wallet monorepo by Coral — cross-chain Solana wallet with xNFT support.

### 7. AMM SDK (`jupiter-amm-implementation-main/`)
Jupiter AMM Rust SDK for on-chain swap routing and integration.

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                    ZOLana Platform                      │
├────────────┬────────────┬────────────┬─────────────────┤
│  Zcash     │  Dark      │  Dark      │  Jupiter        │
│  Full Node │  Protocol  │  Wallet    │  Aggregator     │
│  (src/)    │  (Anchor)  │  (Vite)    │  (darkswap/)    │
│            │            │            │                 │
│  Privacy   │  Solana    │  Shielded  │  DEX Route      │
│  Primitives│  Programs  │  UI        │  Optimization   │
└────────────┴────────────┴────────────┴─────────────────┘
┌────────────────────────────────────────────────────────┐
│              Infrastructure Layer                       │
│  Helius SDK  │  Backpack Wallet  │  AI Agents (TEE)    │
└────────────────────────────────────────────────────────┘
```

## Key Features

### Privacy Technology
- **Zero-Knowledge Proofs** (ZK-SNARKs, Groth16): ownership, range proofs, membership
- **Encryption**: ChaCha20-Poly1305 for notes, Threshold ElGamal (planned), FHE (roadmap)
- **Transaction Privacy**: Shielded transfers, encrypted memos, unlinkable graphs

### AI Agents in TEE (Intel SGX / AMD SEV)
- Market analysis, DCA execution, portfolio rebalancing, yield optimization, risk assessment
- On-chain attestation verification, trust scoring, automatic slashing

### Jupiter Integration
- Best route aggregation, multi-hop swaps, slippage protection, private order flow
- MEV protection, hidden liquidity sources

### Helius Infrastructure
- Optimized RPC, priority fee estimation, smart compute units, enhanced APIs

## Solana Programs (Rust/Anchor)

**Location:** `dark-protocol/programs/dark-protocol/`

| Instruction | Description |
|------------|-------------|
| `initialize_protocol` | Set up protocol state |
| `create_shielded_address` | Generate privacy addresses |
| `shield_tokens` | Convert transparent → shielded |
| `unshield_tokens` | Convert shielded → transparent |
| `private_transfer` | Transfer between shielded addresses |
| `private_swap` | Private swaps via Jupiter |
| `add_to_privacy_pool` | Deposit to privacy pool |
| `remove_from_privacy_pool` | Withdraw from pool |
| `register_ai_agent` | Register TEE-secured AI agents |
| `execute_ai_action` | Execute automated actions |

**State:** ProtocolState, MerkleTree, ShieldedAddress, Note, NullifierSet, PrivacyPool, AIAgent

**Cryptographic modules:** commitment.rs, nullifier.rs, merkle.rs, zk_proof.rs, encryption.rs, sapling.rs, note_encryption.rs

## TypeScript SDK

**Location:** `dark-protocol/sdk/typescript/`

Modules: client.ts, privacy.ts, sapling.ts, note-encryption.ts, swap.ts, ai-agent.ts, wallet.ts, types.ts, utils.ts

## React Client Components

**Location:** `dark-protocol/client/src/components/`

Components: ShieldTokensButton, UnshieldTokensButton, PrivateTransferButton, PrivateSwapButton, AIAgentManager

## Wallet Integration

Supported: ✅ Backpack, ✅ Phantom, ✅ Solflare, ✅ Solana wallet adapter standard

## Getting Started

```bash
# Prerequisites
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.30.0 && avm use 0.30.0

# Build Dark Protocol programs
cd dark-protocol && anchor build

# Install and run Dark Wallet
cd dark-wallet && npm install && npm run dev

# Or install JS deps from root
npm install
```

## Roadmap

### Phase 1: Foundation (Current)
- ✅ Zcash cryptography port
- ✅ Basic Solana program + SDK scaffold
- ✅ React client components
- ✅ Jupiter + Helius integration
- ✅ AI agent framework

### Phase 2: Advanced Cryptography
- [ ] Full ZK-SNARK Groth16 implementation
- [ ] Threshold ElGamal encryption
- [ ] Privacy pool implementation
- [ ] Ephemeral account framework

### Phase 3: Production Hardening
- [ ] Security audits (Trail of Bits, Zellic, OtterSec, Neodyme)
- [ ] Formal verification
- [ ] Performance optimization
- [ ] Mainnet deployment

### Phase 4: Ecosystem Expansion
- [ ] Cross-chain bridge
- [ ] Mobile wallet
- [ ] Governance system

---

**Privacy is a right, not a privilege. Build the future with ZOLana.**

*Last Updated: June 10, 2026*