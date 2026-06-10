# Dark Protocol Deployment Guide

This guide covers deploying and using the complete Dark Protocol system with Jupiter swaps, Helius infrastructure, and AI agents.

## Prerequisites

- **Solana CLI** (v1.18+)
- **Anchor CLI** (v0.30.0+)
- **Node.js** (v18+)
- **Rust** (v1.75+)
- **API Keys**:
  - Helius API key (required)
  - Jupiter API key (optional, for enhanced features)
  - RedPill API key (optional, for AI agents)

## System Components

### 1. On-Chain Program

**Dark Protocol Program**: Core Solana program handling privacy, swaps, and AI agents

Location: `dark-protocol/programs/dark-protocol/`

Key Features:
- Shielded transactions with ZK proofs
- Privacy pools with merkle trees
- Jupiter swap integration
- AI agent registration and execution in TEE

### 2. TypeScript SDK

**@dark-protocol/sdk**: Complete SDK for interacting with Dark Protocol

Location: `dark-protocol/sdk/typescript/`

Modules:
- `client`: Main protocol client with Helius integration
- `wallet`: Wallet management with BIP39 support
- `swap`: Private swaps via Jupiter
- `ai-agent`: AI agent management with TEE attestation
- `privacy`: ZK proof generation and encryption utilities
- `utils`: Helper functions

### 3. Browser Extension

**Dark Wallet Extension**: Privacy-first browser wallet

Location: `browser-extension-master/`

Features:
- Secure key management
- Shielded balance display
- Private transfers and swaps
- AI agent controls

## Deployment Steps

### Step 1: Deploy On-Chain Program

```bash
# Navigate to program directory
cd dark-protocol/programs/dark-protocol

# Build the program
anchor build

# Get program ID
solana address -k target/deploy/dark_protocol-keypair.json

# Update program ID in lib.rs
# declare_id!("YOUR_PROGRAM_ID");

# Rebuild
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Or deploy to mainnet
anchor deploy --provider.cluster mainnet
```

### Step 2: Initialize Protocol State

```typescript
import { DarkProtocolClient } from '@dark-protocol/sdk';
import { Keypair } from '@solana/web3.js';

const client = await DarkProtocolClient.create({
  heliusApiKey: process.env.HELIUS_API_KEY!,
  rpcUrl: process.env.HELIUS_RPC_URL,
});

// Initialize protocol (only needs to be done once)
const authority = Keypair.generate();
const merkleTreeDepth = 20; // Supports 2^20 commitments

const tx = await client.program.methods
  .initializeProtocol(merkleTreeDepth)
  .accounts({
    authority: authority.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .signers([authority])
  .rpc();

console.log('Protocol initialized:', tx);
```

### Step 3: Build and Install SDK

```bash
cd dark-protocol/sdk/typescript

# Install dependencies
npm install

# Build SDK
npm run build

# Link for local development
npm link

# Or publish to npm
npm publish --access public
```

### Step 4: Build Browser Extension

```bash
cd browser-extension-master

# Install dependencies
npm install

# Build extension
npm run build

# The built extension will be in the 'build' directory
```

Load in Chrome:
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `build` directory

## Configuration

### Environment Variables

Create `.env` files in appropriate locations:

#### For Backend/Scripts

```bash
# .env
HELIUS_API_KEY=your_helius_api_key_here
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}
JUPITER_API_KEY=your_jupiter_api_key_here
REDPILL_API_KEY=your_redpill_api_key_here
PROGRAM_ID=DARKxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXx
```

#### For Browser Extension

Update `browser-extension-master/src/config.ts`:

```typescript
export const config = {
  rpcUrl: process.env.HELIUS_RPC_URL,
  programId: process.env.PROGRAM_ID,
  network: 'mainnet-beta', // or 'devnet'
};
```

## Usage Examples

### Example 1: Create Private Wallet

```typescript
import { DarkProtocolClient, DarkWallet, PrivacyUtils } from '@dark-protocol/sdk';

async function createPrivateWallet() {
  // Initialize client
  const client = await DarkProtocolClient.create({
    heliusApiKey: process.env.HELIUS_API_KEY!,
  });

  // Generate new wallet
  const { wallet, mnemonic } = await DarkWallet.generate(client);
  console.log('Save this mnemonic securely:', mnemonic);

  // Generate privacy keys
  const viewingKey = PrivacyUtils.generateViewingKey();
  const spendingKey = crypto.getRandomValues(new Uint8Array(32));
  const spendingKeyCommitment = await PrivacyUtils.hash(spendingKey);

  // Initialize shielded address
  await wallet.initializeShieldedAddress(viewingKey, spendingKeyCommitment);

  return { wallet, viewingKey, spendingKey };
}
```

### Example 2: Private Transfer

```typescript
async function privateTransfer(
  wallet: DarkWallet,
  recipient: PublicKey,
  amount: bigint
) {
  // Optional encrypted memo
  const memo = 'Private payment for services';

  const signature = await wallet.privateTransfer(
    recipient,
    amount,
    memo
  );

  console.log('Private transfer completed:', signature);
  return signature;
}
```

### Example 3: Private Swap with Jupiter

```typescript
import { PrivateSwapManager } from '@dark-protocol/sdk';

async function privateSwap(client: DarkProtocolClient, wallet: DarkWallet) {
  const swapManager = new PrivateSwapManager(
    client,
    process.env.JUPITER_API_KEY
  );

  // USDC to SOL swap
  const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  const SOL = new PublicKey('So11111111111111111111111111111111111111112');

  const signature = await swapManager.executePrivateSwap({
    inputMint: USDC,
    outputMint: SOL,
    inputAmount: BigInt(100_000_000), // 100 USDC
    minOutputAmount: BigInt(500_000_000), // Min 0.5 SOL
    slippageBps: 50,
    userPublicKey: wallet.publicKey,
  });

  console.log('Private swap completed:', signature);
}
```

### Example 4: Register and Use AI Agent

```typescript
import { AIAgentManager } from '@dark-protocol/sdk';

async function setupAIAgent(client: DarkProtocolClient, wallet: DarkWallet) {
  const aiManager = new AIAgentManager(
    client,
    process.env.REDPILL_API_KEY
  );

  // Create agent keypair
  const agentKeypair = Keypair.generate();

  // In production, generate real TEE attestation
  const teeAttestation = {
    measurement: new Uint8Array(32), // SGX measurement
    timestamp: Date.now(),
    signature: new Uint8Array(64), // Attestation signature
  };

  // Register agent
  await aiManager.registerAgent({
    agentPubkey: agentKeypair.publicKey,
    teeAttestation,
    capabilities: [
      {
        type: 'swap',
        enabled: true,
        maxAmount: BigInt(1_000_000_000), // 1 SOL max
        requiresApproval: true,
      },
      {
        type: 'analyze',
        enabled: true,
        requiresApproval: false,
      },
    ],
    owner: wallet.publicKey,
  });

  // Get swap recommendations
  const portfolioData = await wallet.getState();
  const recommendations = await aiManager.getSwapRecommendations({
    agentPubkey: agentKeypair.publicKey,
    portfolioData,
  });

  console.log('AI Recommendations:', recommendations);
}
```

## Integration with Existing Systems

### Jupiter Integration

Dark Protocol uses Jupiter's V6 API for swap routing:

```typescript
// Jupiter automatically finds best routes across all DEXs
const route = await swapManager.getQuote(
  inputMint,
  outputMint,
  amount,
  50 // slippage BPS
);

// Route is executed privately through Dark Protocol
await swapManager.executePrivateSwap({...});
```

### Helius Integration

Helius provides infrastructure for:

1. **Smart Transactions**

```typescript
const smartTx = await client.createSmartTx({
  instructions: [...],
  signers: [wallet.keypair],
});

// Automatically optimized:
// - Compute units
// - Priority fees
// - Transaction size
```

2. **Enhanced RPC**

```typescript
// Access enhanced Helius methods
const assets = await client.helius.rpc.getAssetsByOwner({
  ownerAddress: wallet.publicKey.toBase58(),
});
```

3. **Transaction Broadcasting**

```typescript
// Multi-region redundant broadcasting
const signature = await sendTransaction(tx, {
  skipPreflight: false,
  maxRetries: 3n,
});
```

## Monitoring and Analytics

### Track Protocol State

```typescript
// Get current protocol statistics
const protocolState = await client.getProtocolState();
console.log('Total Shielded Supply:', protocolState.totalShieldedSupply);
console.log('Total Commitments:', protocolState.totalCommitments);

// Get merkle tree state
const merkleTree = await client.getMerkleTree();
console.log('Tree Root:', merkleTree.root);
console.log('Next Index:', merkleTree.nextIndex);
```

### Monitor AI Agents

```typescript
const agent = await aiManager.getAgent(agentPubkey);
console.log('Trust Score:', agent.trustScore);
console.log('Total Actions:', agent.totalActions);
console.log('Success Rate:',
  Number(agent.successfulActions) / Number(agent.totalActions)
);
```

## Security Considerations

### Key Management

1. **Never expose private keys** in code or logs
2. **Use hardware wallets** for large amounts
3. **Backup mnemonics** securely offline
4. **Separate hot/cold wallets** for different risk levels

### TEE Attestation

1. **Verify attestations** before trusting AI agents
2. **Use real SGX/SEV hardware** in production
3. **Regularly update** TEE measurements
4. **Monitor agent behavior** for anomalies

### Transaction Privacy

1. **Always use shielded pool** for sensitive transactions
2. **Vary amounts and timing** to prevent analysis
3. **Use privacy pools** for additional mixing
4. **Review ZK proofs** before broadcasting

## Troubleshooting

### Common Issues

**Issue**: Transaction fails with "Merkle tree full"
**Solution**: Increase merkle tree depth or create new pool

**Issue**: ZK proof verification fails
**Solution**: Ensure proof generation uses correct public inputs

**Issue**: TEE attestation rejected
**Solution**: Verify attestation service is accessible and measurements are current

**Issue**: Swap fails with slippage error
**Solution**: Increase slippage tolerance or retry with updated quote

## Performance Optimization

### Batch Operations

```typescript
// Batch multiple private transfers
const transfers = await Promise.all([
  wallet.privateTransfer(recipient1, amount1),
  wallet.privateTransfer(recipient2, amount2),
  wallet.privateTransfer(recipient3, amount3),
]);
```

### Compute Unit Optimization

```typescript
// Helius automatically optimizes, but you can override
const tx = await client.createSmartTx({
  instructions: [...],
  signers: [...],
  minUnits: 200_000, // Minimum compute units
  bufferPct: 10, // 10% buffer
});
```

## Support

- **Documentation**: https://docs.dark-protocol.io
- **Discord**: https://discord.gg/dark-protocol
- **GitHub Issues**: https://github.com/dark-protocol/dark-protocol/issues
- **Email**: support@dark-protocol.io

## License

Apache 2.0 - See LICENSE file for details
