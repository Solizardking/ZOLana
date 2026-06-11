/**
 * Dark Protocol SDK - Simplified version for wallet integration
 * This is a minimal implementation to get the wallet working
 */

import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { AnchorProvider } from '@coral-xyz/anchor';
import { Buffer } from 'buffer';
import bs58 from 'bs58';
import type { PrivatePaymentReceipt } from './private-payment';
import {
  getShieldedBalanceLamports,
  getShieldedBalanceSol,
  getShieldedLedgerEntries,
  hasShieldedBalance,
  lamportsToSol,
  recordShieldedLedgerEntry,
} from './shielded-ledger';
import type { DarkShieldedLedgerEntry, DarkShieldedLedgerAction, DarkShieldedLedgerDirection } from './shielded-ledger';

export type { DarkShieldedLedgerEntry } from './shielded-ledger';

// Dark Protocol Program ID on Devnet
export const DARK_PROTOCOL_PROGRAM_ID = new PublicKey('Frf98UwzjLqiFUTNVY8kEdZsUW3xCuuSm8MSayBSmk4X');
export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

export type DarkIntentAction = 'shield' | 'unshield' | 'private_transfer' | 'private_payment';

export interface DarkIntentPayload {
  protocol: 'zolana.dark';
  version: 1;
  action: DarkIntentAction;
  payer: string;
  amountLamports: string;
  commitment: string;
  createdAt: number;
  memoHash?: string;
  recipient?: string;
  shieldedAddress?: string;
  rail?: 'x402' | 'ap2' | 'm2m';
  settlement?: 'solana' | 'evm';
  proofLayer?: 'solana' | 'evm';
  durableReceipt?: boolean;
  receiptId?: string;
}

export interface DarkIntentVerificationResult {
  ok: boolean;
  signature: string;
  slot?: number;
  blockTime?: number | null;
  payer?: string;
  payload?: DarkIntentPayload;
  reason?: string;
  mismatches?: string[];
}

// Simplified IDL type (we'll need to generate the full one from the program)
export interface DarkProtocolIDL {
  version: string;
  name: string;
  instructions: any[];
}

/**
 * Initialize Dark Protocol client
 */
export class DarkProtocolClient {
  connection: Connection;
  wallet: any;
  provider: AnchorProvider | null = null;

  constructor(connection: Connection, wallet: any) {
    this.connection = connection;
    this.wallet = wallet;

    if (wallet.publicKey) {
      this.provider = new AnchorProvider(
        connection,
        wallet,
        { commitment: 'confirmed' }
      );
    }
  }

  private amountToLamports(amount: number): string {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Amount must be greater than zero');
    }

    return BigInt(Math.round(amount * 1_000_000_000)).toString();
  }

  private ownerAddress(): string {
    if (!this.wallet.publicKey) {
      throw new Error('Wallet not connected');
    }

    return this.wallet.publicKey.toBase58();
  }

  private stableHex(input: string, bytes = 32): string {
    const output = new Uint8Array(bytes);
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;

    for (let index = 0; index < input.length; index += 1) {
      const code = input.charCodeAt(index);
      h1 ^= code;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= code + index;
      h2 = Math.imul(h2, 0x85ebca6b);
    }

    for (let index = 0; index < output.length; index += 1) {
      h1 ^= h2 + index;
      h1 = Math.imul(h1, 0xc2b2ae35);
      h2 ^= h1 >>> 13;
      output[index] = (h1 ^ h2 ^ (h1 >>> 16)) & 0xff;
    }

    return Array.from(output, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  private memoHash(memo?: string): string | undefined {
    const trimmed = memo?.trim();
    return trimmed ? `0x${this.stableHex(trimmed, 16)}` : undefined;
  }

  private createCommitment(action: DarkIntentAction, fields: string[]): string {
    return `0x${this.stableHex([action, ...fields, Date.now().toString()].join('|'))}`;
  }

  private createNullifier(action: DarkIntentAction, fields: string[]): string {
    return `0x${this.stableHex(['nullifier', action, ...fields].join('|'))}`;
  }

  private requireShieldedBalance(amountLamports: string, action: DarkShieldedLedgerAction): void {
    const owner = this.ownerAddress();
    if (hasShieldedBalance(owner, amountLamports)) {
      return;
    }

    const available = lamportsToSol(getShieldedBalanceLamports(owner)).toFixed(4);
    const requested = lamportsToSol(amountLamports).toFixed(4);
    throw new Error(
      `Insufficient local shielded note balance for ${action}. Available ${available} SOL, requested ${requested} SOL.`,
    );
  }

  private recordShieldedIntent(params: {
    action: DarkShieldedLedgerAction;
    direction: DarkShieldedLedgerDirection;
    amountLamports: string;
    commitment: string;
    createdAt: number;
    signature: string;
    memoHash?: string;
    recipient?: string;
    shieldedAddress?: string;
    nullifier?: string;
  }): void {
    recordShieldedLedgerEntry({
      id: `${params.signature}:${params.action}:${params.commitment}`,
      owner: this.ownerAddress(),
      action: params.action,
      direction: params.direction,
      amountLamports: params.amountLamports,
      commitment: params.commitment,
      createdAt: params.createdAt,
      signature: params.signature,
      memoHash: params.memoHash,
      recipient: params.recipient,
      shieldedAddress: params.shieldedAddress,
      nullifier: params.nullifier,
    });
  }

  private parseDarkIntentPayload(raw: string): DarkIntentPayload | null {
    try {
      const parsed = JSON.parse(raw);
      if (
        parsed
        && parsed.protocol === 'zolana.dark'
        && parsed.version === 1
        && typeof parsed.action === 'string'
      ) {
        return parsed as DarkIntentPayload;
      }
    } catch {
      return null;
    }

    return null;
  }

  private readMemoText(instruction: any): string | null {
    const programId = instruction?.programId?.toBase58?.() ?? instruction?.programId?.toString?.();
    if (programId !== MEMO_PROGRAM_ID.toBase58()) {
      return null;
    }

    if (typeof instruction.parsed === 'string') {
      return instruction.parsed;
    }

    if (typeof instruction.parsed?.memo === 'string') {
      return instruction.parsed.memo;
    }

    if (typeof instruction.data === 'string') {
      try {
        return Buffer.from(bs58.decode(instruction.data)).toString('utf8');
      } catch {
        return null;
      }
    }

    return null;
  }

  private comparePrivatePaymentIntent(
    payload: DarkIntentPayload,
    receipt: PrivatePaymentReceipt,
    expectedPayer?: string,
  ): string[] {
    const expectedMemoHash = this.memoHash(receipt.memo);
    const checks: Array<[string, unknown, unknown]> = [
      ['protocol', payload.protocol, 'zolana.dark'],
      ['version', payload.version, 1],
      ['action', payload.action, 'private_payment'],
      ['receiptId', payload.receiptId, receipt.id],
      ['recipient', payload.recipient, receipt.recipient],
      ['amountLamports', payload.amountLamports, receipt.amountLamports],
      ['commitment', payload.commitment, receipt.commitmentHex],
      ['rail', payload.rail, receipt.rail],
      ['settlement', payload.settlement, receipt.settlement],
      ['proofLayer', payload.proofLayer, receipt.proofLayer],
      ['durableReceipt', payload.durableReceipt, receipt.durableReceipt],
    ];

    if (expectedPayer) {
      checks.push(['payer', payload.payer, expectedPayer]);
    }

    if (expectedMemoHash) {
      checks.push(['memoHash', payload.memoHash, expectedMemoHash]);
    }

    return checks
      .filter(([, actual, expected]) => actual !== expected)
      .map(([field, actual, expected]) => `${field}: expected ${String(expected)}, got ${String(actual)}`);
  }

  buildIntentTransaction(payload: DarkIntentPayload): Transaction {
    if (!this.wallet.publicKey) {
      throw new Error('Wallet not connected');
    }

    const encoded = Buffer.from(JSON.stringify(payload), 'utf8');
    const transaction = new Transaction().add(new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: this.wallet.publicKey, isSigner: true, isWritable: false }],
      data: encoded,
    }));
    transaction.feePayer = this.wallet.publicKey;
    return transaction;
  }

  async sendIntent(payload: DarkIntentPayload): Promise<string> {
    if (!this.wallet.publicKey) {
      throw new Error('Wallet not connected');
    }

    if (typeof this.wallet.sendTransaction !== 'function') {
      throw new Error('Connected wallet cannot send transactions');
    }

    const transaction = this.buildIntentTransaction(payload);
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    const signature = await this.wallet.sendTransaction(transaction, this.connection);
    await this.connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
    return signature;
  }

  /**
   * Shield tokens - convert transparent SOL to shielded SOL
   */
  async shieldTokens(amount: number, memo?: string): Promise<string> {
    if (!this.wallet.publicKey) {
      throw new Error('Wallet not connected');
    }

    const amountLamports = this.amountToLamports(amount);
    const createdAt = Date.now();
    const memoHash = this.memoHash(memo);
    const commitment = this.createCommitment('shield', [
      this.wallet.publicKey.toBase58(),
      amountLamports,
      memo ?? '',
    ]);

    const signature = await this.sendIntent({
      protocol: 'zolana.dark',
      version: 1,
      action: 'shield',
      payer: this.wallet.publicKey.toBase58(),
      amountLamports,
      commitment,
      createdAt,
      memoHash,
    });

    this.recordShieldedIntent({
      action: 'shield',
      direction: 'credit',
      amountLamports,
      commitment,
      createdAt,
      signature,
      memoHash,
    });

    return signature;
  }

  /**
   * Unshield tokens - convert shielded SOL back to transparent SOL
   */
  async unshieldTokens(amount: number, recipient?: PublicKey): Promise<string> {
    if (!this.wallet.publicKey) {
      throw new Error('Wallet not connected');
    }

    const recipientAddress = recipient || this.wallet.publicKey;
    const amountLamports = this.amountToLamports(amount);
    this.requireShieldedBalance(amountLamports, 'unshield');
    const createdAt = Date.now();
    const commitment = this.createCommitment('unshield', [
      this.wallet.publicKey.toBase58(),
      recipientAddress.toBase58(),
      amountLamports,
    ]);

    const signature = await this.sendIntent({
      protocol: 'zolana.dark',
      version: 1,
      action: 'unshield',
      payer: this.wallet.publicKey.toBase58(),
      recipient: recipientAddress.toBase58(),
      amountLamports,
      commitment,
      createdAt,
    });

    this.recordShieldedIntent({
      action: 'unshield',
      direction: 'debit',
      amountLamports,
      commitment,
      createdAt,
      signature,
      recipient: recipientAddress.toBase58(),
      nullifier: this.createNullifier('unshield', [
        this.wallet.publicKey.toBase58(),
        recipientAddress.toBase58(),
        amountLamports,
        signature,
      ]),
    });

    return signature;
  }

  /**
   * Private transfer - send tokens between shielded addresses
   */
  async privateTransfer(
    recipientAddress: string,
    amount: number,
    memo?: string
  ): Promise<string> {
    if (!this.wallet.publicKey) {
      throw new Error('Wallet not connected');
    }

    // Validate shielded address format during the Zcash -> ZOLana migration.
    if (!recipientAddress.startsWith('zs1') && !recipientAddress.startsWith('zsol1')) {
      throw new Error('Invalid shielded address. Must start with zs1 or zsol1');
    }

    const amountLamports = this.amountToLamports(amount);
    this.requireShieldedBalance(amountLamports, 'private_transfer');
    const createdAt = Date.now();
    const memoHash = this.memoHash(memo);
    const commitment = this.createCommitment('private_transfer', [
      this.wallet.publicKey.toBase58(),
      recipientAddress,
      amountLamports,
      memo ?? '',
    ]);

    const signature = await this.sendIntent({
      protocol: 'zolana.dark',
      version: 1,
      action: 'private_transfer',
      payer: this.wallet.publicKey.toBase58(),
      shieldedAddress: recipientAddress,
      amountLamports,
      commitment,
      createdAt,
      memoHash,
    });

    this.recordShieldedIntent({
      action: 'private_transfer',
      direction: 'debit',
      amountLamports,
      commitment,
      createdAt,
      signature,
      memoHash,
      shieldedAddress: recipientAddress,
      nullifier: this.createNullifier('private_transfer', [
        this.wallet.publicKey.toBase58(),
        recipientAddress,
        amountLamports,
        signature,
      ]),
    });

    return signature;
  }

  async anchorPrivatePayment(receipt: PrivatePaymentReceipt): Promise<string> {
    if (!this.wallet.publicKey) {
      throw new Error('Wallet not connected');
    }

    return this.sendIntent({
      protocol: 'zolana.dark',
      version: 1,
      action: 'private_payment',
      payer: this.wallet.publicKey.toBase58(),
      recipient: receipt.recipient,
      amountLamports: receipt.amountLamports,
      commitment: receipt.commitmentHex,
      createdAt: receipt.createdAt,
      memoHash: this.memoHash(receipt.memo),
      rail: receipt.rail,
      settlement: receipt.settlement,
      proofLayer: receipt.proofLayer,
      durableReceipt: receipt.durableReceipt,
      receiptId: receipt.id,
    });
  }

  async verifyPrivatePaymentAnchor(receipt: PrivatePaymentReceipt): Promise<DarkIntentVerificationResult> {
    const signature = receipt.solanaAnchor?.signature;
    if (!signature) {
      return {
        ok: false,
        signature: '',
        reason: 'Receipt does not have a Solana anchor signature',
      };
    }

    const transaction = await this.connection.getParsedTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!transaction) {
      return {
        ok: false,
        signature,
        reason: 'Transaction was not found on the configured Solana RPC endpoint',
      };
    }

    if (transaction.meta?.err) {
      return {
        ok: false,
        signature,
        slot: transaction.slot,
        blockTime: transaction.blockTime,
        reason: `Transaction failed: ${JSON.stringify(transaction.meta.err)}`,
      };
    }

    const instructions = transaction.transaction.message.instructions;
    for (const instruction of instructions) {
      const memo = this.readMemoText(instruction);
      if (!memo) {
        continue;
      }

      const payload = this.parseDarkIntentPayload(memo);
      if (!payload || payload.action !== 'private_payment') {
        continue;
      }

      const expectedPayer = receipt.solanaAnchor?.payer ?? this.wallet.publicKey?.toBase58?.();
      const mismatches = this.comparePrivatePaymentIntent(payload, receipt, expectedPayer);
      return {
        ok: mismatches.length === 0,
        signature,
        slot: transaction.slot,
        blockTime: transaction.blockTime,
        payer: payload.payer,
        payload,
        mismatches,
        reason: mismatches.length > 0 ? 'Memo intent payload does not match receipt' : undefined,
      };
    }

    return {
      ok: false,
      signature,
      slot: transaction.slot,
      blockTime: transaction.blockTime,
      reason: 'No matching ZOLana private-payment Memo intent found in transaction',
    };
  }

  /**
   * Get shielded balance
   */
  async getShieldedBalance(): Promise<number> {
    if (!this.wallet.publicKey) {
      return 0;
    }

    return getShieldedBalanceSol(this.wallet.publicKey.toBase58());
  }

  getShieldedNotes(): DarkShieldedLedgerEntry[] {
    if (!this.wallet.publicKey) {
      return [];
    }

    return getShieldedLedgerEntries(this.wallet.publicKey.toBase58());
  }

  /**
   * Get transparent balance
   */
  async getTransparentBalance(): Promise<number> {
    if (!this.wallet.publicKey) {
      return 0;
    }

    try {
      const balance = await this.connection.getBalance(this.wallet.publicKey);
      return balance / 1e9; // Convert lamports to SOL
    } catch (error) {
      console.error('Error fetching transparent balance:', error);
      return 0;
    }
  }

  /**
   * Generate a new shielded address
   */
  async generateShieldedAddress(): Promise<string> {
    const crypto = globalThis.crypto;
    if (!crypto?.getRandomValues) {
      throw new Error('Secure browser entropy is required to generate a ZOLana shielded address');
    }

    const random = new Uint8Array(48);
    crypto.getRandomValues(random);

    const owner = this.wallet.publicKey?.toBase58?.() ?? 'offline';
    const label = new TextEncoder().encode(`zolana-shielded-address|${owner}|${Date.now()}`);
    const material = new Uint8Array(random.length + label.length);
    material.set(random);
    material.set(label, random.length);

    if (crypto.subtle?.digest) {
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', material));
      const addressMaterial = new Uint8Array(random.length + digest.length);
      addressMaterial.set(random);
      addressMaterial.set(digest, random.length);
      return `zsol1${bs58.encode(addressMaterial).slice(0, 72)}`;
    }

    return `zsol1${bs58.encode(material).slice(0, 72)}`;
  }
}

/**
 * Helper to create a Dark Protocol client
 */
export function createDarkProtocolClient(
  connection: Connection,
  wallet: any
): DarkProtocolClient {
  return new DarkProtocolClient(connection, wallet);
}

/**
 * Helper to validate shielded address
 */
export function isValidShieldedAddress(address: string): boolean {
  // Zcash Sapling addresses start with zs1; ZOLana shielded addresses use zsol1.
  return (address.startsWith('zs1') && address.length >= 78) ||
    (address.startsWith('zsol1') && address.length >= 50);
}

/**
 * Format SOL amount for display
 */
export function formatSOL(amount: number): string {
  return amount.toFixed(4) + ' SOL';
}
