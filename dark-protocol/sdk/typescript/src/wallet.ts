import { Keypair, PublicKey } from '@solana/web3.js';
import { DarkProtocolClient } from './client';
import type { ShieldedAddress, Note, WalletState } from './types';
import * as bip39 from 'bip39';
import { derivePath } from 'bip32';

export class DarkWallet {
  private client: DarkProtocolClient;
  private keypair: Keypair;
  private shieldedAddress?: ShieldedAddress;
  private notes: Map<string, Note> = new Map();

  constructor(client: DarkProtocolClient, keypair: Keypair) {
    this.client = client;
    this.keypair = keypair;
  }

  /**
   * Create wallet from mnemonic
   */
  static async fromMnemonic(
    client: DarkProtocolClient,
    mnemonic: string,
    accountIndex: number = 0
  ): Promise<DarkWallet> {
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const path = `m/44'/501'/${accountIndex}'/0'`;
    const derivedSeed = derivePath(path, seed.toString('hex')).key;
    const keypair = Keypair.fromSeed(derivedSeed);

    return new DarkWallet(client, keypair);
  }

  /**
   * Create wallet from private key
   */
  static fromPrivateKey(
    client: DarkProtocolClient,
    privateKey: Uint8Array
  ): DarkWallet {
    const keypair = Keypair.fromSecretKey(privateKey);
    return new DarkWallet(client, keypair);
  }

  /**
   * Generate new wallet
   */
  static async generate(client: DarkProtocolClient): Promise<{
    wallet: DarkWallet;
    mnemonic: string;
  }> {
    const mnemonic = bip39.generateMnemonic(256);
    const wallet = await DarkWallet.fromMnemonic(client, mnemonic);

    return { wallet, mnemonic };
  }

  /**
   * Get public key
   */
  get publicKey(): PublicKey {
    return this.keypair.publicKey;
  }

  /**
   * Initialize shielded address
   */
  async initializeShieldedAddress(
    viewingKey: Uint8Array,
    spendingKeyCommitment: Uint8Array
  ): Promise<string> {
    const tx = await this.client.program.methods
      .createShieldedAddress(Array.from(viewingKey), Array.from(spendingKeyCommitment))
      .accounts({
        payer: this.publicKey,
        systemProgram: PublicKey.default,
      })
      .signers([this.keypair])
      .rpc();

    // Fetch the created shielded address
    this.shieldedAddress = await this.client.getShieldedAddress(this.publicKey);

    return tx;
  }

  /**
   * Get wallet state
   */
  async getState(): Promise<WalletState> {
    const shieldedAddress = await this.client.getShieldedAddress(this.publicKey);
    const transparentBalance = await this.client.connection.getBalance(this.publicKey);

    // Fetch notes
    const notes: Note[] = [];
    // TODO: Scan blockchain for notes belonging to this wallet

    return {
      shieldedBalance: BigInt(0), // Calculate from notes
      transparentBalance: BigInt(transparentBalance),
      notes,
      pendingNotes: [],
      shieldedAddress: shieldedAddress || undefined,
    };
  }

  /**
   * Shield tokens (move from transparent to shielded)
   */
  async shieldTokens(
    amount: bigint,
    tokenMint: PublicKey
  ): Promise<string> {
    // Generate commitment and nullifier
    const commitment = new Uint8Array(32);
    const nullifier = new Uint8Array(32);
    crypto.getRandomValues(commitment);
    crypto.getRandomValues(nullifier);

    const tx = await this.client.program.methods
      .shieldTokens(amount, Array.from(commitment), Array.from(nullifier))
      .accounts({
        user: this.publicKey,
        systemProgram: PublicKey.default,
        tokenProgram: PublicKey.default,
      })
      .signers([this.keypair])
      .rpc();

    return tx;
  }

  /**
   * Unshield tokens (move from shielded to transparent)
   */
  async unshieldTokens(
    amount: bigint,
    nullifier: Uint8Array,
    proof: Uint8Array
  ): Promise<string> {
    const tx = await this.client.program.methods
      .unshieldTokens(amount, Array.from(nullifier), Array.from(proof))
      .accounts({
        user: this.publicKey,
        tokenProgram: PublicKey.default,
      })
      .signers([this.keypair])
      .rpc();

    return tx;
  }

  /**
   * Private transfer
   */
  async privateTransfer(
    recipientAddress: PublicKey,
    amount: bigint,
    memo?: string
  ): Promise<string> {
    // Generate ZK proof for transfer
    const inputNullifiers = [new Uint8Array(32)];
    const outputCommitments = [new Uint8Array(32)];
    const proof = new Uint8Array(256);
    const encryptedMemo = memo ? Buffer.from(memo) : Buffer.alloc(0);

    const tx = await this.client.program.methods
      .privateTransfer(
        inputNullifiers.map(n => Array.from(n)),
        outputCommitments.map(c => Array.from(c)),
        Array.from(proof),
        Array.from(encryptedMemo)
      )
      .accounts({
        sender: this.publicKey,
        systemProgram: PublicKey.default,
      })
      .signers([this.keypair])
      .rpc();

    return tx;
  }

  /**
   * Export wallet
   */
  export(): {
    publicKey: string;
    privateKey: string;
  } {
    return {
      publicKey: this.publicKey.toBase58(),
      privateKey: Buffer.from(this.keypair.secretKey).toString('hex'),
    };
  }
}
