# Dark Protocol

**Privacy-First Solana Wallet with AI Agents, Jupiter Swaps, and Helius Integration**

Dark Protocol is a comprehensive privacy framework for Solana that brings Zcash-style privacy to the Solana ecosystem, enabling truly private transactions, swaps, and AI-powered DeFi operations.

## Features

### 🔒 Complete Privacy
- **Shielded Transactions**: Hide sender, receiver, and amount
- **Zero-Knowledge Proofs**: Verify transactions without revealing data
- **Merkle Tree Commitments**: Zcash-style privacy architecture
- **Encrypted Memos**: Private communication on-chain

### 🤖 AI Agents in TEE
- **Trusted Execution Environment**: Secure AI agent execution
- **Intel SGX/AMD SEV Support**: Hardware-level security
- **Automated Trading**: AI-powered swap recommendations
- **Portfolio Analysis**: Private portfolio optimization

### 🔄 Privacy-Preserving Swaps (Jupiter V6)
- **Jupiter Integration**: Best routes across all Solana DEXs
- **Private Swaps**: Hide transaction amounts with ZK proofs
- **Groth16 ZK-SNARKs**: 256-byte proofs for maximum privacy
- **Optimal Rates**: Real-time price discovery via Jupiter API
- **Low Slippage**: Smart routing with slippage protection
- **Perpetuals Trading**: Private leveraged positions via JLP pool
- **5 Custody Tokens**: SOL, ETH, BTC, USDC, USDT

### ⚡ Helius Infrastructure
- **Smart Transactions**: Optimized compute units and priority fees
- **Fast Confirmations**: Ultra-low latency RPC
- **Reliable Broadcasting**: Multiple regions for redundancy
- **Enhanced APIs**: Rich transaction data

### EVM Intent Proof Verifier
- **Consume-once proofs**: `evm-verifier` records EIP-712 private-payment
  proof digests once to reduce replay risk.
- **Solana-bound receipts**: Proofs bind x402/AP2/M2M rail metadata to a
  verified Solana Memo signature and cluster.
- **Foundry tests**: Run `forge test` from `dark-protocol/evm-verifier`.

### Rail Worker
- **Executable handoff**: `rail-worker` validates exported x402/AP2/M2M rail
  authorization envelopes.
- **Replay and expiry checks**: The worker consumes replay keys once per
  process and rejects expired envelopes.
- **Backend adapter hooks**: The worker returns `mode: "intent-only"` when no
  backend URL is configured, or forwards locally verified requests to a live
  x402 facilitator, AP2 mandate runner, or M2M settlement backend.
- **Durable rail ledger**: Set `RAIL_WORKER_STORE_PATH` to persist replay locks
  and sanitized settlement status across restarts.
- **Solana RPC anchor verification**: Set `RAIL_WORKER_VERIFY_SOLANA_ANCHOR`
  and `RAIL_WORKER_REQUIRE_SOLANA_VERIFICATION` to force Helius/Solana RPC Memo
  checks before replay consumption or backend settlement.
- **Node tests**: Run `npm test` from `dark-protocol/rail-worker`.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser Extension Wallet                  │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐  │
│  │   Wallet   │  │  AI Agent  │  │   Privacy Manager    │  │
│  │  Manager   │  │  Controls  │  │  (ZK Proofs, Notes)  │  │
│  └────────────┘  └────────────┘  └──────────────────────┘  │
└───────────────────────┬─────────────────────────────────────┘
                        │
          ┌─────────────┴──────────────┐
          │     Dark Protocol SDK       │
          │  ┌──────────────────────┐  │
          │  │  Client │ Wallet     │  │
          │  │  Swap   │ AI Agent   │  │
          │  │  Privacy│ Utils      │  │
          │  └──────────────────────┘  │
          └─────────────┬──────────────┘
                        │
        ┌───────────────┴────────────────┐
        │                                 │
   ┌────▼─────┐                    ┌─────▼──────┐
   │  Helius  │                    │  Jupiter   │
   │   SDK    │                    │    API     │
   └────┬─────┘                    └─────┬──────┘
        │                                 │
        └─────────────┬───────────────────┘
                      │
            ┌─────────▼──────────┐
            │  Solana Blockchain  │
            │  ┌──────────────┐  │
            │  │Dark Protocol │  │
            │  │   Program    │  │
            │  └──────────────┘  │
            └────────────────────┘
```

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/dark-protocol/dark-protocol
cd dark-protocol

# Install Rust dependencies
cargo build --release

# Install TypeScript SDK dependencies
cd sdk/typescript
npm install

# Build SDK
npm run build
```

### Environment Setup

Create a `.env` file:

```bash
HELIUS_API_KEY=your_helius_api_key
JUPITER_API_KEY=your_jupiter_api_key  # Optional
REDPILL_API_KEY=your_redpill_api_key  # Optional, for AI agents
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=your_api_key
RAIL_WORKER_BACKEND_TOKEN=optional_shared_secret
RAIL_WORKER_STORE_PATH=.zolana/rail-ledger.json
RAIL_WORKER_VERIFY_SOLANA_ANCHOR=1
RAIL_WORKER_REQUIRE_SOLANA_VERIFICATION=1
X402_FACILITATOR_URL=https://facilitator.example/authorize
AP2_MANDATE_RUNNER_URL=https://ap2.example/mandates/run
M2M_SETTLEMENT_URL=https://m2m.example/sessions/settle
```

### Basic Usage

```typescript
import { DarkProtocolClient, DarkWallet } from '@dark-protocol/sdk';

// Initialize client
const client = await DarkProtocolClient.create({
  heliusApiKey: process.env.HELIUS_API_KEY!,
  jupiterApiKey: process.env.JUPITER_API_KEY,
  redpillApiKey: process.env.REDPILL_API_KEY,
});

// Create or restore wallet
const { wallet, mnemonic } = await DarkWallet.generate(client);
console.log('Mnemonic:', mnemonic);

// Initialize shielded address
const viewingKey = PrivacyUtils.generateViewingKey();
const spendingKey = crypto.getRandomValues(new Uint8Array(32));
const spendingKeyCommitment = await PrivacyUtils.hash(spendingKey);

await wallet.initializeShieldedAddress(viewingKey, spendingKeyCommitment);

// Shield tokens (move to private balance)
const amount = BigInt(1_000_000_000); // 1 SOL
const tokenMint = new PublicKey('So11111111111111111111111111111111111111112');
await wallet.shieldTokens(amount, tokenMint);

// Private transfer
await wallet.privateTransfer(
  recipientAddress,
  BigInt(500_000_000), // 0.5 SOL
  'Hello from Dark Protocol!'
);
```

### Private Swaps

```typescript
import { PrivateSwapManager } from '@dark-protocol/sdk';

const swapManager = new PrivateSwapManager(client, process.env.JUPITER_API_KEY);

// Execute private swap
const signature = await swapManager.executePrivateSwap({
  inputMint: USDC_MINT,
  outputMint: SOL_MINT,
  inputAmount: BigInt(100_000_000), // 100 USDC
  minOutputAmount: BigInt(1_000_000_000), // 1 SOL minimum
  slippageBps: 50, // 0.5% slippage
  userPublicKey: wallet.publicKey,
});
```

### AI Agents

```typescript
import { AIAgentManager } from '@dark-protocol/sdk';

const aiManager = new AIAgentManager(client, process.env.REDPILL_API_KEY);

// Register AI agent
const agent = await aiManager.registerAgent({
  agentPubkey: agentKeypair.publicKey,
  teeAttestation: {
    measurement: attestationMeasurement,
    timestamp: Date.now(),
    signature: attestationSignature,
  },
  capabilities: [
    { type: 'swap', enabled: true, maxAmount: BigInt(10_000_000_000), requiresApproval: false },
    { type: 'analyze', enabled: true, requiresApproval: false },
  ],
  owner: wallet.publicKey,
});

// Get AI recommendations
const recommendations = await aiManager.getSwapRecommendations({
  agentPubkey: agentKeypair.publicKey,
  portfolioData: await wallet.getState(),
});
```

## Privacy Model

### Shielded Pool

Dark Protocol uses a shielded pool similar to Zcash's Sapling protocol:

1. **Shield**: Move tokens from transparent to shielded pool
2. **Private Transfer**: Transfer within shielded pool
3. **Unshield**: Move tokens from shielded to transparent pool

### Zero-Knowledge Proofs

Transactions are verified using ZK-SNARKs without revealing:
- Sender address
- Receiver address
- Transaction amount
- Token type (optional)

### Commitment Scheme

```
Commitment = Hash(Value || Randomness)
Nullifier = Hash(Commitment || Secret)
```

## Integration Guide

### Browser Extension

The browser extension provides a user-friendly interface:

```bash
cd browser-extension-master
npm install
npm run build
```

Load the extension in Chrome:
1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `build` directory

### Helius Integration

Dark Protocol uses Helius for:
- **Smart Transactions**: Automatic compute unit optimization
- **Priority Fees**: Dynamic fee calculation
- **Transaction Broadcasting**: Multi-region redundancy
- **Enhanced RPC**: Rich transaction APIs

```typescript
const tx = await client.createSmartTx({
  instructions: [instruction1, instruction2],
  signers: [wallet.keypair],
  feePayer: wallet.publicKey,
});
```

### Jupiter Integration

Dark Protocol integrates with Jupiter V6 for privacy-preserving swaps and perpetuals trading.

#### Jupiter V6 Swaps

**On-Chain Integration**: `programs/dark-protocol/src/integrations/jupiter.rs`

```rust
// Jupiter V6 Program
pub const JUPITER_PROGRAM_ID: Pubkey = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

// Execute private swap with ZK proof
pub fn execute_dark_swap(
    ctx: DarkSwapContext,
    input_commitment: [u8; 32],
    output_commitment: [u8; 32],
    nullifier: [u8; 32],
    proof: Vec<u8>,
    route: JupiterRoute,
) -> Result<u64>
```

**TypeScript SDK**: `sdk/typescript/src/jupiter-swap.ts`

```typescript
import { JupiterSwapClient } from '@dark-protocol/sdk';

const jupiterClient = new JupiterSwapClient(client, process.env.JUPITER_API_KEY);

// Get swap quote
const quote = await jupiterClient.getQuote({
  inputMint: 'So11111111111111111111111111111111111111112', // SOL
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  amount: '1000000000', // 1 SOL
  slippageBps: 50, // 0.5% slippage
});

// Execute private swap with ZK proof
const signature = await jupiterClient.executePrivateSwap(
  new PublicKey(TOKENS.SOL),
  new PublicKey(TOKENS.USDC),
  BigInt(1_000_000_000),
  {
    inputCommitment: commitment,
    outputCommitment: newCommitment,
    nullifier: nullifier,
    proof: {
      proofA: new Uint8Array(64),
      proofB: new Uint8Array(128),
      proofC: new Uint8Array(64),
    },
    slippageBps: 50,
    priorityFee: 1000,
  }
);

// Get token prices
const solPrice = await jupiterClient.getTokenPrice(TOKENS.SOL);

// Find best route with constraints
const route = await jupiterClient.findBestRoute(
  TOKENS.SOL,
  TOKENS.USDC,
  BigInt(5_000_000_000),
  {
    maxSlippage: 100,
    maxPriceImpact: 1.0,
    onlyDirectRoutes: false,
  }
);
```

#### Jupiter Perpetuals (JLP Pool)

**JLP Pool**: `5BUwFW4nRbftYTDMbgxykoFWqWHPzahFSNAaaaJtVKsq`

**Custody Accounts**:
- SOL: `7xS2gz2bTp3fwCC7knJvUWTEU9Tycczu6VhJYKgi1wdz`
- ETH: `AQCGyheWPLeo6Qp9WpYS9m3Qj479t7R636N9ey1rEjEn`
- BTC: `5Pv3gM9JrFFH883SWAhvJC9RPYmo8UNxuFtv5bMMALkm`
- USDC: `G18jKKXQwBbrHeiK3C9MRXhkHsLHf7XgCSisykV46EZa`
- USDT: `4vkNeXiYEUizLdrpdPS1eC2mccyM4NUPRtERrk6ZETkk`

```typescript
import { JupiterPerpetualsClient } from '@dark-protocol/sdk';

const perpsClient = new JupiterPerpetualsClient(client);

// Get JLP pool state
const poolState = await perpsClient.getPoolState();

// Get custody state
const solCustody = await perpsClient.getCustodyState('SOL');

// Open private long position
const positionSignature = await perpsClient.openPosition({
  token: 'SOL',
  collateralToken: 'USDC',
  sizeUsd: BigInt(1000_000_000),    // $1000
  collateralUsd: BigInt(200_000_000), // $200
  side: 'long',
  leverage: 5,
  slippageBps: 50,
  proof: zkProof,
});

// Close position
await perpsClient.closePosition({
  positionKey: positionPubkey,
  entirePosition: true,
  slippageBps: 50,
  proof: zkProof,
});

// Get position PnL
const { unrealizedPnL, realizedPnL } = await perpsClient.getPositionPnL(positionPubkey);

// Get liquidation price
const liqPrice = await perpsClient.getLiquidationPrice(positionPubkey);
```

#### Privacy Guarantees

**What's Hidden**:
- Transaction amounts (via commitments)
- Sender identity (via ZK proofs)
- Receiver identity (via shielded addresses)

**What's Public**:
- Program interactions (Jupiter program calls visible)
- Timing metadata (transaction timestamps)
- Route plans (DEX routing visible, but not amounts)

#### ZK Proof Structure (Groth16)

```
256-byte proof:
├── Proof A: 64 bytes
├── Proof B: 128 bytes
└── Proof C: 64 bytes

Public Inputs:
├── Merkle Root (32 bytes)
├── Input Commitment (32 bytes)
├── Output Commitment (32 bytes)
└── Nullifier (32 bytes)
```

#### Integration Flow

```
1. User initiates swap
2. Generate ZK proof (off-chain)
3. Get Jupiter quote from API
4. Build transaction with commitments, nullifier, proof, route
5. Submit to Dark Protocol
6. Verify ZK proof on-chain
7. Check nullifier (prevent double-spend)
8. Execute Jupiter swap via CPI
9. Verify output amount vs slippage
10. Update merkle tree
11. Emit events
```

#### Performance

- **Private swap**: ~150,000 compute units
- **ZK proof verification**: ~80,000 compute units
- **Merkle tree update**: ~30,000 compute units
- **Jupiter route execution**: ~40,000 compute units
- **Target throughput**: 1,000+ swaps/second
- **Latency**: <500ms end-to-end

See [JUPITER_INTEGRATION.md](./JUPITER_INTEGRATION.md) for complete integration details.

## Security

### Audits
- [ ] Trail of Bits (Pending)
- [ ] Zellic (Pending)
- [ ] OtterSec (Pending)

### Best Practices
1. Never share your viewing key
2. Backup your mnemonic securely
3. Verify TEE attestations
4. Use hardware wallets for large amounts
5. Review AI agent capabilities before approval

## Development

### Build Programs

```bash
# Build Rust programs
cd dark-protocol
cargo build-bpf

# Deploy to devnet
solana program deploy target/deploy/dark_protocol.so
```

### Run Tests

```bash
# Rust tests
cargo test

# TypeScript tests
cd sdk/typescript
npm test
```

### Generate IDL

```bash
anchor build
```

## Roadmap

### Phase 1: Core Privacy (Q1 2025) ✅
- [x] Shielded transactions
- [x] ZK proof verification
- [x] Merkle tree implementation
- [x] Privacy pools

### Phase 2: Integration (Q2 2025)
- [x] Jupiter swap integration
- [x] Helius infrastructure
- [x] Browser extension
- [ ] Mobile wallet

### Phase 3: AI Agents (Q3 2025)
- [x] TEE environment
- [x] AI agent registration
- [ ] Advanced trading strategies
- [ ] Multi-agent coordination

### Phase 4: Ecosystem (Q4 2025)
- [ ] Private NFTs
- [ ] Private governance
- [ ] Cross-chain privacy
- [ ] Privacy-preserving oracles

## API Reference

See [API Documentation](./docs/api.md) for detailed API reference.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

Apache 2.0 - see [LICENSE](./LICENSE)

## Links

- **Website**: https://dark-protocol.io
- **Docs**: https://docs.dark-protocol.io
- **Discord**: https://discord.gg/dark-protocol
- **Twitter**: https://twitter.com/DarkProtocol

## Acknowledgments

Built on the shoulders of giants:
- **Zcash**: Privacy protocol inspiration
- **Solana Foundation**: High-performance blockchain
- **Jupiter**: DEX aggregation
- **Helius**: Infrastructure and APIs
- **Anchor**: Development framework

---

**Privacy is a right, not a privilege. Build with Dark Protocol.**
