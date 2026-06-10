import React, { useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { createDarkProtocolClient } from '../../sdk/dark-protocol';

const UnshieldTokens: React.FC = () => {
  const wallet = useWallet();
  const { publicKey } = wallet;
  const { connection } = useConnection();
  const [amount, setAmount] = useState('0.1');
  const [recipient, setRecipient] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');

  const handleUnshield = async () => {
    if (!publicKey) {
      alert('Please connect your wallet first');
      return;
    }

    setIsLoading(true);
    setStatus('Generating ZK proof and unshielding...');

    try {
      // Create Dark Protocol client
      const darkClient = createDarkProtocolClient(connection, wallet);

      // Parse recipient address if provided
      let recipientPubkey: PublicKey | undefined;
      if (recipient) {
        try {
          recipientPubkey = new PublicKey(recipient);
        } catch (e) {
          throw new Error('Invalid recipient address');
        }
      }

      // Unshield tokens using Dark Protocol (includes ZK proof generation)
      const signature = await darkClient.unshieldTokens(parseFloat(amount), recipientPubkey);

      setStatus(`Successfully unshielded ${amount} SOL! 🎉\nTransaction: ${signature.slice(0, 20)}...`);
      setAmount('0.1');
      setRecipient('');
    } catch (error: any) {
      console.error('Unshield error:', error);
      setStatus(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold mb-2 bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
          🔓 Unshield Tokens
        </h3>
        <p className="text-gray-400">
          Convert shielded SOL back to transparent SOL with zero-knowledge proof
        </p>
      </div>

      <div className="space-y-4">
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Shielded Balance:</span>
            <span className="text-2xl font-bold text-emerald-400">0.0000 SOL</span>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            No shielded notes found. Shield some tokens first!
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Amount (SOL)
          </label>
          <input
            type="number"
            step="0.01"
            min="0.001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input"
            placeholder="0.1"
            disabled={isLoading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Recipient Address (Optional)
          </label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="input"
            placeholder={publicKey?.toBase58() || 'Your wallet address'}
            disabled={isLoading}
          />
          <p className="mt-1 text-xs text-gray-500">
            Leave empty to send to your connected wallet
          </p>
        </div>

        <button
          onClick={handleUnshield}
          disabled={!publicKey || isLoading || parseFloat(amount) <= 0}
          className="btn-secondary w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Generating ZK Proof...
            </span>
          ) : (
            `🔓 Unshield ${amount} SOL`
          )}
        </button>

        {status && (
          <div className={`p-4 rounded-lg ${
            status.includes('Error')
              ? 'bg-red-500/20 border border-red-500/50 text-red-400'
              : 'bg-green-500/20 border border-green-500/50 text-green-400'
          }`}>
            {status}
          </div>
        )}
      </div>

      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
        <h4 className="font-semibold mb-2 flex items-center text-emerald-400">
          <span className="mr-2">ℹ️</span>
          How Unshielding Works
        </h4>
        <ul className="text-sm text-gray-400 space-y-1">
          <li>• Select which shielded note to spend</li>
          <li>• Generate a zero-knowledge proof of ownership</li>
          <li>• Prove you own the note without revealing which one</li>
          <li>• Mark nullifier as spent (prevents double-spending)</li>
          <li>• Receive transparent SOL at destination address</li>
          <li>• Takes ~600ms (includes ZK proof generation)</li>
        </ul>
      </div>
    </div>
  );
};

export default UnshieldTokens;
