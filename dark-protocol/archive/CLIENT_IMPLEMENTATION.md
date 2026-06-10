# Dark Protocol Client Implementation Guide

## Overview

The Dark Protocol client provides a comprehensive React-based interface for privacy-preserving transactions on Solana. Built on top of the Dark Protocol SDK and integrated with Backpack wallet standards, it offers seamless privacy features while maintaining the familiar Solana developer experience.

## Architecture

```
dark-protocol/client/
├── src/
│   ├── components/          # React components
│   │   ├── ShieldTokensButton.tsx
│   │   ├── UnshieldTokensButton.tsx
│   │   ├── PrivateTransferButton.tsx
│   │   ├── PrivateSwapButton.tsx
│   │   ├── AIAgentManager.tsx
│   │   └── index.ts
│   └── index.ts
├── package.json
└── tsconfig.json
```

## Core Components

### 1. ShieldTokensButton

Converts transparent SPL tokens into shielded notes using Zcash Sapling-style cryptography.

**Features:**
- Generates cryptographic commitments
- Creates nullifiers for double-spend prevention
- Stores encrypted note data
- Updates merkle tree on-chain

**Usage:**
```tsx
import { ShieldTokensButton } from '@dark-protocol/client';

<ShieldTokensButton
  amount={100}
  tokenMint={USDC_MINT}
  onSuccess={(signature) => console.log('Shielded:', signature)}
  onError={(error) => console.error('Error:', error)}
/>
```

### 2. PrivateTransferButton

Transfers tokens between shielded addresses while maintaining complete privacy.

**Features:**
- Selects input notes (UTXOs)
- Generates zero-knowledge proofs
- Creates output commitments
- Encrypts transaction memos
- Prevents transaction graph analysis

**Usage:**
```tsx
import { PrivateTransferButton } from '@dark-protocol/client';

<PrivateTransferButton
  recipient="ShieldedAddress..."
  amount={50}
  memo="Private payment"
  onSuccess={(sig) => console.log('Transferred:', sig)}
/>
```

### 3. PrivateSwapButton

Executes token swaps using Jupiter aggregation while keeping swap details private.

**Features:**
- Fetches best routes from Jupiter
- Maintains privacy during swaps
- Generates swap-specific ZK proofs
- Updates note database post-swap

**Usage:**
```tsx
import { PrivateSwapButton } from '@dark-protocol/client';

<PrivateSwapButton
  inputToken={SOL_MINT}
  outputToken={USDC_MINT}
  amount={1}
  slippage={1}
  onSuccess={(sig) => console.log('Swapped:', sig)}
/>
```

### 4. UnshieldTokensButton

Converts shielded notes back to transparent SPL tokens.

**Features:**
- Verifies note ownership via ZK proofs
- Prevents double-spending with nullifiers
- Transfers to recipient's transparent account

**Usage:**
```tsx
import { UnshieldTokensButton } from '@dark-protocol/client';

<UnshieldTokensButton
 amount={100}
  recipient={recipientPubkey}
  onSuccess={(sig) => console.log('Unshielded:', sig)}
/>
```

### 5. AIAgentManager

Manages AI agents running in Trusted Execution Environments (TEE).

**Features:**
- Register agents with TEE attestation
- Execute automated trading strategies
- Monitor agent performance and trust scores
- Manage agent capabilities

**Usage:**
```tsx
import { AIAgentManager } from '@dark-protocol/client';

<AIAgentManager
  onAgentRegistered={(pubkey) => console.log('Registered:', pubkey)}
  onActionExecuted={(sig) => console.log('Action executed:', sig)}
/>
```

**AI Agent Actions:**
- **Market Analysis (0)**: Analyze market conditions privately
- **DCA Trade (1)**: Execute dollar-cost averaging
- **Portfolio Rebalance (2)**: Rebalance holdings automatically
- **Yield Optimization (3)**: Find and execute best yields
- **Risk Assessment (4)**: Assess portfolio risk

## Integration with Solana Wallet Adapter

All components use standard Solana wallet adapter hooks:

```tsx
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter, BackpackWalletAdapter } from '@solana/wallet-adapter-wallets';

const wallets = [
  new PhantomWalletAdapter(),
  new BackpackWalletAdapter(),
];

function App() {
  return (
    <WalletProvider wallets={wallets} autoConnect>
      <YourComponents />
    </WalletProvider>
  );
}
```

## Privacy Features

### Zero-Knowledge Proofs

All private operations use ZK-SNARKs to prove:
1. **Ownership**: User owns the notes being spent
2. **Conservation**: Input amounts equal output amounts
3. **Validity**: All commitments are properly formed
4. **Existence**: Notes exist in the merkle tree

### Note Management

The client automatically manages shielded notes:
- **Creation**: When shielding tokens
- **Selection**: Choosing notes for transactions
- **Tracking**: Monitoring spent/unspent status
- **Storage**: Secure local note database

### Encryption

Multiple layers of encryption protect user privacy:
- **Note Encryption**: ChaCha20-Poly1305 for note data
- **Memo Encryption**: End-to-end encrypted messages
- **Agent Parameters**: Encrypted AI agent inputs

## Jupiter Integration

Private swaps leverage Jupiter's DEX aggregation:

```typescript
// Fetch best route
const route = await client.getJupiterRoute({
  inputMint,
  outputMint,
  amount,
  slippageBps: 100, // 1%
});

// Execute private swap
const tx = await client.privateSwap({
  inputAmount,
  inputCommitment,
  outputCommitment,
  jupiterRoutePlan: serialize(route),
});
```

## Error Handling

All components include comprehensive error handling:

```tsx
<ShieldTokensButton
  amount={100}
  onError={(error) => {
    if (error.message.includes('Insufficient balance')) {
      // Handle insufficient balance
    } else if (error.message.includes('Network')) {
      // Handle network errors
    }
    // Log or display error
    console.error('Shield error:', error);
  }}
/>
```

## Best Practices

### 1. Note Selection

Always ensure sufficient shielded balance:
```typescript
const notes = await client.getAvailableNotes(publicKey);
const totalBalance = notes.reduce((sum, note) => sum + note.amount, 0);
```

### 2. Transaction Confirmation

Wait for confirmation before updating UI:
```typescript
await connection.confirmTransaction({
  signature,
  blockhash,
  lastValidBlockHeight,
}, 'confirmed');
```

### 3. Privacy Preservation

- Never log sensitive data (commitments, nullifiers)
- Use ephemeral keys for maximum privacy
- Batch transactions when possible

### 4. TEE Verification

Always verify AI agent attestations:
```typescript
const isValid = await client.verifyTEEAttestation(attestation);
if (!isValid) throw new Error('Invalid TEE attestation');
```

## Security Considerations

### Client-Side Security

1. **Key Management**: Never store spending keys in plain text
2. **Note Storage**: Encrypt local note database
3. **Network Security**: Use HTTPS for all API calls
4. **Input Validation**: Validate all user inputs

### On-Chain Security

1. **Nullifier Verification**: Prevents double-spending
2. **Proof Verification**: Validates all ZK proofs
3. **Merkle Root Checking**: Ensures note existence
4. **Authority Checks**: Validates transaction signers

### TEE Security

1. **Attestation Verification**: Proves code integrity
2. **Measurement Validation**: Ensures correct execution
3. **Trust Score Monitoring**: Tracks agent performance
4. **Automatic Deactivation**: Disables low-trust agents

## Performance Optimization

### 1. Batch Operations

Combine multiple operations:
```typescript
const transactions = await Promise.all([
  client.shieldTokens(...),
  client.privateTransfer(...),
]);
```

### 2. Proof Caching

Cache generated proofs when possible:
```typescript
const proofCache = new Map();
const cachedProof = proofCache.get(noteHash);
```

### 3. Route Optimization

Fetch Jupiter routes in advance:
```typescript
const route = await client.getJupiterRoute(...);
// Cache route for user review
setRoute(route);
```

## Testing

### Unit Tests

```typescript
describe('ShieldTokensButton', () => {
  it('should shield tokens successfully', async () => {
    const { result } = renderHook(() => useShieldTokens());
    await result.current.shield(100, tokenMint);
    expect(result.current.loading).toBe(false);
  });
});
```

### Integration Tests

```typescript
describe('Private Transfer Flow', () => {
  it('should complete end-to-end transfer', async () => {
    await shield(100);
    await privateTransfer(recipient, 50);
    await unshield(50);
  });
});
```

## Browser Extension Support

The components are designed to work seamlessly with browser extensions (e.g., Backpack, Phantom):

```typescript
// Access extension connection
// @ts-ignore
const connection = window.backpack.connection;

// Use standard wallet adapter
const wallet = useWallet();
const signature = await wallet.sendTransaction(tx, connection);
```

## Roadmap

### Phase 1 (Current)
- ✅ Basic privacy components
- ✅ Jupiter integration
- ✅ AI agent management
- ✅ Wallet adapter integration

### Phase 2 (Q1 2025)
- [ ] Mobile wallet support
- [ ] Hardware wallet integration
- [ ] Multi-sig support
- [ ] Advanced note management UI

### Phase 3 (Q2 2025)
- [ ] Privacy pools UI
- [ ] Governance interface
- [ ] Analytics dashboard
- [ ] Cross-chain bridge UI

## Support

For issues and questions:
- GitHub: https://github.com/dark-protocol/dark-protocol
- Discord: https://discord.gg/dark-protocol
- Docs: https://docs.dark-protocol.io

## License

Apache 2.0 - See LICENSE file for details

---

**Privacy is a right, not a privilege. Build with Dark Protocol.**
