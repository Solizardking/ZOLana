/**
 * DarkSwap Component Usage Examples
 * Privacy-enhanced Jupiter Swap with Dark Protocol integration
 */

import DarkSwap from './DarkSwap';

// ============================================================================
// Example 1: Basic Usage with Privacy Enabled (Default)
// ============================================================================

export function BasicDarkSwap() {
  return (
    <DarkSwap
      heliusApiKey={process.env.NEXT_PUBLIC_HELIUS_API_KEY as string}
      rpcUrl={process.env.NEXT_PUBLIC_RPC_URL}
      referralKey={process.env.NEXT_PUBLIC_REFERRAL_KEY as string}
      platformFeeBps={20}
      apiKey={process.env.NEXT_PUBLIC_JUP_SWAP_V1_API_KEY as string}
      enablePrivacy={true}
      defaultPrivacyMode={false}
    />
  );
}

// ============================================================================
// Example 2: Privacy-First Mode (Always On)
// ============================================================================

export function PrivacyFirstSwap() {
  return (
    <DarkSwap
      heliusApiKey={process.env.NEXT_PUBLIC_HELIUS_API_KEY as string}
      apiKey={process.env.NEXT_PUBLIC_JUP_SWAP_V1_API_KEY as string}
      enablePrivacy={true}
      defaultPrivacyMode={true} // Privacy enabled by default
      platformFeeBps={20}
    />
  );
}

// ============================================================================
// Example 3: Standard Swap (No Privacy Features)
// ============================================================================

export function StandardSwap() {
  return (
    <DarkSwap
      heliusApiKey={process.env.NEXT_PUBLIC_HELIUS_API_KEY as string}
      apiKey={process.env.NEXT_PUBLIC_JUP_SWAP_V1_API_KEY as string}
      enablePrivacy={false} // Disable privacy features
    />
  );
}

// ============================================================================
// Example 4: Custom RPC and Referral
// ============================================================================

export function CustomConfigSwap() {
  return (
    <DarkSwap
      heliusApiKey={process.env.NEXT_PUBLIC_HELIUS_API_KEY as string}
      rpcUrl="https://api.devnet.solana.com" // Custom RPC
      referralKey="YOUR_REFERRAL_PUBKEY_HERE"
      platformFeeBps={50} // 0.5% platform fee
      apiKey={process.env.NEXT_PUBLIC_JUP_SWAP_V1_API_KEY as string}
      enablePrivacy={true}
    />
  );
}

// ============================================================================
// Example 5: Full Page Implementation with Next.js App Router
// ============================================================================

export default function SwapPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-purple-900 via-black to-blue-900">
      <DarkSwap
        heliusApiKey={process.env.NEXT_PUBLIC_HELIUS_API_KEY as string}
        apiKey={process.env.NEXT_PUBLIC_JUP_SWAP_V1_API_KEY as string}
        enablePrivacy={true}
        defaultPrivacyMode={false}
      />
    </div>
  );
}

// ============================================================================
// Example 6: Embedded in Dashboard
// ============================================================================

export function DashboardWithSwap() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
      {/* Portfolio Section */}
      <div className="lg:col-span-2">
        <div className="bg-gray-900 rounded-lg p-6">
          <h2 className="text-2xl font-bold text-white mb-4">Portfolio</h2>
          {/* Portfolio content */}
        </div>
      </div>

      {/* Swap Section */}
      <div className="lg:col-span-1">
        <DarkSwap
          heliusApiKey={process.env.NEXT_PUBLIC_HELIUS_API_KEY as string}
          apiKey={process.env.NEXT_PUBLIC_JUP_SWAP_V1_API_KEY as string}
          enablePrivacy={true}
          defaultPrivacyMode={true}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Environment Variables Required (.env.local)
// ============================================================================

/*
NEXT_PUBLIC_HELIUS_API_KEY=your_helius_api_key_here
NEXT_PUBLIC_JUP_SWAP_V1_API_KEY=your_jupiter_api_key_here
NEXT_PUBLIC_RPC_URL=https://mainnet.helius-rpc.com/?api-key=your_helius_api_key
NEXT_PUBLIC_REFERRAL_KEY=your_referral_pubkey_here
*/

// ============================================================================
// Package.json Dependencies
// ============================================================================

/*
{
  "dependencies": {
    "react": "^18.2.0",
    "next": "^14.0.0",
    "jupiverse-kit": "^1.0.0",
    "@solana/web3.js": "^1.91.0",
    "@dark-protocol/sdk": "^0.1.0",
    "tailwindcss": "^3.4.0"
  }
}
*/

// ============================================================================
// Features Overview
// ============================================================================

/*
DarkSwap Component Features:

1. Privacy Controls
   - Toggle privacy mode on/off
   - Real-time privacy status indicator
   - Shielded balance tracking
   - ZK-SNARK proof generation indicator

2. Privacy Features (When Enabled)
   - Hidden transaction amounts (via commitments)
   - Private sender/receiver identities
   - Groth16 ZK-SNARK proofs (256 bytes)
   - Nullifier-based double-spend prevention
   - Merkle tree commitment tracking

3. Advanced Settings
   - Adjustable slippage tolerance (basis points)
   - Customizable priority fees
   - Shielded address toggle
   - ZK proof generation toggle

4. UI/UX Enhancements
   - Privacy stats sidebar (shielded balance, status, proof type)
   - Loading overlay during proof generation
   - Error handling with user-friendly messages
   - Gradient background with purple theme
   - Responsive design

5. Integration
   - Wraps Jupiter's Swap component from jupiverse-kit
   - Seamless Dark Protocol SDK integration
   - Helius RPC optimization
   - Real-time quote fetching

6. Visual Indicators
   - Animated pulse for active privacy mode
   - Color-coded status (green = active, gray = inactive)
   - Privacy feature icons (🔒, 🛡️, ⚡)
   - Progress spinner during proof generation
*/
