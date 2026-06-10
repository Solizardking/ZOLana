/**
 * Shield Tokens Button - Deposit transparent tokens into shielded pool
 *
 * This component allows users to convert transparent SOL/SPL tokens
 * into shielded (private) tokens using Zcash Sapling-style encryption.
 */

import type { FC } from "react";
import React, { useCallback, useState } from "react";
import { WalletNotConnectedError } from "@solana/wallet-adapter-base";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import {
  SaplingHDWallet,
  SaplingPaymentAddress,
  NoteEncryptionUtils,
  DarkProtocolClient
} from "@dark-protocol/sdk";

interface ShieldTokensButtonProps {
  wallet: SaplingHDWallet;
  recipientAddress?: SaplingPaymentAddress;
  amount?: number;
  onSuccess?: (txSignature: string) => void;
  onError?: (error: Error) => void;
}

export const ShieldTokensButton: FC<ShieldTokensButtonProps> = ({
  wallet: saplingWallet,
  recipientAddress,
  amount: defaultAmount,
  onSuccess,
  onError
}) => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [amount, setAmount] = useState(defaultAmount || 0.1);
  const [memo, setMemo] = useState("");

  const onClick = useCallback(async () => {
    if (!wallet.publicKey) throw new WalletNotConnectedError();
    if (!saplingWallet) throw new Error("Sapling wallet not initialized");

    setIsLoading(true);

    try {
      // Get recipient address (default to wallet's own address)
      const recipient = recipientAddress || saplingWallet.getDefaultAddress();

      // Convert SOL to lamports
      const lamports = Math.floor(amount * anchor.web3.LAMPORTS_PER_SOL);

      // Initialize Dark Protocol client
      const darkClient = await DarkProtocolClient.create({
        connection,
        wallet: wallet as any,
      });

      // Generate randomness for note
      const rseed = crypto.getRandomValues(new Uint8Array(32));

      // Create encrypted note
      const encryptedNote = await NoteEncryptionUtils.createEncryptedNote({
        recipientAddress: recipient,
        value: BigInt(lamports),
        memo: memo || "Shielded tokens",
        senderOvk: saplingWallet.getFullViewingKey().ovk,
        rseed: Array.from(rseed),
      });

      console.log("Shielding tokens...");
      console.log("Amount:", amount, "SOL");
      console.log("Recipient:", recipient.toBase58());
      console.log("Memo:", memo);

      // Call shield_tokens instruction
      const txSignature = await darkClient.shieldTokens({
        amount: lamports,
        recipientAddress: recipient.to_bytes(),
        memo: Buffer.from(memo || "Shielded tokens"),
        rseed: Array.from(rseed),
        commitment: encryptedNote.commitment,
      });

      console.log("Tokens shielded successfully!");
      console.log("Transaction signature:", txSignature);

      // Wait for confirmation
      await connection.confirmTransaction(txSignature, "confirmed");

      if (onSuccess) {
        onSuccess(txSignature);
      }

      alert(`Successfully shielded ${amount} SOL!\nTx: ${txSignature}`);

    } catch (error: any) {
      console.error("Failed to shield tokens:", error);

      if (onError) {
        onError(error);
      } else {
        alert(`Failed to shield tokens: ${error.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    wallet.publicKey,
    wallet.sendTransaction,
    connection,
    saplingWallet,
    recipientAddress,
    amount,
    memo,
    onSuccess,
    onError,
  ]);

  return (
    <div className="shield-tokens-container">
      <h3>🔒 Shield Tokens</h3>
      <p>Convert transparent tokens to private shielded tokens</p>

      <div className="input-group">
        <label htmlFor="amount">Amount (SOL):</label>
        <input
          id="amount"
          type="number"
          step="0.01"
          min="0.001"
          value={amount}
          onChange={(e) => setAmount(parseFloat(e.target.value))}
          disabled={isLoading}
        />
      </div>

      <div className="input-group">
        <label htmlFor="memo">Memo (optional):</label>
        <input
          id="memo"
          type="text"
          maxLength={512}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="Private message (encrypted)"
          disabled={isLoading}
        />
      </div>

      {recipientAddress && (
        <div className="recipient-info">
          <label>Recipient:</label>
          <code>{recipientAddress.toBase58().slice(0, 20)}...</code>
        </div>
      )}

      <button
        onClick={onClick}
        disabled={!wallet.publicKey || !saplingWallet || isLoading}
        className="shield-button"
      >
        {isLoading ? (
          <>⏳ Shielding...</>
        ) : (
          <>🔒 Shield {amount} SOL</>
        )}
      </button>

      <style jsx>{`
        .shield-tokens-container {
          padding: 20px;
          border: 2px solid #8b5cf6;
          border-radius: 12px;
          background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
          color: white;
          max-width: 400px;
        }

        .shield-tokens-container h3 {
          margin: 0 0 8px 0;
          font-size: 1.5em;
        }

        .shield-tokens-container p {
          margin: 0 0 20px 0;
          opacity: 0.8;
          font-size: 0.9em;
        }

        .input-group {
          margin-bottom: 15px;
        }

        .input-group label {
          display: block;
          margin-bottom: 5px;
          font-weight: 600;
        }

        .input-group input {
          width: 100%;
          padding: 10px;
          border: 1px solid #6366f1;
          border-radius: 6px;
          background: #1e1b4b;
          color: white;
          font-size: 1em;
        }

        .input-group input:focus {
          outline: none;
          border-color: #8b5cf6;
          box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.2);
        }

        .recipient-info {
          margin-bottom: 15px;
          padding: 10px;
          background: rgba(139, 92, 246, 0.1);
          border-radius: 6px;
        }

        .recipient-info label {
          display: block;
          margin-bottom: 5px;
          font-size: 0.9em;
          opacity: 0.8;
        }

        .recipient-info code {
          font-family: 'Courier New', monospace;
          font-size: 0.85em;
        }

        .shield-button {
          width: 100%;
          padding: 15px;
          background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 1.1em;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .shield-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(139, 92, 246, 0.3);
        }

        .shield-button:active:not(:disabled) {
          transform: translateY(0);
        }

        .shield-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};
