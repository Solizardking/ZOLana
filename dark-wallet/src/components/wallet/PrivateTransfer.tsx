import React, { useEffect, useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { createDarkProtocolClient, isValidShieldedAddress } from '../../sdk/dark-protocol';
import { SHIELDED_LEDGER_EVENT } from '../../sdk/shielded-ledger';

const PrivateTransfer: React.FC = () => {
  const wallet = useWallet();
  const { publicKey } = wallet;
  const { connection } = useConnection();
  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('0.1');
  const [memo, setMemo] = useState('');
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

  const handleGenerateAddress = async () => {
    try {
      const darkClient = createDarkProtocolClient(connection, wallet);
      setRecipientAddress(await darkClient.generateShieldedAddress());
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
    }
  };

  const handleTransfer = async () => {
    if (!publicKey) {
      alert('Please connect your wallet first');
      return;
    }

    if (!isValidShieldedAddress(recipientAddress)) {
      alert('Please enter a valid shielded address (zs1 or zsol1)');
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

      setStatus(`Private transfer intent anchored for ${amount} SOL.\nTransaction: ${signature.slice(0, 20)}...`);
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
      <div className="section-header">
        <p className="section-kicker">Private Relay</p>
        <h3 className="section-title">
          Private Transfer
        </h3>
        <p className="section-copy">
          Anchor a shielded-address transfer intent on Solana
        </p>
      </div>

      <div className="space-y-4">
        <div className="mini-panel">
          <div className="flex items-center justify-between">
            <span className="metric-label">Available for Transfer</span>
            <span className="panel-value">{shieldedBalance.toFixed(4)} SOL</span>
          </div>
          <p className="hint mt-2">
            {noteCount} local shielded ledger {noteCount === 1 ? 'entry' : 'entries'}
          </p>
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
            placeholder="zsol1abc123def456..."
            disabled={isLoading}
          />
          <p className="mt-1 hint">
            Must be a Sapling-style shielded address (zs1) or ZOLana shielded address (zsol1)
          </p>
          <button
            type="button"
            onClick={handleGenerateAddress}
            disabled={isLoading}
            className="btn-secondary mt-3 text-xs"
          >
            Generate local zsol1 recipient address
          </button>
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
          <p className="mt-1 hint">
            {memo.length} / 512 characters / memo text is hashed before anchoring
          </p>
        </div>

        <button
          onClick={handleTransfer}
          disabled={!publicKey || isLoading || requestedAmount <= 0 || !recipientAddress || hasInsufficientBalance}
          className="btn-primary w-full"
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
            `Anchor Private Intent for ${amount} SOL`
          )}
        </button>

        {hasInsufficientBalance && requestedAmount > 0 && (
          <p className="hint text-[color:var(--amber)]">
            Requested amount exceeds this browser's local shielded note balance.
          </p>
        )}

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

      <div className="mini-panel">
        <h4 className="footer-title">
          Current Private Transfer Path
        </h4>
        <ul className="footer-list">
          <li>Wallet signs a Solana Memo transaction over a private-transfer commitment</li>
          <li>Recipient is represented as a Sapling-style zs1 or ZOLana zsol1 shielded address</li>
          <li>Memo text is hashed before anchoring</li>
          <li>Full note spending and verifier settlement remain Dark Protocol program work</li>
        </ul>
      </div>
    </div>
  );
};

export default PrivateTransfer;
