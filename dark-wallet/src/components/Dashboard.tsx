import React, { useEffect, useMemo, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import ShieldTokens from './wallet/ShieldTokens';
import UnshieldTokens from './wallet/UnshieldTokens';
import PrivateTransfer from './wallet/PrivateTransfer';
import PaperWallet from './wallet/PaperWallet';
import HeliusViz from './HeliusViz';
import { formatNetworkLabel, getDarkRuntimeConfig } from '../utils/runtime';

type WalletTab = 'shield' | 'unshield' | 'transfer' | 'paper' | 'helius';

const tabs: Array<{ id: WalletTab; label: string; tone: string }> = [
  { id: 'shield', label: 'Shield', tone: 'from-purple-600 to-indigo-600' },
  { id: 'unshield', label: 'Unshield', tone: 'from-emerald-600 to-teal-600' },
  { id: 'transfer', label: 'Private Transfer', tone: 'from-pink-600 to-rose-600' },
  { id: 'paper', label: 'Paper Wallet', tone: 'from-cyan-600 to-emerald-600' },
  { id: 'helius', label: '🔭 HeliusViz', tone: 'from-cyan-500 to-blue-600' },
];

const Dashboard: React.FC = () => {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const runtime = useMemo(() => getDarkRuntimeConfig(), []);
  const [activeTab, setActiveTab] = useState<WalletTab>('paper');
  const [balance, setBalance] = useState<number>(0);
  const [shieldedBalance] = useState<number>(0);
  const [slot, setSlot] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function syncWallet() {
      try {
        const nextSlot = await connection.getSlot('confirmed');
        if (isMounted) setSlot(nextSlot);

        if (publicKey) {
          const lamports = await connection.getBalance(publicKey);
          if (isMounted) setBalance(lamports / LAMPORTS_PER_SOL);
        } else if (isMounted) {
          setBalance(0);
        }
      } catch {
        if (isMounted) setSlot(null);
      }
    }

    void syncWallet();
    const interval = window.setInterval(syncWallet, 20_000);
    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [publicKey, connection]);

  const activeTone = tabs.find((tab) => tab.id === activeTab)?.tone ?? tabs[0].tone;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-3">
            Transparent
          </h3>
          <div className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            {balance.toFixed(4)} SOL
          </div>
          <p className="text-sm text-gray-400 mt-2">
            {connected ? 'Read from connected wallet' : 'Connect wallet for live balance'}
          </p>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-3">
            Shielded
          </h3>
          <div className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
            {shieldedBalance.toFixed(4)} SOL
          </div>
          <p className="text-sm text-gray-400 mt-2">Private notes and staged commitments</p>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-3">
            Network
          </h3>
          <div className="text-2xl font-bold text-emerald-300">
            {formatNetworkLabel(runtime.defaultNetwork)}
          </div>
          <p className="text-sm text-gray-400 mt-2">
            {runtime.heliusRpcUrl || runtime.heliusApiKey ? 'Helius RPC configured' : 'Public RPC fallback'}
          </p>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-3">
            Slot
          </h3>
          <div className="text-2xl font-bold text-cyan-300">
            {slot ?? 'offline'}
          </div>
          <p className="text-sm text-gray-400 mt-2">
            {runtime.xaiApiKey ? 'Dark Clawd xAI sidecar ready' : 'Set XAI_API_KEY for agent review'}
          </p>
        </div>
      </section>

      <section className="card">
        <div className="flex flex-wrap gap-3 border-b border-gray-800 pb-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 rounded-lg font-semibold transition-all ${
                activeTab === tab.id
                  ? `bg-gradient-to-r ${tab.tone} text-white shadow-lg`
                  : 'bg-gray-950 text-gray-400 hover:text-white border border-gray-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === 'helius' ? (
        <section>
          <HeliusViz />
        </section>
      ) : !connected && activeTab !== 'paper' ? (
        <section className="card text-center py-14">
          <h2 className={`text-3xl font-bold mb-4 bg-gradient-to-r ${activeTone} bg-clip-text text-transparent`}>
            Connect a Solana wallet
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Shielding, unshielding, and private transfers need an injected wallet.
            The paper-wallet tab works offline and can be used without connecting.
          </p>
        </section>
      ) : (
        <section className="card">
          {activeTab === 'shield' && <ShieldTokens />}
          {activeTab === 'unshield' && <UnshieldTokens />}
          {activeTab === 'transfer' && <PrivateTransfer />}
          {activeTab === 'paper' && <PaperWallet />}
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <h4 className="font-semibold mb-3 text-gray-200">Port Status</h4>
          <ul className="text-sm text-gray-400 space-y-2">
            <li>Zcash paper flow adapted to Solana keypairs</li>
            <li>Devnet/mainnet-beta selected through env</li>
            <li>Helius RPC supported through key or full URL</li>
          </ul>
        </div>

        <div className="card">
          <h4 className="font-semibold mb-3 text-gray-200">Privacy</h4>
          <ul className="text-sm text-gray-400 space-y-2">
            <li>Shielded address UX preserved</li>
            <li>Paper wallet secret reveal is explicit</li>
            <li>Private payment receipts carry commitments</li>
          </ul>
        </div>

        <div className="card">
          <h4 className="font-semibold mb-3 text-gray-200">Agent</h4>
          <ul className="text-sm text-gray-400 space-y-2">
            <li>Dark Clawd uses xAI when configured</li>
            <li>Agent only reviews public metadata</li>
            <li>x402/AP2/M2M payment rail selection is staged</li>
          </ul>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
