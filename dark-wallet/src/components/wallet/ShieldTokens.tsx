import React, { useEffect, useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { createDarkProtocolClient } from '../../sdk/dark-protocol';
import { SHIELDED_LEDGER_EVENT } from '../../sdk/shielded-ledger';

const ShieldTokens: React.FC = () => {
  const wallet = useWallet();
  const { publicKey } = wallet;
  const { connection } = useConnection();
  const [amount, setAmount] = useState('0.1');
  const [memo, setMemo] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [shieldedBalance, setShieldedBalance] = useState(0);
  const [noteCount, setNoteCount] = useState(0);

  const syncShieldedLedger = () => {
    if (!publicKey) {
      setShieldedBalance(0);
      setNoteCount(0);
      return;
    }

    const darkClient = createDarkProtocolClient(connection, wallet);
    void darkClient.getShieldedBalance().then(setShieldedBalance);
    setNoteCount(darkClient.getShieldedNotes().length);
  };

  useEffect(() => {
    syncShieldedLedger();
    window.addEventListener(SHIELDED_LEDGER_EVENT, syncShieldedLedger);
    return () => window.removeEventListener(SHIELDED_LEDGER_EVENT, syncShieldedLedger);
  }, [publicKey, connection]);

  const handleShield = async () => {
    if (!publicKey) {
      alert('Please connect your wallet first');
      return;
    }

    setIsLoading(true);
    setStatus('Shielding tokens...');

    try {
      // Create Dark Protocol client
      const darkClient = createDarkProtocolClient(connection, wallet);

      // Shield tokens using Dark Protocol
      const signature = await darkClient.shieldTokens(parseFloat(amount), memo);

      setStatus(`Shield intent anchored for ${amount} SOL.\nTransaction: ${signature.slice(0, 20)}...`);
      setAmount('0.1');
      setMemo('');
    } catch (error: any) {
      console.error('Shield error:', error);
      setStatus(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="section-header">
        <p className="section-kicker">Private Entry</p>
        <h3 className="section-title">
          Shield Tokens
        </h3>
        <p className="section-copy">
          Anchor a shield commitment on Solana before full verifier settlement
        </p>
      </div>

      <div className="space-y-4">
        <div className="mini-panel">
          <div className="flex items-center justify-between gap-4">
            <span className="metric-label">Local Shielded Notes</span>
            <span className="panel-value">{shieldedBalance.toFixed(4)} SOL</span>
          </div>
          <p className="hint mt-2">
            {noteCount} anchored ledger {noteCount === 1 ? 'entry' : 'entries'} on this browser profile
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
          <p className="mt-1 hint">
            Minimum: 0.001 SOL / normal Solana transaction fee applies
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Memo (Optional)
          </label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            maxLength={512}
            className="input min-h-[100px]"
            placeholder="Private message (encrypted, max 512 bytes)"
            disabled={isLoading}
          />
          <p className="mt-1 hint">
            {memo.length} / 512 characters
          </p>
        </div>

        <button
          onClick={handleShield}
          disabled={!publicKey || isLoading || parseFloat(amount) <= 0}
          className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Shielding...
            </span>
          ) : (
            `Anchor Shield Intent for ${amount} SOL`
          )}
        </button>

        {status && (
          <div className={`status-banner ${
            status.includes('Error')
              ? 'status-banner-error'
              : 'status-banner-info'
          }`}>
            {status}
          </div>
        )}
      </div>

      <div className="mini-panel">
        <h4 className="footer-title">
          Current Shielding Path
        </h4>
        <ul className="footer-list">
          <li>The wallet signs a Solana Memo transaction over a shield commitment</li>
          <li>The memo stores amount commitment metadata, not plaintext private memo text</li>
          <li>Helius or the configured Solana RPC submits the transaction</li>
          <li>This is the live SVM intent rail while the Dark Protocol verifier is finalized</li>
        </ul>
      </div>
    </div>
  );
};

export default ShieldTokens;
