import type { FC } from "react";
import React, { useCallback, useState } from "react";
import { WalletNotConnectedError } from "@solana/wallet-adapter-base";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { DarkProtocolClient } from "@dark-protocol/sdk";

interface PrivateSwapButtonProps {
  inputToken: PublicKey;
  outputToken: PublicKey;
  amount: number;
  slippage?: number;
  onSuccess?: (signature: string) => void;
  onError?: (error: Error) => void;
}

export const PrivateSwapButton: FC<PrivateSwapButtonProps> = ({
  inputToken,
  outputToken,
  amount,
  slippage = 1,
  onSuccess,
  onError,
}) => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [route, setRoute] = useState<any>(null);

  const fetchRoute = useCallback(async () => {
    try {
      const client = new DarkProtocolClient(connection, wallet);
      
      // Get best route from Jupiter
      const jupiterRoute = await client.getJupiterRoute({
        inputMint: inputToken,
        outputMint: outputToken,
        amount,
        slippageBps: slippage * 100,
      });

      setRoute(jupiterRoute);
      return jupiterRoute;
    } catch (error) {
      console.error("Error fetching route:", error);
      throw error;
    }
  }, [connection, wallet, inputToken, outputToken, amount, slippage]);

  const onClick = useCallback(async () => {
    if (!wallet.publicKey) throw new WalletNotConnectedError();
    
    setLoading(true);
    try {
      const client = new DarkProtocolClient(connection, wallet);

      console.log("Initiating private swap...");
      console.log("Input token:", inputToken.toBase58());
      console.log("Output token:", outputToken.toBase58());
      console.log("Amount:", amount);

      // Get or fetch route
      const swapRoute = route || await fetchRoute();
      
      if (!swapRoute) {
        throw new Error("Unable to find swap route");
      }

      console.log("Route found:", swapRoute);

      // Get available notes for input token
      const notes = await client.getAvailableNotes(
        wallet.publicKey,
        inputToken.toBase58()
      );

      if (!notes || notes.length === 0) {
        throw new Error("No shielded notes available for input token");
      }

      // Select notes
      const selectedNotes = client.selectNotesForAmount(notes, amount);
      
      if (!selectedNotes) {
        throw new Error("Insufficient shielded balance");
      }

      // Generate input commitment and nullifier
      const inputCommitment = selectedNotes[0].commitment;
      const nullifier = await client.generateNullifier(selectedNotes[0]);

      // Generate output commitment for received tokens
      const outputCommitment = await client.generateCommitment(
        wallet.publicKey,
        swapRoute.outputAmount
      );

      // Generate zero-knowledge proof for swap
      const proof = await client.generatePrivateSwapProof({
        inputNotes: selectedNotes,
        nullifier,
        inputCommitment,
        outputCommitment,
        swapRoute,
        merkleRoot: await client.getMerkleRoot(),
      });

      console.log("Generated ZK proof for swap");

      // Serialize Jupiter route plan
      const jupiterRoutePlan = client.serializeJupiterRoute(swapRoute);

      // Create private swap transaction
      const transaction = await client.privateSwap({
        inputAmount: amount,
        inputCommitment,
        outputCommitment,
        nullifier,
        proof,
        jupiterRoutePlan,
      });

      console.log("Sending private swap transaction...");

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

      console.log("Private swap completed successfully!");
      console.log("Transaction signature:", signature);

      // Update local notes
      await client.markNotesAsSpent(selectedNotes);
      await client.saveNote({
        commitment: outputCommitment,
        amount: swapRoute.outputAmount,
        tokenMint: outputToken.toBase58(),
      });

      onSuccess?.(signature);
    } catch (error) {
      console.error("Error in private swap:", error);
      onError?.(error as Error);
    } finally {
      setLoading(false);
    }
  }, [wallet, connection, inputToken, outputToken, amount, route, fetchRoute, onSuccess, onError]);

  return (
    <div className="private-swap-container">
      <button
        onClick={fetchRoute}
        disabled={!wallet.publicKey || loading}
        className="fetch-route-button"
      >
        {loading ? "Loading..." : "Get Best Route"}
      </button>
      
      {route && (
        <div className="route-info">
          <p>Expected output: {route.outputAmount}</p>
          <p>Price impact: {route.priceImpactPct}%</p>
        </div>
      )}
      
      <button
        onClick={onClick}
        disabled={!wallet.publicKey || !route || loading}
        className="private-swap-button"
      >
        {loading ? "Swapping privately..." : `Swap ${amount} privately`}
      </button>
    </div>
  );
};
