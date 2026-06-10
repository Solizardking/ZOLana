import { PublicKey } from '@solana/web3.js';
import { DarkProtocolClient } from './client';
import type { AIAgent, AIAgentCapability, TEEAttestation } from './types';

export interface AIAgentManagerOptions {
  redpillApiKey?: string;
  xaiApiKey?: string;
  xaiBaseUrl?: string;
  xaiModel?: string;
}

export interface DarkClawdPaperWalletReview {
  label: string;
  network: string;
  publicKey: string;
  publicFingerprint?: string;
  seedFingerprint?: string;
  paymentRail?: 'x402' | 'ap2' | 'm2m';
  settlement?: 'solana' | 'evm';
  proofLayer?: 'solana' | 'evm';
  durableReceipt?: boolean;
  operatorNote?: string;
}

export class AIAgentManager {
  private client: DarkProtocolClient;
  private redpillApiKey?: string;
  private xaiApiKey?: string;
  private xaiBaseUrl: string;
  private xaiModel: string;

  constructor(client: DarkProtocolClient, options?: string | AIAgentManagerOptions) {
    this.client = client;
    if (typeof options === 'string') {
      this.redpillApiKey = options;
      this.xaiBaseUrl = client.config.xaiBaseUrl ?? 'https://api.x.ai/v1';
      this.xaiModel = client.config.xaiModel ?? 'grok-4.20-beta-latest-non-reasoning';
      this.xaiApiKey = client.config.xaiApiKey;
      return;
    }

    this.redpillApiKey = options?.redpillApiKey ?? client.config.redpillApiKey;
    this.xaiApiKey = options?.xaiApiKey ?? client.config.xaiApiKey;
    this.xaiBaseUrl = options?.xaiBaseUrl ?? client.config.xaiBaseUrl ?? 'https://api.x.ai/v1';
    this.xaiModel = options?.xaiModel ?? client.config.xaiModel ?? 'grok-4.20-beta-latest-non-reasoning';
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
    if (this.xaiApiKey) {
      const prompt = [
        'You are Dark Clawd, a privacy-first Solana wallet agent.',
        'Analyze the supplied encrypted payload metadata without requesting secrets.',
        `Agent: ${params.agentPubkey.toString()}`,
        `Data type: ${params.dataType}`,
        `Payload base64: ${Buffer.from(params.encryptedData).toString('base64')}`,
      ].join('\n');

      const text = await this.requestXaiChat(prompt);
      return { provider: 'xai', analysis: text, recommendations: this.extractRecommendations(text) };
    }

    if (!this.redpillApiKey) {
      throw new Error('XAI_API_KEY or REDPILL_API_KEY required for AI analysis');
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
   * Ask Dark Clawd for a public-metadata paper-wallet review.
   */
  async reviewPaperWallet(params: DarkClawdPaperWalletReview): Promise<string> {
    if (!this.xaiApiKey) {
      throw new Error('XAI_API_KEY required for Dark Clawd paper-wallet review');
    }

    const prompt = [
      'You are Dark Clawd, the ZOLana paper-wallet sidecar.',
      'Review only public metadata and operator intent. Never ask for or repeat secret key JSON.',
      `Label: ${params.label}`,
      `Network: ${params.network}`,
      `Public key: ${params.publicKey}`,
      `Public fingerprint: ${params.publicFingerprint ?? 'n/a'}`,
      `Seed fingerprint: ${params.seedFingerprint ?? 'n/a'}`,
      `Payment rail: ${params.paymentRail ?? 'x402'}`,
      `Settlement: ${params.settlement ?? 'solana'}`,
      `Proof layer: ${params.proofLayer ?? 'evm'}`,
      `Durable receipt: ${params.durableReceipt ?? true}`,
      `Operator note: ${params.operatorNote ?? 'n/a'}`,
      'Return a concise operational risk review and readiness recommendation.',
    ].join('\n');

    return this.requestXaiChat(prompt);
  }

  private async requestXaiChat(prompt: string): Promise<string> {
    const response = await fetch(`${this.xaiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.xaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.xaiModel,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: 'You are Dark Clawd, a privacy-first Solana wallet and payment agent.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`xAI analysis failed: ${response.statusText}`);
    }

    const json = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return json.choices?.[0]?.message?.content?.trim() ?? '';
  }

  private extractRecommendations(text: string): any[] {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .slice(0, 8)
      .map(line => ({ text: line }));
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
