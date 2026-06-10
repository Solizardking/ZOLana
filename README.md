# ZOLana

**Privacy-First Solana Ecosystem with Zcash Zero-Knowledge Technology + AI Agents**

ZOLana combines the battle-tested privacy infrastructure of Zcash (zk-SNARKs, shielded transactions) with Solana's high-speed execution and the Solana DeFi ecosystem (Jupiter, Helius) to create a complete privacy-preserving blockchain platform enhanced with AI agents in TEE environments.

---

## Project Structure

| Directory | Purpose |
|-----------|---------|
| [`src/`](./src/README.md) | Zcash full-node daemon (zcashd) — C++ consensus, networking, wallet, RPC |
| [`dark-protocol/`](./dark-protocol/README.md) | Solana Anchor programs for private transactions, ZK proofs, encrypted tokens |
| [`dark-wallet/`](./dark-wallet/README.md) | Browser-based privacy wallet (Vite + React + Tailwind) |
| [`darkswap/`](./darkswap/README.md) | Jupiter DEX integration examples (quote API, swap API, AMM core) |
| [`backpack-master/`](./backpack-master/README.md) | Backpack wallet monorepo (Coral's Solana/cross-chain wallet) |
| [`helius-sdk-main/`](./helius-sdk-main/README.md) | Helius Solana SDK (RPC, webhooks, DAS API) |
| [`jupiter-amm-implementation-main/`](./jupiter-amm-implementation-main/README.md) | Jupiter AMM Rust SDK for Solana swaps |
| [`paper/`](./paper/README.md) | Academic research paper on Dark Protocol |
| [`depends/`](./depends/README.md) | Cross-compilation dependency builder for Zcash |
| [`build-aux/`](./build-aux/README.md) | GNU Autotools build system support |
| [`contrib/`](./contrib/README.md) | Packaging, Docker, CI/CD, and deployment tooling |
| [`doc/`](./doc/README.md) | Zcash documentation, developer notes, man pages |
| [`qa/`](./qa/README.md) | Quality assurance: RPC tests, supply-chain vetting |
| [`share/`](./share/README.md) | Build scripts and shared configuration |
| [`zcutil/`](./zcutil/README.md) | Zcash utility scripts (build, fuzz, release) |
| [`test/`](./test/README.md) | Linting and test infrastructure |

---

## Components

### 1. Zcash Full Node (`src/`)
The core blockchain daemon providing:
- **Shielded transactions** with zk-SNARKs (Sapling + Orchard)
- **Private wallet** with shielded addresses and viewing keys
- **Consensus engine** with Equihash PoW
- **RPC API** for programmatic interaction

### 2. Dark Protocol (`dark-protocol/`)
Solana Anchor framework for privacy-preserving programs:
- **Encrypted tokens** with ZK-proof verification
- **Private program state** using homomorphic encryption
- **Shielded address generation**
- **Commitment schemes** (Pedersen commitments)
- **TypeScript SDK** with Helius + Jupiter integration

### 3. Dark Wallet (`dark-wallet/`)
Browser-based privacy wallet:
- Shielded address management
- Private token transfers
- Balance decryption with viewing keys
- Jupiter swap integration for private trading

### 4. DEX Integration (`darkswap/`)
Jupiter DEX aggregation for private swaps:
- Cross-DEX routing via Jupiter Quote API
- Swap execution with optimal pricing
- Integration examples in Rust and Node.js

### 5. Infrastructure (`helius-sdk-main/`)
Helius SDK providing:
- Smart transaction building
- Optimized compute units and priority fees
- Webhook management
- DAS (Digital Asset Standard) API

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   ZOLana Platform                    │
├────────────┬─────────────┬────────────┬─────────────┤
│  Zcash     │  Dark       │  Dark      │  Jupiter    │
│  Full Node │  Protocol   │  Wallet    │  Aggregator │
│  (src/)    │  (Solana)   │  (Web)     │  (darkswap) │
│            │             │            │             │
│  Privacy   │  Solana     │  Shielded  │  DEX Route  │
│  Primitives│  Programs   │  UI        │  Optimization│
└────────────┴─────────────┴────────────┴─────────────┘
┌─────────────────────────────────────────────────────┐
│              Infrastructure Layer                    │
│  Helius SDK  │  Backpack Wallet  │  AI Agents (TEE) │
└─────────────────────────────────────────────────────┘
```

---

## Getting Started

### Prerequisites
- Rust toolchain (see `rust-toolchain.toml`)
- Solana CLI + Anchor framework
- Node.js 18+ (for wallet and SDK)

### Quick Start

```bash
# Clone and explore
git clone https://github.com/Solizardking/ZOLana.git
cd ZOLana

# Zcash node build dependencies
cd depends && make && cd ..

# Dark Protocol Solana programs
cd dark-protocol
anchor build
anchor test
cd ..

# Dark Wallet
cd dark-wallet
npm install && npm run dev
```

See each component's README for detailed setup instructions.

---

## Key Technologies

| Technology | Role |
|-----------|------|
| **Zcash (Sapling + Orchard)** | Zero-knowledge proof system for shielded transactions |
| **Solana** | High-performance L1 blockchain (400ms blocks, sub-cent fees) |
| **Anchor** | Solana program framework for privacy primitives |
| **Jupiter** | DEX aggregator for optimal swap routing |
| **Helius** | RPC infrastructure and developer APIs |
| **Backpack** | Solana wallet with xNFT support |
| **AI Agents (TEE)** | Secure automated trading in Trusted Execution Environments |

---

## License

This project incorporates code from multiple open-source projects:
- Zcash: MIT OR Apache-2.0
- Dark Protocol: Apache 2.0
- Backpack: Apache 2.0
- Helius SDK: Apache 2.0
- Jupiter AMM: Apache 2.0

See individual component licenses for details.

---

## Contributing

Contributions are welcome! Please see each component's README for specific contribution guidelines.

---

*ZOLana — Privacy is a right, not a privilege.*