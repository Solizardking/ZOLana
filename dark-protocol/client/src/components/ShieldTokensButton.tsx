import type { FC } from "react";
import React, { useCallback, useState } from "react";
import { WalletNotConnectedError } from "@solana/wallet-adapter-base";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { DarkProtocolClient } from "@dark-protocol/sdk";

interface ShieldTokensButtonProps {
  amount?: number;
  tokenMint?: PublicKey;
  onSuccess?: (signature: string) => void;
  onError?: (error: Error) => void;
}

export const ShieldTokensButton: FC<ShieldTokensButtonProps> = ({
  amount = 1,
  tokenMint,
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
      // Initialize Dark Protocol client
      const client = new DarkProtocolClient(connection, wallet);

      console.log("Shielding tokens...");
      console.log("Amount:", amount);
      console.log("Token Mint:", tokenMint?.toBase58());

      // Generate commitment and nullifier for the note
      const { commitment, nullifier } = await client.generateNoteCommitment(
        amount,
        wallet.publicKey
      );

      console.log("Generated commitment:", commitment);
      console.log("Generated nullifier:", nullifier);

      // Create shield transaction
      const transaction = await client.shieldTokens({
        amount,
        tokenMint: tokenMint || client.getNativeTokenMint(),
        commitment,
        nullifier,
      });

      console.log("Sending shield transaction...");

      // Send and confirm transaction
      const signature = await wallet.sendTransaction(transaction, connection);

      console.log("Transaction signature:", signature);

      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        {
          signature,
          ...latestBlockhash,
        },
        "confirmed"
      );

      console.log("Tokens shielded successfully!");
      
      // Store note data for future use
      await client.saveNote({
        commitment,
        nullifier,
        amount,
        tokenMint: tokenMint?.toBase58() || "native",
      });

      onSuccess?.(signature);
    } catch (error) {
      console.error("Error shielding tokens:", error);
      onError?.(error as Error);
    } finally {
      setLoading(false);
    }
  }, [wallet, connection, amount, tokenMint, onSuccess, onError]);

  return (
    <button
      onClick={onClick}
      disabled={!wallet.publicKey || loading}
      className="shield-button"
    >
      {loading ? "Shielding..." : `Shield ${amount} tokens`}
    </button>
  );
};
