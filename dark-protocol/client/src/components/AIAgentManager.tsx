import type { FC } from "react";
import React, { useCallback, useState, useEffect } from "react";
import { WalletNotConnectedError } from "@solana/wallet-adapter-base";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { DarkProtocolClient } from "@dark-protocol/sdk";

interface AIAgent {
  pubkey: PublicKey;
  owner: PublicKey;
  trustScore: number;
  totalActions: number;
  successfulActions: number;
  isActive: boolean;
  registeredAt: number;
}

interface AIAgentManagerProps {
  onAgentRegistered?: (agentPubkey: PublicKey) => void;
  onActionExecuted?: (signature: string) => void;
}

export const AIAgentManager: FC<AIAgentManagerProps> = ({
  onAgentRegistered,
  onActionExecuted,
}) => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<PublicKey | null>(null);

  // Load user's agents
  const loadAgents = useCallback(async () => {
    if (!wallet.publicKey) return;
    
    try {
      const client = new DarkProtocolClient(connection, wallet);
      const userAgents = await client.getAIAgents(wallet.publicKey);
      setAgents(userAgents);
    } catch (error) {
      console.error("Error loading AI agents:", error);
    }
  }, [connection, wallet]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  // Register new AI agent
  const registerAgent = useCallback(async (
    agentPubkey: PublicKey,
    teeAttestation: Uint8Array,
    capabilities: string[]
  ) => {
    if (!wallet.publicKey) throw new WalletNotConnectedError();
    
    setLoading(true);
    try {
      const client = new DarkProtocolClient(connection, wallet);

      console.log("Registering AI agent...");
      console.log("Agent pubkey:", agentPubkey.toBase58());
      console.log("Capabilities:", capabilities);

      // Serialize capabilities
      const capabilitiesBuffer = Buffer.from(JSON.stringify(capabilities));

      // Create registration transaction
      const transaction = await client.registerAIAgent({
        agentPubkey,
        teeAttestation: Array.from(teeAttestation),
        capabilities: Array.from(capabilitiesBuffer),
      });

      console.log("Sending registration transaction...");

      const signature = await wallet.sendTransaction(transaction, connection);
      
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        {
          signature,
          ...latestBlockhash,
        },
        "confirmed"
      );

      console.log("AI agent registered successfully!");
      console.log("Transaction signature:", signature);

      // Reload agents
      await loadAgents();

      onAgentRegistered?.(agentPubkey);
    } catch (error) {
      console.error("Error registering AI agent:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [wallet, connection, loadAgents, onAgentRegistered]);

  // Execute AI agent action
  const executeAgentAction = useCallback(async (
    actionType: number,
    params: any
  ) => {
    if (!wallet.publicKey || !selectedAgent) {
      throw new Error("No agent selected");
    }
    
    setLoading(true);
    try {
      const client = new DarkProtocolClient(connection, wallet);

      console.log("Executing AI agent action...");
      console.log("Agent:", selectedAgent.toBase58());
      console.log("Action type:", actionType);

      // Encrypt parameters
      const encryptedParams = await client.encryptAgentParams(params);

      // Generate TEE execution proof
      const proof = await client.generateTEEExecutionProof({
        agentPubkey: selectedAgent,
        actionType,
        params: encryptedParams,
      });

      // Create action execution transaction
      const transaction = await client.executeAIAction({
        agentPubkey: selectedAgent,
        actionType,
        encryptedParams: Array.from(encryptedParams),
        proof: Array.from(proof),
      });

      console.log("Sending action execution transaction...");

      const signature = await wallet.sendTransaction(transaction, connection);
      
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        {
          signature,
          ...latestBlockhash,
        },
        "confirmed"
      );

      console.log("AI action executed successfully!");
      console.log("Transaction signature:", signature);

      // Reload agents to update stats
      await loadAgents();

      onActionExecuted?.(signature);
    } catch (error) {
      console.error("Error executing AI action:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [wallet, connection, selectedAgent, loadAgents, onActionExecuted]);

  // Action type constants
  const actionTypes = {
    MARKET_ANALYSIS: 0,
    DCA_TRADE: 1,
    PORTFOLIO_REBALANCE: 2,
    YIELD_OPTIMIZATION: 3,
    RISK_ASSESSMENT: 4,
  };

  return (
    <div className="ai-agent-manager">
      <h2>AI Agent Management</h2>
      
      <div className="agent-list">
        <h3>Your AI Agents</h3>
        {agents.length === 0 ? (
          <p>No agents registered yet</p>
        ) : (
          <ul>
            {agents.map((agent) => (
              <li
                key={agent.pubkey.toBase58()}
                onClick={() => setSelectedAgent(agent.pubkey)}
                className={selectedAgent?.equals(agent.pubkey) ? "selected" : ""}
              >
                <div className="agent-info">
                  <p><strong>Agent:</strong> {agent.pubkey.toBase58().slice(0, 8)}...</p>
                  <p><strong>Trust Score:</strong> {agent.trustScore}/1000</p>
                  <p><strong>Success Rate:</strong> {
                    agent.totalActions > 0 
                      ? ((agent.successfulActions / agent.totalActions) * 100).toFixed(1) 
                      : 0
                  }%</p>
                  <p><strong>Status:</strong> {agent.isActive ? "Active" : "Inactive"}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedAgent && (
        <div className="agent-actions">
          <h3>Execute Actions</h3>
          <div className="action-buttons">
            <button
              onClick={() => executeAgentAction(actionTypes.MARKET_ANALYSIS, {})}
              disabled={loading}
            >
              Market Analysis
            </button>
            <button
              onClick={() => executeAgentAction(actionTypes.DCA_TRADE, { amount: 100 })}
              disabled={loading}
            >
              DCA Trade
            </button>
            <button
              onClick={() => executeAgentAction(actionTypes.PORTFOLIO_REBALANCE, {})}
              disabled={loading}
            >
              Rebalance Portfolio
            </button>
            <button
              onClick={() => executeAgentAction(actionTypes.YIELD_OPTIMIZATION, {})}
              disabled={loading}
            >
              Optimize Yield
            </button>
            <button
              onClick={() => executeAgentAction(actionTypes.RISK_ASSESSMENT, {})}
              disabled={loading}
            >
              Risk Assessment
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
