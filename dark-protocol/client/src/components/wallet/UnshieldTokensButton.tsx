/**
 * Unshield Tokens Button - Withdraw from shielded pool with ZK proof
 *
 * This component allows users to convert shielded (private) tokens
 * back to transparent SOL/SPL tokens with zero-knowledge proof verification.
 */

import type { FC } from "react";
import React, { useCallback, useState, useEffect } from "react";
import { WalletNotConnectedError } from "@solana/wallet-adapter-base";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import {
  SaplingHDWallet,
  DarkProtocolClient,
  ShieldedNote,
  generateZKProof
} from "@dark-protocol/sdk";

interface UnshieldTokensButtonProps {
  wallet: SaplingHDWallet;
  notes?: ShieldedNote[];
  recipientAddress?: PublicKey;
  onSuccess?: (txSignature: string) => void;
  onError?: (error: Error) => void;
}

export const UnshieldTokensButton: FC<UnshieldTokensButtonProps> = ({
  wallet: saplingWallet,
  notes: providedNotes,
  recipientAddress,
  onSuccess,
  onError
}) => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [notes, setNotes] = useState<ShieldedNote[]>(providedNotes || []);
  const [selectedNote, setSelectedNote] = useState<ShieldedNote | null>(null);
  const [amount, setAmount] = useState(0);
  const [recipient, setRecipient] = useState(recipientAddress?.toBase58() || "");

  // Scan for notes
  useEffect(() => {
    if (!saplingWallet || providedNotes) return;

    const scanNotes = async () => {
      try {
        const darkClient = await DarkProtocolClient.create({
          connection,
          wallet: wallet as any,
        });

        const ivk = saplingWallet.getIncomingViewingKey();
        const scannedNotes = await darkClient.scanNotes(ivk);

        // Filter unspent notes
        const unspentNotes = scannedNotes.filter(note => !note.isSpent);
        setNotes(unspentNotes);

        console.log(`Found ${unspentNotes.length} unspent notes`);
      } catch (error) {
        console.error("Failed to scan notes:", error);
      }
    };

    scanNotes();
  }, [saplingWallet, connection, wallet, providedNotes]);

  const onClick = useCallback(async () => {
    if (!wallet.publicKey) throw new WalletNotConnectedError();
    if (!saplingWallet) throw new Error("Sapling wallet not initialized");
    if (!selectedNote) throw new Error("No note selected");

    setIsLoading(true);

    try {
      // Get recipient address
      const recipientPubkey = recipient
        ? new PublicKey(recipient)
        : wallet.publicKey;

      // Convert SOL to lamports
      const lamports = Math.floor(amount * anchor.web3.LAMPORTS_PER_SOL);

      // Initialize Dark Protocol client
      const darkClient = await DarkProtocolClient.create({
        connection,
        wallet: wallet as any,
      });

      console.log("Unshielding tokens...");
      console.log("Amount:", amount, "SOL");
      console.log("Recipient:", recipientPubkey.toBase58());
      console.log("Note:", selectedNote.commitment);

      // Generate nullifier
      const spendingKey = saplingWallet.getSpendingKey();
      const nullifier = await darkClient.generateNullifier(
        selectedNote,
        spendingKey
      );

      // Get Merkle proof
      const merkleProof = await darkClient.getMerkleProof(selectedNote.commitment);

      // Generate ZK proof
      console.log("Generating ZK proof...");
      const zkProof = await generateZKProof({
        type: "spend",
        spendingKey: spendingKey.to_bytes(),
        note: selectedNote,
        merkleProof,
        nullifier,
        amount: lamports,
      });

      // Call unshield_tokens instruction
      const txSignature = await darkClient.unshieldTokens({
        nullifier,
        amount: lamports,
        merkleProof,
        zkProof,
        recipientAddress: recipientPubkey,
      });

      console.log("Tokens unshielded successfully!");
      console.log("Transaction signature:", txSignature);

      // Wait for confirmation
      await connection.confirmTransaction(txSignature, "confirmed");

      // Update notes list
      setNotes(notes.filter(n => n.commitment !== selectedNote.commitment));
      setSelectedNote(null);

      if (onSuccess) {
        onSuccess(txSignature);
      }

      alert(`Successfully unshielded ${amount} SOL!\nTx: ${txSignature}`);

    } catch (error: any) {
      console.error("Failed to unshield tokens:", error);

      if (onError) {
        onError(error);
      } else {
        alert(`Failed to unshield tokens: ${error.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    wallet.publicKey,
    connection,
    saplingWallet,
    selectedNote,
    amount,
    recipient,
    notes,
    onSuccess,
    onError,
  ]);

  const totalBalance = notes.reduce((sum, note) => sum + note.value, 0);
  const totalBalanceSOL = totalBalance / anchor.web3.LAMPORTS_PER_SOL;

  return (
    <div className="unshield-tokens-container">
      <h3>🔓 Unshield Tokens</h3>
      <p>Convert private shielded tokens back to transparent tokens</p>

      <div className="balance-info">
        <div className="balance-label">Shielded Balance:</div>
        <div className="balance-amount">{totalBalanceSOL.toFixed(4)} SOL</div>
        <div className="balance-notes">({notes.length} notes)</div>
      </div>

      {notes.length > 0 ? (
        <>
          <div className="input-group">
            <label htmlFor="note-select">Select Note:</label>
            <select
              id="note-select"
              value={selectedNote?.commitment || ""}
              onChange={(e) => {
                const note = notes.find(n => n.commitment === e.target.value);
                setSelectedNote(note || null);
                if (note) {
                  setAmount(note.value / anchor.web3.LAMPORTS_PER_SOL);
                }
              }}
              disabled={isLoading}
            >
              <option value="">-- Select a note --</option>
              {notes.map((note) => (
                <option key={note.commitment} value={note.commitment}>
                  {(note.value / anchor.web3.LAMPORTS_PER_SOL).toFixed(4)} SOL
                  {note.memo ? ` - ${note.memo.slice(0, 20)}...` : ""}
                </option>
              ))}
            </select>
          </div>

          {selectedNote && (
            <>
              <div className="input-group">
                <label htmlFor="amount">Amount (SOL):</label>
                <input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.001"
                  max={selectedNote.value / anchor.web3.LAMPORTS_PER_SOL}
                  value={amount}
                  onChange={(e) => setAmount(parseFloat(e.target.value))}
                  disabled={isLoading}
                />
              </div>

              <div className="input-group">
                <label htmlFor="recipient">Recipient Address:</label>
                <input
                  id="recipient"
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder={wallet.publicKey?.toBase58() || ""}
                  disabled={isLoading}
                />
              </div>

              <button
                onClick={onClick}
                disabled={!wallet.publicKey || !saplingWallet || !selectedNote || isLoading}
                className="unshield-button"
              >
                {isLoading ? (
                  <>⏳ Unshielding (Generating ZK Proof)...</>
                ) : (
                  <>🔓 Unshield {amount} SOL</>
                )}
              </button>
            </>
          )}
        </>
      ) : (
        <div className="no-notes">
          <p>No shielded notes found</p>
          <p className="hint">Shield some tokens first to create private notes</p>
        </div>
      )}

      <style jsx>{`
        .unshield-tokens-container {
          padding: 20px;
          border: 2px solid #10b981;
          border-radius: 12px;
          background: linear-gradient(135deg, #064e3b 0%, #065f46 100%);
          color: white;
          max-width: 400px;
        }

        .unshield-tokens-container h3 {
          margin: 0 0 8px 0;
          font-size: 1.5em;
        }

        .unshield-tokens-container p {
          margin: 0 0 20px 0;
          opacity: 0.8;
          font-size: 0.9em;
        }

        .balance-info {
          padding: 15px;
          background: rgba(16, 185, 129, 0.1);
          border-radius: 8px;
          margin-bottom: 20px;
          text-align: center;
        }

        .balance-label {
          font-size: 0.9em;
          opacity: 0.8;
          margin-bottom: 5px;
        }

        .balance-amount {
          font-size: 2em;
          font-weight: 700;
          color: #10b981;
        }

        .balance-notes {
          font-size: 0.85em;
          opacity: 0.7;
          margin-top: 5px;
        }

        .input-group {
          margin-bottom: 15px;
        }

        .input-group label {
          display: block;
          margin-bottom: 5px;
          font-weight: 600;
        }

        .input-group input,
        .input-group select {
          width: 100%;
          padding: 10px;
          border: 1px solid #10b981;
          border-radius: 6px;
          background: #064e3b;
          color: white;
          font-size: 1em;
        }

        .input-group input:focus,
        .input-group select:focus {
          outline: none;
          border-color: #34d399;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
        }

        .no-notes {
          padding: 30px;
          text-align: center;
          background: rgba(16, 185, 129, 0.05);
          border-radius: 8px;
        }

        .no-notes p {
          margin: 10px 0;
        }

        .no-notes .hint {
          font-size: 0.85em;
          opacity: 0.7;
        }

        .unshield-button {
          width: 100%;
          padding: 15px;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 1.1em;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .unshield-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(16, 185, 129, 0.3);
        }

        .unshield-button:active:not(:disabled) {
          transform: translateY(0);
        }

        .unshield-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};
