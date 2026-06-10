import { Connection, PublicKey, Transaction, Keypair } from '@solana/web3.js';
import { AnchorProvider, Program, Idl } from '@coral-xyz/anchor';
import { createHelius } from 'helius-sdk/rpc';
import { createSmartTransaction } from 'helius-sdk/transactions';
import type { DarkProtocol } from './types/dark_protocol';

export interface DarkProtocolConfig {
  heliusApiKey: string;
  jupiterApiKey?: string;
  redpillApiKey?: string;
  rpcUrl?: string;
  programId?: PublicKey;
  commitment?: 'processed' | 'confirmed' | 'finalized';
}

export class DarkProtocolClient {
  public readonly connection: Connection;
  public readonly program: Program<DarkProtocol>;
  public readonly helius: ReturnType<typeof createHelius>;
  public readonly config: DarkProtocolConfig;
  
  private constructor(
    connection: Connection,
    program: Program<DarkProtocol>,
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
    const rpcUrl = config.rpcUrl || `https://mainnet.helius-rpc.com/?api-key=${config.heliusApiKey}`;
    const connection = new Connection(rpcUrl, config.commitment || 'confirmed');
    
    // Create Helius client
    const helius = createHelius(config.heliusApiKey);
    
    // Load program IDL and create Anchor program
    const programId = config.programId || new PublicKey('DARKxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXx');
    const provider = new AnchorProvider(connection, {} as any, {
      commitment: config.commitment || 'confirmed'
    });
    
    // Load IDL (in production, fetch from chain or bundle)
    const idl = await DarkProtocolClient.loadIdl();
    const program = new Program<DarkProtocol>(idl as any, programId, provider);
    
    return new DarkProtocolClient(connection, program, helius, config);
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
    return await createSmartTransaction({
      instructions: params.instructions,
      signers: params.signers.map(kp => ({
        address: kp.publicKey.toBase58() as any,
        sign: async (msg: Uint8Array) => kp.sign(msg)
      }) as any),
      feePayer: params.feePayer?.toBase58() as any
    });
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
}
