import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import WalletProvider from './contexts/WalletProvider';
import Dashboard from './components/Dashboard';
import './App.css';

function App() {
  return (
    <WalletProvider>
      <div className="app-shell">
        <header className="topbar">
          <div className="topbar-inner">
            <div className="brand">
              <div className="brand-mark" aria-hidden="true">
                <span>ZW</span>
              </div>
              <div>
                <h1 className="brand-title">ZOLana Dark Wallet</h1>
                <p className="brand-subtitle">Sapling discipline / Solana speed / Agent guarded</p>
              </div>
            </div>

            <WalletMultiButton />
          </div>
        </header>

        <main className="app-main">
          <Dashboard />
        </main>

        <footer className="footer-vault">
          <div className="footer-inner">
            <div className="footer-grid">
              <div>
                <h3 className="footer-title">Cold Path</h3>
                <p className="footer-copy">
                  Paper-wallet custody, shielded-note discipline, and Solana Memo intent anchors in one operator surface.
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
                <h4 className="footer-title">Docs</h4>
                <ul className="footer-list">
                  <li>
                    <a href="https://docs.darkwallet.io">Documentation</a>
                  </li>
                  <li>
                    <a href="https://github.com/dark-protocol">GitHub</a>
                  </li>
                  <li>
                    <a href="https://discord.gg/darkwallet">Discord</a>
                  </li>
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
