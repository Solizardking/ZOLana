import type { FC } from "react";
import React, { useCallback, useState } from "react";
import { WalletNotConnectedError } from "@solana/wallet-adapter-base";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { DarkProtocolClient } from "@dark-protocol/sdk";

interface UnshieldTokensButtonProps {
  amount: number;
  recipient?: PublicKey;
  onSuccess?: (signature: string) => void;
  onError?: (error: Error) => void;
}

export const UnshieldTokensButton: FC<UnshieldTokensButtonProps> = ({
  amount,
  recipient,
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

      console.log("Unshielding tokens...");
      console.log("Amount:", amount);
      console.log("Recipient:", recipient?.toBase58() || wallet.publicKey.toBase58());

      // Get available shielded notes
      const notes = await client.getAvailableNotes(wallet.publicKey);
      
      if (!notes || notes.length === 0) {
        throw new Error("No shielded notes available to unshield");
      }

      // Select notes that cover the amount
      const selectedNotes = client.selectNotesForAmount(notes, amount);
      
      if (!selectedNotes) {
        throw new Error("Insufficient shielded balance");
      }

      console.log("Selected notes for unshielding:", selectedNotes.length);

      // Use the first note's nullifier
      const note = selectedNotes[0];
      const nullifier = await client.generateNullifier(note);

      // Generate zero-knowledge proof
      // Proof demonstrates:
      // 1. Note exists in merkle tree
      // 2. Owner knows the spending key (via nullifier)
      // 3. Amount matches the note value
      const proof = await client.generateUnshieldProof({
        note,
        nullifier,
        amount,
        merkleRoot: await client.getMerkleRoot(),
      });

      console.log("Generated ZK proof for unshielding");

      // Create unshield transaction
      const transaction = await client.unshieldTokens({
        amount,
        nullifier: Array.from(nullifier),
        proof: Array.from(proof),
        recipient: recipient || wallet.publicKey,
      });

      console.log("Sending unshield transaction...");

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

      console.log("Tokens unshielded successfully!");
      console.log("Transaction signature:", signature);

      // Mark note as spent
      await client.markNotesAsSpent(selectedNotes);

      onSuccess?.(signature);
    } catch (error) {
      console.error("Error unshielding tokens:", error);
      onError?.(error as Error);
    } finally {
      setLoading(false);
    }
  }, [wallet, connection, amount, recipient, onSuccess, onError]);

  return (
    <button
      onClick={onClick}
      disabled={!wallet.publicKey || loading}
      className="unshield-button"
    >
      {loading ? "Unshielding..." : `Unshield ${amount} tokens`}
    </button>
  );
};
