# DarkSwap Component

Privacy-enhanced Jupiter Swap interface with Dark Protocol integration.

## Overview

`DarkSwap` is a React component that wraps Jupiter's Swap component from `jupiverse-kit` and adds Dark Protocol's privacy features including:

- **Zero-Knowledge Proofs**: Hide transaction amounts using Groth16 ZK-SNARKs
- **Shielded Addresses**: Private sender/receiver identities  
- **Nullifier System**: Prevent double-spending
- **Merkle Tree Commitments**: Track private balances on-chain

## Installation

```bash
npm install react next jupiverse-kit @solana/web3.js @dark-protocol/sdk tailwindcss
# or
yarn add react next jupiverse-kit @solana/web3.js @dark-protocol/sdk tailwindcss
# or
pnpm add react next jupiverse-kit @solana/web3.js @dark-protocol/sdk tailwindcss
```

## Basic Usage

```tsx
import DarkSwap from './components/DarkSwap';

export default function SwapPage() {
  return (
    <DarkSwap
      heliusApiKey={process.env.NEXT_PUBLIC_HELIUS_API_KEY as string}
      apiKey={process.env.NEXT_PUBLIC_JUP_SWAP_V1_API_KEY as string}
      enablePrivacy={true}
      defaultPrivacyMode={false}
    />
  );
}
```

## Props

| Prop | Type | Default | Required | Description |
|------|------|---------|----------|-------------|
| `heliusApiKey` | `string` | - | ✅ | Helius API key for RPC access |
| `apiKey` | `string` | `process.env.NEXT_PUBLIC_JUP_SWAP_V1_API_KEY` | ❌ | Jupiter API key |
| `rpcUrl` | `string` | `process.env.NEXT_PUBLIC_RPC_URL` or `"https://api.mainnet-beta.solana.com"` | ❌ | Custom RPC URL |
| `referralKey` | `string` | `process.env.NEXT_PUBLIC_REFERRAL_KEY` | ❌ | Referral public key |
| `platformFeeBps` | `number` | `20` | ❌ | Platform fee in basis points |
| `enablePrivacy` | `boolean` | `true` | ❌ | Enable privacy features |
| `defaultPrivacyMode` | `boolean` | `false` | ❌ | Start with privacy enabled |

## Environment Variables

Create a `.env.local` file in your project root:

```bash
# Required
NEXT_PUBLIC_HELIUS_API_KEY=your_helius_api_key_here

# Optional
NEXT_PUBLIC_JUP_SWAP_V1_API_KEY=your_jupiter_api_key_here
NEXT_PUBLIC_RPC_URL=https://mainnet.helius-rpc.com/?api-key=your_helius_api_key
NEXT_PUBLIC_REFERRAL_KEY=your_referral_pubkey_here
```

## Features

### 1. Privacy Controls

- **Toggle Switch**: Turn privacy on/off with a single click
- **Status Indicator**: Animated pulse shows when privacy is active
- **Real-time Updates**: Privacy settings update immediately

```tsx
<DarkSwap
  enablePrivacy={true}
  defaultPrivacyMode={true} // Start with privacy ON
/>
```

### 2. Privacy Stats Sidebar

When privacy is enabled, displays:
- Shielded balance
- Privacy status
- Privacy level
- Proof type (Groth16)

### 3. Advanced Settings

Collapsible panel for power users:
- Slippage tolerance (basis points)
- Priority fee (micro-lamports)
- Shielded address toggle
- ZK proof generation toggle

### 4. Loading States

- **ZK Proof Generation**: Shows spinner while generating proofs
- **Error Handling**: User-friendly error messages
- **Progress Indicators**: Clear feedback during operations

## Examples

### Example 1: Privacy-First Mode

```tsx
export function PrivacyFirstSwap() {
  return (
    <DarkSwap
      heliusApiKey={process.env.NEXT_PUBLIC_HELIUS_API_KEY as string}
      apiKey={process.env.NEXT_PUBLIC_JUP_SWAP_V1_API_KEY as string}
      enablePrivacy={true}
      defaultPrivacyMode={true} // Privacy always on
      platformFeeBps={20}
    />
  );
}
```

### Example 2: Standard Swap (No Privacy)

```tsx
export function StandardSwap() {
  return (
    <DarkSwap
      heliusApiKey={process.env.NEXT_PUBLIC_HELIUS_API_KEY as string}
      apiKey={process.env.NEXT_PUBLIC_JUP_SWAP_V1_API_KEY as string}
      enablePrivacy={false} // Disable privacy
    />
  );
}
```

### Example 3: Embedded in Dashboard

```tsx
export function DashboardWithSwap() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
      <div className="lg:col-span-2">
        {/* Portfolio content */}
      </div>
      <div className="lg:col-span-1">
        <DarkSwap
          heliusApiKey={process.env.NEXT_PUBLIC_HELIUS_API_KEY as string}
          apiKey={process.env.NEXT_PUBLIC_JUP_SWAP_V1_API_KEY as string}
          enablePrivacy={true}
        />
      </div>
    </div>
  );
}
```

### Example 4: Custom RPC Configuration

```tsx
export function CustomConfigSwap() {
  return (
    <DarkSwap
      heliusApiKey={process.env.NEXT_PUBLIC_HELIUS_API_KEY as string}
      rpcUrl="https://api.devnet.solana.com"
      referralKey="YOUR_REFERRAL_PUBKEY"
      platformFeeBps={50} // 0.5% fee
      apiKey={process.env.NEXT_PUBLIC_JUP_SWAP_V1_API_KEY as string}
    />
  );
}
```

## Privacy Architecture

### What's Hidden

✅ **Transaction Amounts**: Hidden via cryptographic commitments  
✅ **Sender Identity**: Hidden via zero-knowledge proofs  
✅ **Receiver Identity**: Hidden via shielded addresses  
✅ **Token Balances**: Shielded pool tracks private balances

### What's Public

⚠️ **Program Interactions**: Jupiter program calls are visible  
⚠️ **Timing**: Transaction timestamps are public  
⚠️ **Route Plans**: DEX routing visible (amounts hidden)

### ZK Proof Structure

```
Groth16 Proof (256 bytes):
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
1. User selects tokens and amount
2. Toggle privacy mode ON
3. Component generates:
   - Input commitment
   - Output commitment
   - Nullifier
   - ZK proof (Groth16)
4. Get Jupiter quote
5. Build transaction
6. Submit to Dark Protocol
7. On-chain verification:
   - Verify ZK proof
   - Check nullifier (prevent double-spend)
   - Execute Jupiter swap
   - Update merkle tree
8. Return transaction signature
```

## Styling

The component uses Tailwind CSS with a purple/black gradient theme:

```tsx
<div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-purple-900 via-black to-blue-900">
  <DarkSwap {...props} />
</div>
```

### Color Scheme

- **Primary**: Purple (`purple-500`, `purple-600`)
- **Background**: Dark (`gray-900`, `black`)
- **Accents**: Blue gradient
- **Success**: Green (`green-500`)
- **Error**: Red (`red-500`)
- **Warning**: Yellow (`yellow-500`)

## TypeScript Support

Full TypeScript support with type definitions:

```typescript
interface DarkSwapProps {
  rpcUrl?: string;
  referralKey?: string;
  platformFeeBps?: number;
  apiKey?: string;
  heliusApiKey: string;
  enablePrivacy?: boolean;
  defaultPrivacyMode?: boolean;
}

interface PrivacySettings {
  enabled: boolean;
  useShieldedAddress: boolean;
  generateProof: boolean;
  slippageBps: number;
  priorityFee: number;
}
```

## Performance

- **Initial Load**: ~1-2s (SDK initialization)
- **Quote Fetching**: ~200-500ms
- **ZK Proof Generation**: ~2-5s (simulated)
- **Transaction Submission**: ~1-3s
- **Confirmation**: ~400ms-1s (Solana finality)

## Security Considerations

⚠️ **Pre-Audit**: Component is in development  
⚠️ **Do Not Use**: With real funds until audited  
⚠️ **Test First**: Use devnet for testing

### Best Practices

1. **Always verify proofs**: Never skip ZK proof verification
2. **Monitor errors**: Handle all error states gracefully
3. **Validate inputs**: Check all user inputs before processing
4. **Secure keys**: Never expose private keys or mnemonics
5. **Test thoroughly**: Use devnet before mainnet

## Troubleshooting

### Privacy Toggle Not Working

```tsx
// Ensure enablePrivacy is true
<DarkSwap enablePrivacy={true} />
```

### API Key Errors

```bash
# Check environment variables
echo $NEXT_PUBLIC_HELIUS_API_KEY
echo $NEXT_PUBLIC_JUP_SWAP_V1_API_KEY
```

### Proof Generation Timeout

```tsx
// Increase timeout or disable proof generation during development
setPrivacySettings({
  ...prev,
  generateProof: false // Disable for testing
})
```

### RPC Connection Issues

```tsx
// Use Helius RPC for better reliability
<DarkSwap
  rpcUrl="https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"
/>
```

## Browser Compatibility

✅ Chrome 90+  
✅ Firefox 88+  
✅ Safari 14+  
✅ Edge 90+

## Related Components

- `ShieldTokensButton.tsx` - Shield transparent tokens
- `UnshieldTokensButton.tsx` - Unshield to transparent
- `PrivateTransferButton.tsx` - Private P2P transfers
- `PrivateSwapButton.tsx` - Standalone private swaps
- `AIAgentManager.tsx` - AI agent controls

## License

Apache-2.0

## Support

- **GitHub**: https://github.com/darkprotocol/dark-protocol
- **Discord**: https://discord.gg/darkprotocol
- **Docs**: https://docs.darkprotocol.xyz
- **Email**: dev@darkprotocol.xyz

## Changelog

### v0.1.0 (Current)
- Initial release
- Jupiter V6 integration
- Groth16 ZK-SNARK support
- Privacy toggle controls
- Advanced settings panel
- Real-time stats sidebar
- Error handling
- Loading states
- TypeScript support
- Tailwind CSS styling

### Roadmap

- [ ] Mobile responsive optimization
- [ ] Dark/light theme toggle
- [ ] Transaction history
- [ ] Multi-wallet support
- [ ] Hardware wallet integration
- [ ] Advanced routing options
- [ ] Price alerts
- [ ] Limit orders
- [ ] DCA (Dollar Cost Averaging)
