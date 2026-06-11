import React, { useEffect, useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { createDarkProtocolClient } from '../../sdk/dark-protocol';
import { SHIELDED_LEDGER_EVENT } from '../../sdk/shielded-ledger';

const UnshieldTokens: React.FC = () => {
  const wallet = useWallet();
  const { publicKey } = wallet;
  const { connection } = useConnection();
  const [amount, setAmount] = useState('0.1');
  const [recipient, setRecipient] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [shieldedBalance, setShieldedBalance] = useState(0);
  const [noteCount, setNoteCount] = useState(0);
  const requestedAmount = Number.parseFloat(amount) || 0;
  const hasInsufficientBalance = requestedAmount > shieldedBalance;

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

  const handleUnshield = async () => {
    if (!publicKey) {
      alert('Please connect your wallet first');
      return;
    }

    setIsLoading(true);
    setStatus('Anchoring unshield intent...');

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

      // Anchor unshield intent using Dark Protocol commitment rail.
      const signature = await darkClient.unshieldTokens(parseFloat(amount), recipientPubkey);

      setStatus(`Unshield intent anchored for ${amount} SOL.\nTransaction: ${signature.slice(0, 20)}...`);
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
      <div className="section-header">
        <p className="section-kicker">Private Exit</p>
        <h3 className="section-title">
          Unshield Tokens
        </h3>
        <p className="section-copy">
          Anchor an unshield commitment before full verifier settlement
        </p>
      </div>

      <div className="space-y-4">
        <div className="mini-panel">
          <div className="flex items-center justify-between">
            <span className="metric-label">Shielded Balance</span>
            <span className="panel-value">{shieldedBalance.toFixed(4)} SOL</span>
          </div>
          <p className="hint mt-2">
            {noteCount > 0
              ? `${noteCount} local ledger ${noteCount === 1 ? 'entry' : 'entries'} available for debit`
              : 'No local shielded notes found. Shield some tokens first.'}
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
          <p className="mt-1 hint">
            Leave empty to send to your connected wallet
          </p>
        </div>

        <button
          onClick={handleUnshield}
          disabled={!publicKey || isLoading || requestedAmount <= 0 || hasInsufficientBalance}
          className="btn-secondary w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Anchoring Intent...
            </span>
          ) : (
            `Anchor Unshield Intent for ${amount} SOL`
          )}
        </button>

        {hasInsufficientBalance && requestedAmount > 0 && (
          <p className="hint text-[color:var(--amber)]">
            Requested amount exceeds this browser's local shielded note balance.
          </p>
        )}

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
          Current Unshielding Path
        </h4>
        <ul className="footer-list">
          <li>The wallet signs a Solana Memo transaction over an unshield commitment</li>
          <li>Recipient is included as a transparent Solana address</li>
          <li>The transaction is submitted through Helius or the configured Solana RPC</li>
          <li>Full note spending, nullifiers, and ZK verification remain Dark Protocol program work</li>
        </ul>
      </div>
    </div>
  );
};

export default UnshieldTokens;
