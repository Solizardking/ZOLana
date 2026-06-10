import React, { useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { createDarkProtocolClient } from '../../sdk/dark-protocol';

const PrivateTransfer: React.FC = () => {
  const wallet = useWallet();
  const { publicKey } = wallet;
  const { connection } = useConnection();
  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('0.1');
  const [memo, setMemo] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');

  const handleTransfer = async () => {
    if (!publicKey) {
      alert('Please connect your wallet first');
      return;
    }

    if (!recipientAddress.startsWith('zs1')) {
      alert('Please enter a valid shielded address (starts with zs1)');
      return;
    }

    setIsLoading(true);
    setStatus('Creating private transfer...');

    try {
      // Create Dark Protocol client
      const darkClient = createDarkProtocolClient(connection, wallet);

      // Execute private transfer
      const signature = await darkClient.privateTransfer(
        recipientAddress,
        parseFloat(amount),
        memo
      );

      setStatus(`Successfully sent ${amount} SOL privately! 🎉\nTransaction: ${signature.slice(0, 20)}...`);
      setRecipientAddress('');
      setAmount('0.1');
      setMemo('');
    } catch (error: any) {
      console.error('Transfer error:', error);
      setStatus(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold mb-2 bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">
          → Private Transfer
        </h3>
        <p className="text-gray-400">
          Send SOL privately between shielded addresses
        </p>
      </div>

      <div className="space-y-4">
        <div className="bg-pink-500/10 border border-pink-500/30 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Available for Transfer:</span>
            <span className="text-2xl font-bold text-pink-400">0.0000 SOL</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Recipient Shielded Address
          </label>
          <input
            type="text"
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            className="input font-mono text-sm"
            placeholder="zs1abc123def456..."
            disabled={isLoading}
          />
          <p className="mt-1 text-xs text-gray-500">
            Must be a 43-byte Sapling shielded address (starts with zs1)
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
            Private Memo (Optional)
          </label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            maxLength={512}
            className="input min-h-[100px]"
            placeholder="Private message (encrypted for recipient only)"
            disabled={isLoading}
          />
          <p className="mt-1 text-xs text-gray-500">
            {memo.length} / 512 characters • Only recipient can read this
          </p>
        </div>

        <button
          onClick={handleTransfer}
          disabled={!publicKey || isLoading || parseFloat(amount) <= 0 || !recipientAddress}
          className="w-full bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700 text-white font-bold py-3 px-6 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
        >
          {isLoading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Sending Privately...
            </span>
          ) : (
            `→ Send ${amount} SOL Privately`
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

      <div className="bg-pink-500/10 border border-pink-500/30 rounded-lg p-4">
        <h4 className="font-semibold mb-2 flex items-center text-pink-400">
          <span className="mr-2">ℹ️</span>
          Complete Privacy
        </h4>
        <ul className="text-sm text-gray-400 space-y-1">
          <li>✓ Sender identity hidden</li>
          <li>✓ Receiver identity hidden</li>
          <li>✓ Transaction amount hidden</li>
          <li>✓ Memo encrypted (only recipient can read)</li>
          <li>✓ Transaction graph obfuscated</li>
          <li>✓ Takes ~800ms to confirm</li>
        </ul>
      </div>
    </div>
  );
};

export default PrivateTransfer;
