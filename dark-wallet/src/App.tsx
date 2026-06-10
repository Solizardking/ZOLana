import React, { useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import WalletProvider from './contexts/WalletProvider';
import Dashboard from './components/Dashboard';
import './App.css';

function App() {
  const [isConnected, setIsConnected] = useState(false);

  return (
    <WalletProvider>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
        {/* Header */}
        <header className="border-b border-gray-800 bg-black/50 backdrop-blur-xl">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">🔒</span>
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
                    Dark Wallet
                  </h1>
                  <p className="text-xs text-gray-400">Privacy DeFi for Solana</p>
                </div>
              </div>

              <WalletMultiButton className="!bg-gradient-to-r !from-purple-600 !to-indigo-600 hover:!from-purple-700 hover:!to-indigo-700" />
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-6 py-8">
          <Dashboard />
        </main>

        {/* Footer */}
        <footer className="border-t border-gray-800 bg-black/30 backdrop-blur-xl mt-16">
          <div className="container mx-auto px-6 py-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div>
                <h3 className="text-lg font-bold mb-3 bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
                  🔒 Dark Wallet
                </h3>
                <p className="text-sm text-gray-400">
                  Zcash Sapling-compatible privacy wallet for Solana
                </p>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-3 text-gray-300">Features</h4>
                <ul className="text-sm text-gray-400 space-y-2">
                  <li>• Shielded Transactions</li>
                  <li>• Private Swaps (Jupiter)</li>
                  <li>• 180x Faster than Zcash</li>
                  <li>• 50x Lower Fees</li>
                </ul>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-3 text-gray-300">Links</h4>
                <ul className="text-sm text-gray-400 space-y-2">
                  <li>
                    <a href="https://docs.darkwallet.io" className="hover:text-purple-400 transition">
                      Documentation
                    </a>
                  </li>
                  <li>
                    <a href="https://github.com/dark-protocol" className="hover:text-purple-400 transition">
                      GitHub
                    </a>
                  </li>
                  <li>
                    <a href="https://discord.gg/darkwallet" className="hover:text-purple-400 transition">
                      Discord
                    </a>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-800 text-center">
              <p className="text-sm text-gray-500">
                © 2025 Dark Protocol. Apache 2.0 License. Privacy is a right, not a privilege.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </WalletProvider>
  );
}

export default App;
