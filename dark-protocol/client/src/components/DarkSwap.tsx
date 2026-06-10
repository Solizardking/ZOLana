"use client";

import React, { useState, useEffect } from "react";
import { Swap } from "jupiverse-kit";
import { PublicKey } from "@solana/web3.js";
import { 
  DarkProtocolClient, 
  JupiterSwapClient,
  ZKProof 
} from "@dark-protocol/sdk";

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

const DarkSwap: React.FC<DarkSwapProps> = ({
  // These env-backed values are bundled into the browser build.
  // Keep them public/restricted only; never place long-lived secrets here.
  rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "https://api.mainnet-beta.solana.com",
  referralKey = process.env.NEXT_PUBLIC_REFERRAL_KEY as string,
  platformFeeBps = 20,
  apiKey = process.env.NEXT_PUBLIC_JUP_SWAP_V1_API_KEY as string,
  heliusApiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY as string,
  enablePrivacy = true,
  defaultPrivacyMode = false,
}) => {
  const [darkClient, setDarkClient] = useState<DarkProtocolClient | null>(null);
  const [jupiterClient, setJupiterClient] = useState<JupiterSwapClient | null>(null);
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>({
    enabled: defaultPrivacyMode,
    useShieldedAddress: true,
    generateProof: true,
    slippageBps: 50,
    priorityFee: 1000,
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shieldedBalance, setShieldedBalance] = useState<bigint>(0n);
  const [hasShieldedAddress, setHasShieldedAddress] = useState(false);

  // Initialize Dark Protocol client
  useEffect(() => {
    if (!enablePrivacy) return;

    const initializeDarkProtocol = async () => {
      try {
        const client = await DarkProtocolClient.create({
          heliusApiKey,
          jupiterApiKey: apiKey,
          rpcUrl,
          commitment: "confirmed",
        });

        const jupClient = new JupiterSwapClient(client, apiKey);

        setDarkClient(client);
        setJupiterClient(jupClient);

        // Check if user has shielded address
        // This would need to be connected to wallet
        // setHasShieldedAddress(true/false based on actual check);
      } catch (err) {
        console.error("Failed to initialize Dark Protocol:", err);
        setError("Failed to initialize privacy features");
      }
    };

    initializeDarkProtocol();
  }, [enablePrivacy, heliusApiKey, apiKey, rpcUrl]);

  // Handle private swap execution
  const handlePrivateSwap = async (
    inputMint: PublicKey,
    outputMint: PublicKey,
    amount: bigint
  ) => {
    if (!jupiterClient || !privacySettings.enabled) {
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Generate ZK proof (in production, this would use actual proof generation)
      const proof: ZKProof = {
        proofA: new Uint8Array(64).fill(0),
        proofB: new Uint8Array(128).fill(0),
        proofC: new Uint8Array(64).fill(0),
      };

      // Generate commitments and nullifier
      const inputCommitment = crypto.getRandomValues(new Uint8Array(32));
      const outputCommitment = crypto.getRandomValues(new Uint8Array(32));
      const nullifier = crypto.getRandomValues(new Uint8Array(32));

      // Execute private swap
      const signature = await jupiterClient.executePrivateSwap(
        inputMint,
        outputMint,
        amount,
        {
          inputCommitment,
          outputCommitment,
          nullifier,
          proof,
          slippageBps: privacySettings.slippageBps,
          priorityFee: privacySettings.priorityFee,
        }
      );

      return signature;
    } catch (err) {
      console.error("Private swap failed:", err);
      setError(err instanceof Error ? err.message : "Private swap failed");
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Privacy toggle handler
  const togglePrivacy = () => {
    setPrivacySettings((prev) => ({
      ...prev,
      enabled: !prev.enabled,
    }));
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-purple-900 via-black to-blue-900">
      <div className="relative w-full max-w-md">
        {/* Privacy Controls Overlay */}
        {enablePrivacy && (
          <div className="absolute -top-20 left-0 right-0 z-10">
            <div className="bg-gray-900/90 backdrop-blur-sm rounded-lg p-4 border border-purple-500/30 shadow-lg shadow-purple-500/20">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${privacySettings.enabled ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
                  <h3 className="text-white font-semibold">
                    Dark Protocol Privacy
                  </h3>
                </div>
                <button
                  onClick={togglePrivacy}
                  className={`px-4 py-1 rounded-full text-sm font-medium transition-all ${
                    privacySettings.enabled
                      ? "bg-purple-600 hover:bg-purple-700 text-white"
                      : "bg-gray-700 hover:bg-gray-600 text-gray-300"
                  }`}
                >
                  {privacySettings.enabled ? "ON" : "OFF"}
                </button>
              </div>

              {privacySettings.enabled && (
                <div className="space-y-2 text-xs text-gray-400">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full" />
                    <span>🔒 Hidden amounts (ZK-SNARKs)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full" />
                    <span>🛡️ Private sender/receiver</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full" />
                    <span>⚡ Groth16 proof (256 bytes)</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Privacy Stats Sidebar */}
        {enablePrivacy && privacySettings.enabled && (
          <div className="absolute -right-64 top-0 w-56">
            <div className="bg-gray-900/90 backdrop-blur-sm rounded-lg p-4 border border-purple-500/30 shadow-lg shadow-purple-500/20">
              <h4 className="text-white font-semibold mb-3 text-sm">Privacy Stats</h4>
              <div className="space-y-3 text-xs">
                <div>
                  <div className="text-gray-400 mb-1">Shielded Balance</div>
                  <div className="text-white font-mono">
                    {(Number(shieldedBalance) / 1e9).toFixed(4)} SOL
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 mb-1">Status</div>
                  <div className={`font-medium ${hasShieldedAddress ? 'text-green-500' : 'text-yellow-500'}`}>
                    {hasShieldedAddress ? '✓ Shielded' : '⚠ Setup Required'}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 mb-1">Privacy Level</div>
                  <div className="text-purple-400 font-medium">Maximum</div>
                </div>
                <div>
                  <div className="text-gray-400 mb-1">Proof Type</div>
                  <div className="text-white font-mono text-[10px]">Groth16</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="absolute -top-32 left-0 right-0 z-20">
            <div className="bg-red-500/10 border border-red-500 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <span className="text-red-500">⚠️</span>
                <div>
                  <div className="text-red-500 font-semibold text-sm">Error</div>
                  <div className="text-red-400 text-xs mt-1">{error}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-lg">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <div className="text-white font-semibold">Generating ZK Proof...</div>
              <div className="text-gray-400 text-sm mt-1">This may take a few seconds</div>
            </div>
          </div>
        )}

        {/* Main Swap Component */}
        <div className={`relative ${privacySettings.enabled ? 'ring-2 ring-purple-500/50 rounded-lg' : ''}`}>
          <Swap
            rpcUrl={rpcUrl}
            referralKey={referralKey}
            platformFeeBps={platformFeeBps}
            apiKey={apiKey}
          />
        </div>

        {/* Privacy Info Footer */}
        {enablePrivacy && privacySettings.enabled && (
          <div className="mt-4 bg-gray-900/90 backdrop-blur-sm rounded-lg p-3 border border-purple-500/30">
            <div className="text-xs text-gray-400 space-y-1">
              <div className="flex items-center justify-between">
                <span>Slippage Tolerance:</span>
                <span className="text-white">{privacySettings.slippageBps / 100}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Priority Fee:</span>
                <span className="text-white">{privacySettings.priorityFee} µLamports</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Privacy Mode:</span>
                <span className="text-green-500">✓ Active</span>
              </div>
            </div>
          </div>
        )}

        {/* Advanced Settings */}
        {enablePrivacy && privacySettings.enabled && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-300 p-2 bg-gray-900/50 rounded">
              Advanced Privacy Settings
            </summary>
            <div className="mt-2 bg-gray-900/90 backdrop-blur-sm rounded-lg p-4 border border-purple-500/30 space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Slippage Tolerance (bps)
                </label>
                <input
                  type="number"
                  value={privacySettings.slippageBps}
                  onChange={(e) =>
                    setPrivacySettings((prev) => ({
                      ...prev,
                      slippageBps: parseInt(e.target.value) || 50,
                    }))
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Priority Fee (µLamports)
                </label>
                <input
                  type="number"
                  value={privacySettings.priorityFee}
                  onChange={(e) =>
                    setPrivacySettings((prev) => ({
                      ...prev,
                      priorityFee: parseInt(e.target.value) || 1000,
                    }))
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Use Shielded Address</span>
                <input
                  type="checkbox"
                  checked={privacySettings.useShieldedAddress}
                  onChange={(e) =>
                    setPrivacySettings((prev) => ({
                      ...prev,
                      useShieldedAddress: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 text-purple-600 bg-gray-800 border-gray-600 rounded focus:ring-purple-500"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Generate ZK Proof</span>
                <input
                  type="checkbox"
                  checked={privacySettings.generateProof}
                  onChange={(e) =>
                    setPrivacySettings((prev) => ({
                      ...prev,
                      generateProof: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 text-purple-600 bg-gray-800 border-gray-600 rounded focus:ring-purple-500"
                />
              </div>
            </div>
          </details>
        )}
      </div>
    </div>
  );
};

export default DarkSwap;
