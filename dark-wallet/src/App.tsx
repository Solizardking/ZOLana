import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import WalletProvider from './contexts/WalletProvider';
import Dashboard from './components/Dashboard';
import './App.css';

function App() {
  return (
    <WalletProvider>
      <div className="app-shell">
        <div className="ambient-orb ambient-orb-left" aria-hidden="true" />
        <div className="ambient-orb ambient-orb-right" aria-hidden="true" />

        <header className="topbar">
          <div className="topbar-inner">
            <div className="brand">
              <div className="brand-mark" aria-hidden="true">
                <span>ZD</span>
              </div>
              <div>
                <p className="brand-eyebrow">Private SVM Rail Console</p>
                <h1 className="brand-title">ZOLana Dark Wallet</h1>
                <p className="brand-subtitle">Sapling discipline ported to Solana custody, receipts, and agent rails</p>
              </div>
            </div>

            <div className="topbar-actions">
              <div className="rail-status-chip" aria-label="Rail status">
                <span className="rail-status-dot" />
                Devnet / Mainnet-beta Ready
              </div>
              <WalletMultiButton />
            </div>
          </div>
        </header>

        <main className="app-main">
          <Dashboard />
        </main>

        <footer className="footer-vault">
          <div className="footer-inner">
            <div className="footer-callout">
              <span>Dark Protocol</span>
              <strong>Paper custody, SVM anchors, x402/AP2/M2M receipts, and EVM intent proofs in one operator surface.</strong>
            </div>

            <div className="footer-grid">
              <div>
                <h3 className="footer-title">Cold Path</h3>
                <p className="footer-copy">
                  Generate Solana key material locally, print it deliberately, and keep agent review away from secrets.
                </p>
              </div>

              <div>
                <h4 className="footer-title">Rails</h4>
                <ul className="footer-list">
                  <li>Shield / unshield intent anchors</li>
                  <li>x402, AP2, and M2M receipt handoff</li>
                  <li>EVM verifier proof export</li>
                  <li>Helius RPC ready</li>
                </ul>
              </div>

              <div>
                <h4 className="footer-title">Operators</h4>
                <ul className="footer-list">
                  <li>Use Helius RPC for production traffic</li>
                  <li>Run the rail worker for private settlement review</li>
                  <li>Export EVM proof payloads only after local verification</li>
                </ul>
              </div>
            </div>

            <div className="footer-bottom">
              © 2025 Dark Protocol. Apache 2.0 License. Secrets stay local; proofs travel.
            </div>
          </div>
        </footer>
      </div>
    </WalletProvider>
  );
}

export default App;
