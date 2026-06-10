import { PublicKey } from '@solana/web3.js';
import { DarkProtocolClient } from './client';
import type { AIAgent, AIAgentCapability, TEEAttestation } from './types';

export class AIAgentManager {
  private client: DarkProtocolClient;
  private redpillApiKey?: string;

  constructor(client: DarkProtocolClient, redpillApiKey?: string) {
    this.client = client;
    this.redpillApiKey = redpillApiKey;
  }

  /**
   * Register new AI agent in TEE environment
   */
  async registerAgent(params: {
    agentPubkey: PublicKey;
    teeAttestation: TEEAttestation;
    capabilities: AIAgentCapability[];
    owner: PublicKey;
  }): Promise<string> {
    // Verify TEE attestation
    const attestationValid = await this.verifyTEEAttestation(params.teeAttestation);
    if (!attestationValid) {
      throw new Error('Invalid TEE attestation');
    }

    // Encode capabilities
    const capabilitiesBytes = this.encodeCapabilities(params.capabilities);
    const attestationHash = params.teeAttestation.measurement;

    const tx = await this.client.program.methods
      .registerAiAgent(
        params.agentPubkey,
        Array.from(attestationHash),
        Array.from(capabilitiesBytes)
      )
      .accounts({
        authority: params.owner,
        systemProgram: PublicKey.default,
      })
      .rpc();

    return tx;
  }

  /**
   * Execute AI agent action
   */
  async executeAction(params: {
    agentPubkey: PublicKey;
    actionType: number;
    encryptedParams: Uint8Array;
    proof: Uint8Array;
    executor: PublicKey;
  }): Promise<string> {
    const tx = await this.client.program.methods
      .executeAiAction(
        params.actionType,
        Array.from(params.encryptedParams),
        Array.from(params.proof)
      )
      .accounts({
        executor: params.executor,
      })
      .rpc();

    return tx;
  }

  /**
   * Get AI agent information
   */
  async getAgent(agentPubkey: PublicKey): Promise<AIAgent | null> {
    return await this.client.getAIAgent(agentPubkey);
  }

  /**
   * Verify TEE attestation using Intel SGX or AMD SEV
   */
  private async verifyTEEAttestation(attestation: TEEAttestation): Promise<boolean> {
    // In production, verify with Intel IAS or AMD SEV attestation service
    if (this.redpillApiKey) {
      try {
        const response = await fetch('https://api.redpill.ai/v1/verify-attestation', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.redpillApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            measurement: Buffer.from(attestation.measurement).toString('hex'),
            timestamp: attestation.timestamp,
            signature: Buffer.from(attestation.signature).toString('hex'),
          }),
        });

        if (!response.ok) {
          return false;
        }

        const result = await response.json();
        return result.valid === true;
      } catch (error) {
        console.error('TEE attestation verification failed:', error);
        return false;
      }
    }

    // Fallback: basic validation
    return attestation.measurement.length === 32 &&
           attestation.signature.length > 0;
  }

  /**
   * Encode AI agent capabilities
   */
  private encodeCapabilities(capabilities: AIAgentCapability[]): Uint8Array {
    const json = JSON.stringify(capabilities);
    return new TextEncoder().encode(json);
  }

  /**
   * Decode AI agent capabilities
   */
  decodeCapabilities(capabilitiesBytes: Uint8Array): AIAgentCapability[] {
    const json = new TextDecoder().decode(capabilitiesBytes);
    return JSON.parse(json);
  }

  /**
   * Request AI agent analysis
   */
  async requestAnalysis(params: {
    agentPubkey: PublicKey;
    dataType: 'portfolio' | 'market' | 'risk';
    encryptedData: Uint8Array;
  }): Promise<any> {
    if (!this.redpillApiKey) {
      throw new Error('REDPILL_API_KEY required for AI analysis');
    }

    const response = await fetch('https://api.redpill.ai/v1/analyze', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.redpillApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent: params.agentPubkey.toString(),
        type: params.dataType,
        data: Buffer.from(params.encryptedData).toString('base64'),
      }),
    });

    if (!response.ok) {
      throw new Error(`AI analysis failed: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Get agent recommendations for swaps
   */
  async getSwapRecommendations(params: {
    agentPubkey: PublicKey;
    portfolioData: any;
  }): Promise<any[]> {
    const encryptedData = new TextEncoder().encode(JSON.stringify(params.portfolioData));

    const analysis = await this.requestAnalysis({
      agentPubkey: params.agentPubkey,
      dataType: 'portfolio',
      encryptedData,
    });

    return analysis.recommendations || [];
  }
}
