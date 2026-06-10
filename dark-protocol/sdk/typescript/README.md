# Dark Protocol TypeScript SDK

Privacy-first DeFi protocol on Solana with AI agents and Jupiter integration.

## Features

- 🔒 **Private Swaps**: Execute swaps with zero-knowledge proofs hiding transaction details
- 🌊 **Jupiter Integration**: Best swap routes across all Solana DEXs
- 📈 **Perpetuals Trading**: Private leveraged positions via Jupiter Perpetuals
- ⚡ **Helius Infrastructure**: Optimized RPC and smart transactions
- 🤖 **AI Agent Support**: TEE-verified autonomous trading
- 🛡️ **Groth16 ZK-SNARKs**: 256-byte proofs for maximum privacy

## Installation

```bash
npm install @dark-protocol/sdk
# or
yarn add @dark-protocol/sdk
# or
pnpm add @dark-protocol/sdk
```

## Quick Start

```typescript
import { DarkProtocolClient, JupiterSwapClient } from '@dark-protocol/sdk';

// Reads HELIUS_RPC_URL / HELIUS_API_KEY / SOLANA_CLUSTER.
const client = await DarkProtocolClient.fromEnv();

// Initialize Jupiter swap client
const jupiterClient = new JupiterSwapClient(client, process.env.JUPITER_API_KEY);

// Get swap quote
const quote = await jupiterClient.getQuote({
  inputMint: 'So11111111111111111111111111111111111111112', // SOL
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  amount: '1000000000', // 1 SOL
  slippageBps: 50, // 0.5%
});

console.log(`Expected output: ${quote.outputAmount} USDC`);
```

## Runtime Environment

```bash
HELIUS_RPC_URL=
HELIUS_API_KEY=
SOLANA_RPC_URL=
SOLANA_CLUSTER=devnet        # or mainnet-beta
DARK_PROTOCOL_PROGRAM_ID=
JUPITER_API_KEY=
XAI_API_KEY=
XAI_BASE_URL=
XAI_MODEL=
```

`HELIUS_RPC_URL` wins when present. Otherwise the SDK builds a devnet or
mainnet-beta Helius endpoint from `HELIUS_API_KEY`. Without Helius config, it
falls back to the public Solana RPC endpoint for the selected cluster.

The last-November Zcash-to-Solana port keeps Sapling-style language for notes,
commitments, nullifiers, and paper-wallet custody, but the SDK runtime resolves
SVM devnet/mainnet-beta RPC through Helius and emits Solana-compatible wallet
and payment primitives.

## Dark Clawd Agent

```typescript
import { AIAgentManager, DarkProtocolClient } from '@dark-protocol/sdk';

const client = await DarkProtocolClient.fromEnv();
const agent = new AIAgentManager(client);

const review = await agent.reviewPaperWallet({
  label: 'ZOLana cold wallet',
  network: 'devnet',
  publicKey: '...',
  paymentRail: 'x402',
  settlement: 'solana',
  proofLayer: 'evm',
  durableReceipt: true,
});

console.log(review);
```

The xAI path uses `XAI_API_KEY` and only reviews public metadata. Secret key
JSON and Sapling/Solana spend material must stay out of prompts.

## Private Payment Primitive

```typescript
import {
  createPrivatePaymentEvmIntentProof,
  createPrivatePaymentProofPayload,
  createPrivatePaymentReceipt,
  markPrivatePaymentAnchored,
} from '@dark-protocol/sdk';

const receipt = createPrivatePaymentReceipt({
  amountLamports: 250_000_000n,
  recipient: 'zsol1...',
  rail: 'x402',
  settlement: 'solana',
  proofLayer: 'evm',
  durableReceipt: true,
  memo: 'private settlement',
});

const anchored = markPrivatePaymentAnchored(receipt, {
  signature: 'SOLANA_SIGNATURE',
  cluster: 'devnet',
});

const evmIntent = createPrivatePaymentEvmIntentProof(anchored, {
  chainId: 1,
  verifyingContract: '0xVerifierContract',
});
const exportable = createPrivatePaymentProofPayload(anchored, {
  evmChainId: 1,
  evmVerifyingContract: '0xVerifierContract',
});

console.log(anchored.commitmentHex, evmIntent.digest, exportable.status);
```

To verify the Solana anchor later:

```typescript
const result = await client.verifyPrivatePaymentAnchor(anchored);
if (!result.ok) {
  throw new Error(result.mismatches.join('; ') || result.reason);
}
```

This is the SDK-level receipt primitive for durable, non-ephemeral private
payments over `x402`, `AP2`, and `M2M`. Solana anchoring records a signed Memo
intent transaction against the same receipt. Verification fetches that
transaction by signature and checks that the Memo payload matches the receipt.

Rail authorization handoff:

```typescript
import { createRailAuthorizationEnvelope } from '@dark-protocol/sdk';

const railAuth = createRailAuthorizationEnvelope(anchored, {
  evmChainId: 1,
  evmVerifyingContract: '0xVerifierContract',
  resource: 'https://example.service/private-api',
});
```

The rail authorization binds x402/AP2/M2M metadata to receipt nonce, replay key,
Solana anchor signature, verified slot, and EVM intent digest. It is the object
a facilitator, AP2 mandate runner, or machine-to-machine settlement worker can
consume.

The EVM payload is an intent proof shape for later verifier or contract
anchoring. `dark-protocol/evm-verifier` contains a Foundry verifier contract
that can consume the EIP-712 proof digest once. This is not live EVM settlement
by itself. The final Dark Protocol program IDL still needs settlement and proof
verification wired on-chain.

## Private Swaps with ZK Proofs

```typescript
import { PublicKey } from '@solana/web3.js';

// Execute private swap
const signature = await jupiterClient.executePrivateSwap(
  new PublicKey('So11111111111111111111111111111111111111112'), // Input: SOL
  new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), // Output: USDC
  BigInt(1_000_000_000), // 1 SOL
  {
    inputCommitment: commitment,
    outputCommitment: newCommitment,
    nullifier: nullifier,
    proof: zkProof,
    slippageBps: 50,
    priorityFee: 1000,
  }
);

console.log('Private swap completed:', signature);
```

## Jupiter Perpetuals

```typescript
import { JupiterPerpetualsClient } from '@dark-protocol/sdk';

const perpsClient = new JupiterPerpetualsClient(client);

// Get JLP pool state
const poolState = await perpsClient.getPoolState();

// Get custody state
const solCustody = await perpsClient.getCustodyState('SOL');

// Open long position
const positionSignature = await perpsClient.openPosition({
  token: 'SOL',
  collateralToken: 'USDC',
  sizeUsd: BigInt(1000_000_000), // $1000
  collateralUsd: BigInt(200_000_000), // $200
  side: 'long',
  leverage: 5,
  slippageBps: 50,
  proof: zkProof,
});
```

## API Reference

### DarkProtocolClient

Main client for interacting with Dark Protocol.

```typescript
class DarkProtocolClient {
  static async create(config: DarkProtocolConfig): Promise<DarkProtocolClient>
  async getProtocolState(): Promise<ProtocolState>
  async getMerkleTree(): Promise<MerkleTree>
  async getShieldedAddress(owner: PublicKey): Promise<ShieldedAddress>
  async getAIAgent(agentPubkey: PublicKey): Promise<AIAgent>
}
```

#### Configuration

```typescript
interface DarkProtocolConfig {
  heliusApiKey?: string;         // Helius API key
  jupiterApiKey?: string;        // Jupiter API key (optional)
  redpillApiKey?: string;        // Redpill API key (optional)
  xaiApiKey?: string;            // xAI key for Dark Clawd sidecar
  cluster?: 'devnet' | 'mainnet-beta';
  rpcUrl?: string;               // Custom RPC URL (optional)
  programId?: PublicKey;         // Program ID (optional)
  commitment?: 'processed' | 'confirmed' | 'finalized';
}
```

### JupiterSwapClient

Client for executing private swaps via Jupiter.

```typescript
class JupiterSwapClient {
  constructor(darkClient: DarkProtocolClient, apiKey?: string)
  
  async getQuote(params: JupiterQuoteParams): Promise<JupiterSwapRoute>
  async getQuoteWithAlternatives(params: JupiterQuoteParams, limit?: number): Promise<JupiterSwapRoute[]>
  async executePrivateSwap(
    inputMint: PublicKey,
    outputMint: PublicKey,
    amount: bigint,
    options: PrivateSwapOptions
  ): Promise<string>
  async getTokenPrice(mint: string): Promise<number>
  async estimatePriceImpact(inputMint: string, outputMint: string, amount: bigint): Promise<number>
  async findBestRoute(
    inputMint: string,
    outputMint: string,
    amount: bigint,
    options?: RouteOptions
  ): Promise<JupiterSwapRoute | null>
}
```

#### Quote Parameters

```typescript
interface JupiterQuoteParams {
  inputMint: string;             // Input token mint address
  outputMint: string;            // Output token mint address
  amount: string;                // Amount in atomic units
  slippageBps?: number;          // Slippage in basis points (default: 50)
  onlyDirectRoutes?: boolean;    // Only direct routes (default: false)
  maxAccounts?: number;          // Max accounts (default: 64)
  platformFeeBps?: number;       // Platform fee in bps
}
```

#### Private Swap Options

```typescript
interface PrivateSwapOptions {
  inputCommitment: Uint8Array;   // Input note commitment (32 bytes)
  outputCommitment: Uint8Array;  // Output note commitment (32 bytes)
  nullifier: Uint8Array;         // Nullifier to prevent double-spend (32 bytes)
  proof: ZKProof;                // Groth16 zero-knowledge proof
  slippageBps?: number;          // Slippage tolerance (default: 50)
  priorityFee?: number;          // Priority fee in micro-lamports
}
```

#### ZK Proof Structure

```typescript
interface ZKProof {
  proofA: Uint8Array;  // 64 bytes
  proofB: Uint8Array;  // 128 bytes
  proofC: Uint8Array;  // 64 bytes
}
```

### JupiterPerpetualsClient

Client for private perpetual trading.

```typescript
class JupiterPerpetualsClient {
  constructor(darkClient: DarkProtocolClient)
  
  async getPoolState(): Promise<PoolState>
  async getCustodyState(token: 'SOL' | 'ETH' | 'BTC' | 'USDC' | 'USDT'): Promise<CustodyState>
  async openPosition(params: OpenPositionParams): Promise<string>
  async closePosition(params: ClosePositionParams): Promise<string>
  async getPositionPnL(positionKey: PublicKey): Promise<{ unrealizedPnL: bigint; realizedPnL: bigint }>
  async getLiquidationPrice(positionKey: PublicKey): Promise<number>
}
```

## Examples

See the [examples](./examples) directory for complete working examples:

- **dark-swap-example.ts**: Comprehensive Jupiter swap integration demo
- Get swap quotes
- Execute private swaps
- Get token prices
- Find best routes
- Jupiter Perpetuals integration

Run examples:

```bash
# Set environment variables
export HELIUS_API_KEY="your-helius-api-key"
export JUPITER_API_KEY="your-jupiter-api-key"

# Run example
npx ts-node examples/dark-swap-example.ts
```

## Token Addresses (Mainnet)

```typescript
const TOKENS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  BTC: '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',
  ETH: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
};
```

## JLP Pool & Custody Accounts

```typescript
const JLP_POOL = '5BUwFW4nRbftYTDMbgxykoFWqWHPzahFSNAaaaJtVKsq';

const CUSTODY_ACCOUNTS = {
  SOL: '7xS2gz2bTp3fwCC7knJvUWTEU9Tycczu6VhJYKgi1wdz',
  ETH: 'AQCGyheWPLeo6Qp9WpYS9m3Qj479t7R636N9ey1rEjEn',
  BTC: '5Pv3gM9JrFFH883SWAhvJC9RPYmo8UNxuFtv5bMMALkm',
  USDC: 'G18jKKXQwBbrHeiK3C9MRXhkHsLHf7XgCSisykV46EZa',
  USDT: '4vkNeXiYEUizLdrpdPS1eC2mccyM4NUPRtERrk6ZETkk',
};
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Lint
npm run lint

# Format
npm run format
```

## Architecture

### Privacy Layer
- **Groth16 ZK-SNARKs**: Zero-knowledge proofs for transaction privacy
- **Commitment Scheme**: Hide transaction amounts and recipients
- **Nullifier System**: Prevent double-spending
- **Merkle Tree**: Track note commitments on-chain

### Jupiter Integration
- **V6 Aggregator**: Best swap routes across all DEXs
- **Perpetuals**: Private leveraged trading via JLP pool
- **5 Custody Accounts**: SOL, ETH, BTC, USDC, USDT
- **Single Pool Design**: Simplified liquidity management

### Helius Infrastructure
- **Optimized RPC**: High-performance Solana access
- **Smart Transactions**: Automatic optimization
- **Enhanced APIs**: DAS, webhooks, compression

## Security

- ⚠️ **Pre-Audit**: This SDK is in development. DO NOT use with real funds.
- 🔐 **ZK Proofs**: All private operations require valid Groth16 proofs
- 🛡️ **TEE Attestation**: AI agents must provide Intel SGX/AMD SEV attestation
- 📝 **Security Audits**: Trail of Bits, Zellic, OtterSec scheduled

## Roadmap

- [x] Core SDK implementation
- [x] Jupiter V6 integration
- [x] Jupiter Perpetuals support
- [ ] ZK proof generation library
- [ ] AI agent SDK
- [ ] React hooks package
- [ ] Mobile SDK (React Native)
- [ ] Security audits
- [ ] Mainnet launch

## Resources

- [Documentation](https://docs.darkprotocol.xyz)
- [GitHub](https://github.com/darkprotocol/dark-protocol)
- [Discord](https://discord.gg/darkprotocol)
- [Twitter](https://twitter.com/darkprotocol)

## License

Apache-2.0

## Support

- Discord: https://discord.gg/darkprotocol
- Email: dev@darkprotocol.xyz
- GitHub Issues: https://github.com/darkprotocol/dark-protocol/issues
