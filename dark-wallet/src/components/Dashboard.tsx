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

  const heliusReady = Boolean(runtime.heliusRpcUrl || runtime.heliusApiKey);
  const agentReady = Boolean(runtime.xaiApiKey || runtime.railWorkerUrl);
  const walletLabel = publicKey ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}` : 'offline';

  return (
    <div className="dashboard-shell">
      <section className="command-hero">
        <div className="hero-copy">
          <p className="section-kicker">Dark Wallet / SVM Port</p>
          <h2 className="hero-title">
            Cold paper custody with live Solana rails.
          </h2>
          <p className="hero-body">
            A Zcash Sapling-style paper wallet rebuilt for Solana: local key generation,
            shield/unshield intent anchors, durable private-payment receipts, and Dark Clawd rail planning.
          </p>

          <div className="hero-badges" aria-label="Runtime capabilities">
            <span className={connected ? 'status-pill status-pill-live' : 'status-pill'}>
              Wallet {connected ? walletLabel : 'not connected'}
            </span>
            <span className={heliusReady ? 'status-pill status-pill-live' : 'status-pill'}>
              {heliusReady ? 'Helius configured' : 'Public RPC fallback'}
            </span>
            <span className={agentReady ? 'status-pill status-pill-live' : 'status-pill'}>
              {agentReady ? 'Dark Clawd armed' : 'Agent offline'}
            </span>
          </div>
        </div>

        <aside className="hero-terminal" aria-label="Private rail status">
          <div className="terminal-header">
            <span>rail-plan.local</span>
            <span>{formatNetworkLabel(runtime.defaultNetwork)}</span>
          </div>
          <div className="terminal-grid">
            <div>
              <span className="terminal-label">Shielded ledger</span>
              <strong>{shieldedBalance.toFixed(4)} SOL</strong>
            </div>
            <div>
              <span className="terminal-label">Transparent</span>
              <strong>{balance.toFixed(4)} SOL</strong>
            </div>
            <div>
              <span className="terminal-label">Slot</span>
              <strong>{slot ?? 'offline'}</strong>
            </div>
            <div>
              <span className="terminal-label">Proof path</span>
              <strong>EVM + SVM</strong>
            </div>
          </div>
          <div className="terminal-line">
            <span />
            x402 / AP2 / M2M receipts are staged locally before rail-worker authorization.
          </div>
        </aside>
      </section>

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

      <section className="tab-dock">
        <div className="tab-dock-label">Operator Mode</div>
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
          <div className="connect-hint">
            Paper wallet generation remains available because private keys are generated locally and never require RPC.
          </div>
        </section>
      ) : (
        <section className="card module-panel">
          {activeTab === 'shield' && <ShieldTokens />}
          {activeTab === 'unshield' && <UnshieldTokens />}
          {activeTab === 'transfer' && <PrivateTransfer />}
          {activeTab === 'paper' && <PaperWallet />}
        </section>
      )}

      <section className="ops-grid">
        <div className="ops-card">
          <span className="ops-index">01</span>
          <h4 className="footer-title">Port Status</h4>
          <ul className="footer-list">
            <li>Zcash paper flow adapted to Solana keypairs</li>
            <li>Devnet/mainnet-beta selected through env</li>
            <li>Helius RPC supported through key or full URL</li>
          </ul>
        </div>

        <div className="ops-card">
          <span className="ops-index">02</span>
          <h4 className="footer-title">Privacy</h4>
          <ul className="footer-list">
            <li>Shielded address UX preserved</li>
            <li>Paper wallet secret reveal is explicit</li>
            <li>Private payment receipts carry commitments</li>
          </ul>
        </div>

        <div className="ops-card">
          <span className="ops-index">03</span>
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
