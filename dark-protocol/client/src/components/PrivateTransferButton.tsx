import type { FC } from "react";
import React, { useCallback, useState } from "react";
import { WalletNotConnectedError } from "@solana/wallet-adapter-base";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { DarkProtocolClient } from "@dark-protocol/sdk";

interface PrivateTransferButtonProps {
  recipient: string;
  amount: number;
  memo?: string;
  onSuccess?: (signature: string) => void;
  onError?: (error: Error) => void;
}

export const PrivateTransferButton: FC<PrivateTransferButtonProps> = ({
  recipient,
  amount,
  memo = "",
  onSuccess,
  onError,
}) => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);

  const onClick = useCallback(async () => {
    if (!wallet.publicKey) throw new WalletNotConnectedError();
    
    setLoading(true);
    try {
      const client = new DarkProtocolClient(connection, wallet);

      console.log("Initiating private transfer...");
      console.log("Recipient:", recipient);
      console.log("Amount:", amount);

      // Get available notes (input UTXOs)
      const notes = await client.getAvailableNotes(wallet.publicKey);
      
      if (!notes || notes.length === 0) {
        throw new Error("No shielded notes available. Please shield tokens first.");
      }

      // Select notes that cover the amount
      const selectedNotes = client.selectNotesForAmount(notes, amount);
      
      if (!selectedNotes) {
        throw new Error("Insufficient shielded balance");
      }

      console.log("Selected notes:", selectedNotes.length);

      // Generate nullifiers for input notes
      const inputNullifiers = await Promise.all(
        selectedNotes.map(note => client.generateNullifier(note))
      );

      // Generate output commitments
      const recipientPubkey = new PublicKey(recipient);
      const outputCommitments = await client.generateOutputCommitments([
        { recipient: recipientPubkey, amount },
      ]);

      // Generate zero-knowledge proof
      const proof = await client.generatePrivateTransferProof({
        inputNotes: selectedNotes,
        inputNullifiers,
        outputCommitments,
        merkleRoot: await client.getMerkleRoot(),
      });

      console.log("Generated ZK proof");

      // Encrypt memo if provided
      const encryptedMemo = memo
        ? await client.encryptMemo(memo, recipientPubkey)
        : new Uint8Array(0);

      // Create private transfer transaction
      const transaction = await client.privateTransfer({
        inputNullifiers,
        outputCommitments,
        proof,
        encryptedMemo: Array.from(encryptedMemo),
      });

      console.log("Sending private transfer transaction...");

      // Send and confirm
      const signature = await wallet.sendTransaction(transaction, connection);
      
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        {
          signature,
          ...latestBlockhash,
        },
        "confirmed"
      );

      console.log("Private transfer completed successfully!");
      console.log("Transaction signature:", signature);

      // Update local note database
      await client.markNotesAsSpent(selectedNotes);

      onSuccess?.(signature);
    } catch (error) {
      console.error("Error in private transfer:", error);
      onError?.(error as Error);
    } finally {
      setLoading(false);
    }
  }, [wallet, connection, recipient, amount, memo, onSuccess, onError]);

  return (
    <button
      onClick={onClick}
      disabled={!wallet.publicKey || loading}
      className="private-transfer-button"
    >
      {loading ? "Sending privately..." : `Send ${amount} privately`}
    </button>
  );
};
