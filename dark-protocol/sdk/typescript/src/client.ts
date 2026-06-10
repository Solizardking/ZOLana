import { Connection, PublicKey, Transaction, Keypair } from '@solana/web3.js';
import { AnchorProvider, Idl } from '@coral-xyz/anchor';
import { createHelius } from 'helius-sdk';
import { createDarkProtocolConfigFromEnv, resolveHeliusRpcUrl, type DarkProtocolCluster } from './config';
import type { PrivatePaymentReceipt } from './private-payment';
import {
  decodeDarkIntentMemo,
  readDarkMemoInstructionText,
  verifyPrivatePaymentIntentPayload,
  type DarkIntentVerificationResult,
} from './intent';

export interface DarkProtocolConfig {
  heliusApiKey?: string;
  jupiterApiKey?: string;
  redpillApiKey?: string;
  xaiApiKey?: string;
  xaiBaseUrl?: string;
  xaiModel?: string;
  cluster?: DarkProtocolCluster;
  rpcUrl?: string;
  programId?: PublicKey;
  commitment?: 'processed' | 'confirmed' | 'finalized';
}

export class DarkProtocolClient {
  public readonly connection: Connection;
  public readonly program: any;
  public readonly helius: ReturnType<typeof createHelius>;
  public readonly config: DarkProtocolConfig;
  
  private constructor(
    connection: Connection,
    program: any,
    helius: ReturnType<typeof createHelius>,
    config: DarkProtocolConfig
  ) {
    this.connection = connection;
    this.program = program;
    this.helius = helius;
    this.config = config;
  }

  /**
   * Create a new Dark Protocol client
   */
  static async create(config: DarkProtocolConfig): Promise<DarkProtocolClient> {
    const rpcUrl = config.rpcUrl || resolveHeliusRpcUrl({
      cluster: config.cluster ?? 'mainnet-beta',
      heliusApiKey: config.heliusApiKey,
    });
    const connection = new Connection(rpcUrl, config.commitment || 'confirmed');
    
    // Create Helius client
    const helius = createHelius({
      apiKey: config.heliusApiKey ?? '',
      network: config.cluster === 'mainnet-beta' ? 'mainnet' : 'devnet',
    });
    
    // Load program IDL and create Anchor program
    const programId = config.programId || new PublicKey('DARKxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXx');
    const provider = new AnchorProvider(connection, {} as any, {
      commitment: config.commitment || 'confirmed'
    });
    
    // Load IDL (in production, fetch from chain or bundle)
    const idl = await DarkProtocolClient.loadIdl();
    const { Program } = await import('@coral-xyz/anchor');
    const program = new (Program as any)(idl, programId, provider);
    
    return new DarkProtocolClient(connection, program, helius, config);
  }

  /**
   * Create a client using HELIUS_RPC_URL / HELIUS_API_KEY / SOLANA_CLUSTER.
   */
  static async fromEnv(overrides: Partial<DarkProtocolConfig> = {}): Promise<DarkProtocolClient> {
    return DarkProtocolClient.create(createDarkProtocolConfigFromEnv(overrides));
  }

  /**
   * Load program IDL
   */
  private static async loadIdl(): Promise<Idl> {
    // In production, fetch from chain or bundle the IDL
    return {} as Idl;
  }

  /**
   * Get protocol state
   */
  async getProtocolState(): Promise<any> {
    const [protocolPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('protocol')],
      this.program.programId
    );
    
    return await this.program.account.protocolState.fetch(protocolPDA);
  }

  /**
   * Get merkle tree state
   */
  async getMerkleTree(): Promise<any> {
    const [merkleTreePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('merkle_tree')],
      this.program.programId
    );
    
    return await this.program.account.merkleTree.fetch(merkleTreePDA);
  }

  /**
   * Create smart transaction with Helius
   */
  async createSmartTx(params: {
    instructions: any[];
    signers: Keypair[];
    feePayer?: PublicKey;
  }) {
    const transaction = new Transaction();
    transaction.add(...params.instructions);
    transaction.feePayer = params.feePayer ?? params.signers[0]?.publicKey;

    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash(this.config.commitment ?? 'confirmed');
    transaction.recentBlockhash = blockhash;
    if (params.signers.length > 0) {
      transaction.partialSign(...params.signers);
    }

    return {
      transaction,
      blockhash,
      lastValidBlockHeight,
      provider: this.config.heliusApiKey ? 'helius-rpc' : 'solana-rpc',
    };
  }

  /**
   * Get shielded address for a user
   */
  async getShieldedAddress(owner: PublicKey): Promise<any> {
    const [shieldedAddressPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('shielded_address'), owner.toBuffer()],
      this.program.programId
    );
    
    try {
      return await this.program.account.shieldedAddress.fetch(shieldedAddressPDA);
    } catch {
      return null;
    }
  }

  /**
   * Get AI agent info
   */
  async getAIAgent(agentPubkey: PublicKey): Promise<any> {
    const [aiAgentPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('ai_agent'), agentPubkey.toBuffer()],
      this.program.programId
    );
    
    try {
      return await this.program.account.aiAgent.fetch(aiAgentPDA);
    } catch {
      return null;
    }
  }

  async verifyPrivatePaymentAnchor(receipt: PrivatePaymentReceipt): Promise<DarkIntentVerificationResult> {
    const signature = receipt.solanaAnchor?.signature;
    if (!signature) {
      return {
        ok: false,
        mismatches: [],
        signature: '',
        reason: 'Receipt does not have a Solana anchor signature',
      };
    }

    const verificationCommitment = this.config.commitment === 'finalized' ? 'finalized' : 'confirmed';
    const transaction = await this.connection.getParsedTransaction(signature, {
      commitment: verificationCommitment,
      maxSupportedTransactionVersion: 0,
    });

    if (!transaction) {
      return {
        ok: false,
        mismatches: [],
        signature,
        reason: 'Transaction was not found on the configured Solana RPC endpoint',
      };
    }

    if (transaction.meta?.err) {
      return {
        ok: false,
        mismatches: [],
        signature,
        slot: transaction.slot,
        blockTime: transaction.blockTime,
        reason: `Transaction failed: ${JSON.stringify(transaction.meta.err)}`,
      };
    }

    for (const instruction of transaction.transaction.message.instructions) {
      const memo = readDarkMemoInstructionText(instruction);
      if (!memo) continue;

      const payload = decodeDarkIntentMemo(memo);
      if (!payload || payload.action !== 'private_payment') continue;

      const expectedPayer = receipt.solanaAnchor?.payer;
      const verification = verifyPrivatePaymentIntentPayload(payload, receipt, expectedPayer);
      return {
        ...verification,
        signature,
        slot: transaction.slot,
        blockTime: transaction.blockTime,
        payer: payload.payer,
        payload,
        reason: verification.ok ? undefined : 'Memo intent payload does not match receipt',
      };
    }

    return {
      ok: false,
      mismatches: [],
      signature,
      slot: transaction.slot,
      blockTime: transaction.blockTime,
      reason: 'No matching ZOLana private-payment Memo intent found in transaction',
    };
  }
}
