import React, { useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import ShieldTokens from './wallet/ShieldTokens';
import UnshieldTokens from './wallet/UnshieldTokens';
import PrivateTransfer from './wallet/PrivateTransfer';

const Dashboard: React.FC = () => {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const [activeTab, setActiveTab] = useState<'shield' | 'unshield' | 'transfer'>('shield');
  const [balance, setBalance] = useState<number>(0);
  const [shieldedBalance, setShieldedBalance] = useState<number>(0);

  // Fetch transparent balance
  React.useEffect(() => {
    if (publicKey) {
      connection.getBalance(publicKey).then(bal => {
        setBalance(bal / LAMPORTS_PER_SOL);
      });
    }
  }, [publicKey, connection]);

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-32 h-32 mb-8 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center animate-pulse-slow">
          <span className="text-6xl">🔒</span>
        </div>
        <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
          Welcome to Dark Wallet
        </h2>
        <p className="text-xl text-gray-400 mb-8 max-w-2xl text-center">
          The first Zcash Sapling-compatible privacy wallet for Solana
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl">
          <div className="card text-center">
            <div className="text-4xl mb-3">⚡</div>
            <h3 className="text-lg font-bold mb-2">180x Faster</h3>
            <p className="text-sm text-gray-400">400ms finality vs 75s on Zcash</p>
          </div>
          <div className="card text-center">
            <div className="text-4xl mb-3">💰</div>
            <h3 className="text-lg font-bold mb-2">50x Cheaper</h3>
            <p className="text-sm text-gray-400">$0.0002 vs $0.01 on Zcash</p>
          </div>
          <div className="card text-center">
            <div className="text-4xl mb-3">🔐</div>
            <h3 className="text-lg font-bold mb-2">Full Privacy</h3>
            <p className="text-sm text-gray-400">Zcash Sapling cryptography</p>
          </div>
        </div>
        <div className="mt-12 text-center">
          <p className="text-gray-500 mb-4">Connect your wallet to get started</p>
          <div className="animate-bounce text-purple-400 text-2xl">↑</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Transparent Balance */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-300">Transparent Balance</h3>
            <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <span className="text-xl">👁️</span>
            </div>
          </div>
          <div className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            {balance.toFixed(4)} SOL
          </div>
          <p className="text-sm text-gray-400">Public balance • Visible to everyone</p>
        </div>

        {/* Shielded Balance */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-300">Shielded Balance</h3>
            <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <span className="text-xl">🔒</span>
            </div>
          </div>
          <div className="text-4xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
            {shieldedBalance.toFixed(4)} SOL
          </div>
          <p className="text-sm text-gray-400">Private balance • Hidden from everyone</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="card mb-6">
        <div className="flex space-x-4 border-b border-gray-800 pb-4">
          <button
            onClick={() => setActiveTab('shield')}
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${
              activeTab === 'shield'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            🔒 Shield
          </button>
          <button
            onClick={() => setActiveTab('unshield')}
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${
              activeTab === 'unshield'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            🔓 Unshield
          </button>
          <button
            onClick={() => setActiveTab('transfer')}
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${
              activeTab === 'transfer'
                ? 'bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-lg'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            →  Private Transfer
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="card">
        {activeTab === 'shield' && <ShieldTokens />}
        {activeTab === 'unshield' && <UnshieldTokens />}
        {activeTab === 'transfer' && <PrivateTransfer />}
      </div>

      {/* Info Section */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <h4 className="font-semibold mb-3 flex items-center">
            <span className="text-2xl mr-2">📊</span>
            Performance
          </h4>
          <ul className="text-sm text-gray-400 space-y-2">
            <li>• Finality: ~400ms</li>
            <li>• Fee: ~$0.0002</li>
            <li>• TPS: 1,000+</li>
          </ul>
        </div>

        <div className="card">
          <h4 className="font-semibold mb-3 flex items-center">
            <span className="text-2xl mr-2">🔐</span>
            Privacy
          </h4>
          <ul className="text-sm text-gray-400 space-y-2">
            <li>• Hide sender ✓</li>
            <li>• Hide receiver ✓</li>
            <li>• Hide amount ✓</li>
          </ul>
        </div>

        <div className="card">
          <h4 className="font-semibold mb-3 flex items-center">
            <span className="text-2xl mr-2">⚡</span>
            Network
          </h4>
          <ul className="text-sm text-gray-400 space-y-2">
            <li>• Network: Devnet</li>
            <li>• Status: ✓ Connected</li>
            <li>• Protocol: v1.0.0</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
