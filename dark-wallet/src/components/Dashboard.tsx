import React, { useEffect, useMemo, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import ShieldTokens from './wallet/ShieldTokens';
import UnshieldTokens from './wallet/UnshieldTokens';
import PrivateTransfer from './wallet/PrivateTransfer';
import PaperWallet from './wallet/PaperWallet';
import HeliusViz from './HeliusViz';
import { formatNetworkLabel, getDarkRuntimeConfig } from '../utils/runtime';
import { getShieldedBalanceSol, SHIELDED_LEDGER_EVENT } from '../sdk/shielded-ledger';

type WalletTab = 'shield' | 'unshield' | 'transfer' | 'paper' | 'helius';

const tabs: Array<{ id: WalletTab; label: string }> = [
  { id: 'shield', label: 'Shield' },
  { id: 'unshield', label: 'Unshield' },
  { id: 'transfer', label: 'Private Transfer' },
  { id: 'paper', label: 'Paper Wallet' },
  { id: 'helius', label: 'HeliusViz' },
];

const Dashboard: React.FC = () => {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const runtime = useMemo(() => getDarkRuntimeConfig(), []);
  const [activeTab, setActiveTab] = useState<WalletTab>('paper');
  const [balance, setBalance] = useState<number>(0);
  const [shieldedBalance, setShieldedBalance] = useState<number>(0);
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
          if (isMounted) setShieldedBalance(getShieldedBalanceSol(publicKey.toBase58()));
        } else if (isMounted) {
          setBalance(0);
          setShieldedBalance(0);
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

  useEffect(() => {
    function syncShieldedLedger() {
      setShieldedBalance(publicKey ? getShieldedBalanceSol(publicKey.toBase58()) : 0);
    }

    syncShieldedLedger();
    window.addEventListener(SHIELDED_LEDGER_EVENT, syncShieldedLedger);
    return () => window.removeEventListener(SHIELDED_LEDGER_EVENT, syncShieldedLedger);
  }, [publicKey]);

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <section className="dashboard-grid">
        <div className="metric-card">
          <h3 className="metric-label">Transparent</h3>
          <div className="metric-value">
            {balance.toFixed(4)} SOL
          </div>
          <p className="metric-note">
            {connected ? 'Read from connected wallet' : 'Connect wallet for live balance'}
          </p>
        </div>

        <div className="metric-card">
          <h3 className="metric-label">Shielded</h3>
          <div className="metric-value signal">
            {shieldedBalance.toFixed(4)} SOL
          </div>
          <p className="metric-note">Local note ledger and staged commitments</p>
        </div>

        <div className="metric-card">
          <h3 className="metric-label">Network</h3>
          <div className="metric-value">
            {formatNetworkLabel(runtime.defaultNetwork)}
          </div>
          <p className="metric-note">
            {runtime.heliusRpcUrl || runtime.heliusApiKey ? 'Helius RPC configured' : 'Public RPC fallback'}
          </p>
        </div>

        <div className="metric-card">
          <h3 className="metric-label">Slot</h3>
          <div className="metric-value">
            {slot ?? 'offline'}
          </div>
          <p className="metric-note">
            {runtime.xaiApiKey ? 'Dark Clawd xAI sidecar ready' : 'Set XAI_API_KEY for agent review'}
          </p>
        </div>
      </section>

      <section className="card tab-card">
        <div className="tab-rail">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`tab-button ${activeTab === tab.id ? 'tab-button-active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === 'helius' ? (
        <section className="module-panel">
          <HeliusViz />
        </section>
      ) : !connected && activeTab !== 'paper' ? (
        <section className="card connect-panel module-panel">
          <p className="section-kicker">Wallet Required</p>
          <h2 className="connect-title">
            Connect a Solana wallet
          </h2>
          <p className="connect-copy mx-auto">
            Shielding, unshielding, and private transfers need an injected wallet.
            The paper-wallet tab works offline and can be used without connecting.
          </p>
        </section>
      ) : (
        <section className="card module-panel">
          {activeTab === 'shield' && <ShieldTokens />}
          {activeTab === 'unshield' && <UnshieldTokens />}
          {activeTab === 'transfer' && <PrivateTransfer />}
          {activeTab === 'paper' && <PaperWallet />}
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <h4 className="footer-title">Port Status</h4>
          <ul className="footer-list">
            <li>Zcash paper flow adapted to Solana keypairs</li>
            <li>Devnet/mainnet-beta selected through env</li>
            <li>Helius RPC supported through key or full URL</li>
          </ul>
        </div>

        <div className="card">
          <h4 className="footer-title">Privacy</h4>
          <ul className="footer-list">
            <li>Shielded address UX preserved</li>
            <li>Paper wallet secret reveal is explicit</li>
            <li>Private payment receipts carry commitments</li>
          </ul>
        </div>

        <div className="card">
          <h4 className="footer-title">Agent</h4>
          <ul className="footer-list">
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
