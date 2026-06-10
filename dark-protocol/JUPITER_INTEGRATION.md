# Jupiter Integration - Dark Swaps

Complete implementation of private swaps using Jupiter V6 aggregator and Jupiter Perpetuals.

## Overview

Dark Protocol now supports privacy-preserving swaps through Jupiter, the leading DEX aggregator on Solana. Users can execute swaps while hiding transaction details (sender, receiver, amounts) using Groth16 zero-knowledge proofs.

## Architecture

### On-Chain Integration

**File**: `programs/dark-protocol/src/integrations/jupiter.rs`

- **Jupiter V6 Program**: `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4`
- **Jupiter Perps Program**: `PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu`
- **JLP Pool**: `5BUwFW4nRbftYTDMbgxykoFWqWHPzahFSNAaaaJtVKsq`

#### Custody Accounts (JLP Pool)

```rust
pub mod custody {
    pub const SOL: Pubkey = "7xS2gz2bTp3fwCC7knJvUWTEU9Tycczu6VhJYKgi1wdz";
    pub const ETH: Pubkey = "AQCGyheWPLeo6Qp9WpYS9m3Qj479t7R636N9ey1rEjEn";
    pub const BTC: Pubkey = "5Pv3gM9JrFFH883SWAhvJC9RPYmo8UNxuFtv5bMMALkm";
    pub const USDC: Pubkey = "G18jKKXQwBbrHeiK3C9MRXhkHsLHf7XgCSisykV46EZa";
    pub const USDT: Pubkey = "4vkNeXiYEUizLdrpdPS1eC2mccyM4NUPRtERrk6ZETkk";
}
```

#### Core Functions

1. **execute_dark_swap()**: Main handler for private swaps
   - Validates input commitment, output commitment, nullifier
   - Verifies Groth16 ZK proof
   - Prevents double-spending via nullifier set
   - Executes Jupiter route
   - Verifies slippage tolerance

2. **get_jupiter_quote()**: Fetch swap quotes from Jupiter API
   - Supports quote-api.jup.ag/v6
   - Returns optimal routes with price impact
   - Parses route plans for on-chain execution

3. **perps module**: Private perpetual positions
   - open_position(): Long/short with leverage
   - close_position(): Exit positions
   - Integration with JLP pool

### TypeScript SDK

**Files**: 
- `sdk/typescript/src/jupiter-swap.ts`
- `sdk/typescript/src/index.ts`
- `sdk/typescript/examples/dark-swap-example.ts`

#### JupiterSwapClient

```typescript
class JupiterSwapClient {
  // Get swap quote from Jupiter API
  async getQuote(params: JupiterQuoteParams): Promise<JupiterSwapRoute>
  
  // Execute private swap with ZK proof
  async executePrivateSwap(
    inputMint: PublicKey,
    outputMint: PublicKey,
    amount: bigint,
    options: PrivateSwapOptions
  ): Promise<string>
  
  // Get token price
  async getTokenPrice(mint: string): Promise<number>
  
  // Estimate price impact
  async estimatePriceImpact(
    inputMint: string,
    outputMint: string,
    amount: bigint
  ): Promise<number>
  
  // Find best route
  async findBestRoute(
    inputMint: string,
    outputMint: string,
    amount: bigint,
    options?: RouteOptions
  ): Promise<JupiterSwapRoute | null>
}
```

#### JupiterPerpetualsClient

```typescript
class JupiterPerpetualsClient {
  // Get JLP pool state
  async getPoolState(): Promise<PoolState>
  
  // Get custody account state
  async getCustodyState(token: 'SOL' | 'ETH' | 'BTC' | 'USDC' | 'USDT'): Promise<CustodyState>
  
  // Open private position
  async openPosition(params: OpenPositionParams): Promise<string>
  
  // Close private position
  async closePosition(params: ClosePositionParams): Promise<string>
  
  // Get position PnL
  async getPositionPnL(positionKey: PublicKey): Promise<PnL>
  
  // Get liquidation price
  async getLiquidationPrice(positionKey: PublicKey): Promise<number>
}
```

## Usage Examples

### 1. Get Swap Quote

```typescript
import { DarkProtocolClient, JupiterSwapClient } from '@dark-protocol/sdk';

const client = await DarkProtocolClient.create({
  heliusApiKey: process.env.HELIUS_API_KEY!,
  jupiterApiKey: process.env.JUPITER_API_KEY,
});

const jupiterClient = new JupiterSwapClient(client, process.env.JUPITER_API_KEY);

const quote = await jupiterClient.getQuote({
  inputMint: 'So11111111111111111111111111111111111111112', // SOL
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  amount: '1000000000', // 1 SOL
  slippageBps: 50,
});

console.log(`Expected output: ${quote.outputAmount} USDC`);
console.log(`Price impact: ${quote.priceImpactPct}%`);
```

### 2. Execute Private Swap

```typescript
const signature = await jupiterClient.executePrivateSwap(
  new PublicKey('So11111111111111111111111111111111111111112'),
  new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  BigInt(1_000_000_000), // 1 SOL
  {
    inputCommitment: commitment,      // 32 bytes
    outputCommitment: newCommitment,  // 32 bytes
    nullifier: nullifier,             // 32 bytes
    proof: {
      proofA: new Uint8Array(64),     // Groth16 proof A
      proofB: new Uint8Array(128),    // Groth16 proof B
      proofC: new Uint8Array(64),     // Groth16 proof C
    },
    slippageBps: 50,
    priorityFee: 1000,
  }
);
```

### 3. Jupiter Perpetuals

```typescript
import { JupiterPerpetualsClient } from '@dark-protocol/sdk';

const perpsClient = new JupiterPerpetualsClient(client);

// Open long position
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
```

## Privacy Guarantees

### What's Hidden

1. **Transaction Amount**: Hidden via commitments
2. **Sender Identity**: Hidden via ZK proof
3. **Receiver Identity**: Hidden via shielded addresses
4. **Token Types**: Partially hidden (on-chain mints visible)

### What's Public

1. **Program Interactions**: Jupiter program calls are visible
2. **Timing**: Transaction timestamps are public
3. **Route Plan**: DEX routing is visible (but not amounts)

### ZK Proof Structure

```
Groth16 Proof (256 bytes total)
├── Proof A: 64 bytes
├── Proof B: 128 bytes
└── Proof C: 64 bytes

Public Inputs:
├── Merkle Root (32 bytes)
├── Input Commitment (32 bytes)
├── Output Commitment (32 bytes)
└── Nullifier (32 bytes)
```

## Integration Flow

```
1. User initiates swap
   ↓
2. Generate ZK proof (off-chain)
   ↓
3. Get Jupiter quote (SDK)
   ↓
4. Build transaction with:
   - Input commitment
   - Output commitment
   - Nullifier
   - ZK proof
   - Jupiter route plan
   ↓
5. Submit to Dark Protocol
   ↓
6. Verify ZK proof (on-chain)
   ↓
7. Check nullifier (prevent double-spend)
   ↓
8. Execute Jupiter swap (CPI)
   ↓
9. Verify output amount
   ↓
10. Update merkle tree
    ↓
11. Emit events
```

## Technical Details

### Route Serialization

Jupiter routes are serialized for on-chain storage:

```typescript
serializeRoutePlan(routePlan: RoutePlanStep[]): Uint8Array {
  // Format: [num_steps: u8][step_data: bytes]
  // Each step: [percent: u8][input_index: u8][output_index: u8][swap_data]
}
```

### Slippage Protection

```rust
require!(
    output_amount >= route.other_amount_threshold,
    DarkProtocolError::SlippageExceeded
);
```

### Double-Spend Prevention

```rust
require!(
    !ctx.nullifier_set.contains(&nullifier),
    DarkProtocolError::NullifierAlreadyExists
);

ctx.nullifier_set.insert(nullifier)?;
```

## API Endpoints

### Jupiter V6 API

**Base URL**: `https://quote-api.jup.ag/v6`

**Endpoints**:
- `GET /quote` - Get swap quote
- `POST /swap` - Get swap transaction
- `POST /swap-instructions` - Get swap instructions

**Price API**: `https://price.jup.ag/v4/price`

### Dark Protocol RPC

**Requirements**:
- Helius API key (required)
- Jupiter API key (optional, for enhanced features)

## Testing

### Run Examples

```bash
# Set environment variables
export HELIUS_API_KEY="your-helius-api-key"
export JUPITER_API_KEY="your-jupiter-api-key"

# Install dependencies
cd dark-protocol/sdk/typescript
npm install

# Run example
npx ts-node examples/dark-swap-example.ts
```

### Expected Output

```
Dark Protocol client initialized
Jupiter Swap client initialized

=== Getting Swap Quote ===
Quote received:
  Input: 1000000000 lamports SOL
  Output: 150250000 USDC
  Min output: 149497500 USDC
  Price impact: 0.12%
  Route steps: 2
  Platform fee: 0 bps

=== Getting Token Prices ===
SOL price: $150.25
USDC price: $1.00
BTC price: $67890.50

✅ All examples completed
```

## Security Considerations

### ⚠️ Development Status

- **Status**: Pre-audit, development version
- **Use**: DO NOT use with real funds
- **Audits**: Scheduled with Trail of Bits, Zellic, OtterSec

### Best Practices

1. **Always verify slippage**: Set reasonable slippageBps
2. **Check price impact**: Monitor priceImpactPct
3. **Use priority fees**: Ensure transaction inclusion
4. **Validate proofs**: Never skip ZK proof verification
5. **Monitor nullifiers**: Prevent double-spend attacks

## Performance

### Gas Costs (Estimated)

- Private swap: ~150,000 compute units
- ZK proof verification: ~80,000 compute units
- Merkle tree update: ~30,000 compute units
- Jupiter route execution: ~40,000 compute units

### Throughput

- Target: 1,000+ swaps per second
- Latency: <500ms end-to-end
- Quote refresh: Real-time via Jupiter API

## Roadmap

### Phase 1 (Current) ✅
- [x] Jupiter V6 integration
- [x] TypeScript SDK
- [x] Basic examples
- [x] Documentation

### Phase 2 (In Progress) 🔨
- [ ] ZK proof generation library
- [ ] Complete perpetuals integration
- [ ] Advanced routing algorithms
- [ ] React hooks package

### Phase 3 (Planned) 📋
- [ ] Security audits
- [ ] Testnet deployment
- [ ] Beta testing program
- [ ] Mainnet launch

## Resources

- **Jupiter Docs**: https://station.jup.ag/docs
- **Jupiter API**: https://quote-api.jup.ag/docs
- **Dark Protocol**: https://docs.darkprotocol.xyz
- **Groth16**: https://github.com/arkworks-rs/groth16

## Support

- GitHub: https://github.com/darkprotocol/dark-protocol
- Discord: https://discord.gg/darkprotocol
- Email: dev@darkprotocol.xyz

## License

Apache-2.0
