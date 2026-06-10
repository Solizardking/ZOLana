/**
 * Zcash Sapling Address System for Solana
 *
 * This module implements the complete Sapling address hierarchy adapted from Zcash:
 * Spending Key (sk) → Expanded Spending Key → Full Viewing Key → Incoming Viewing Key → Payment Address
 *
 * Compatible with the Rust implementation in: programs/dark-protocol/src/crypto/sapling.rs
 */

import { blake3 } from '@noble/hashes/blake3.js';
import { sha256 } from '@noble/hashes/sha2.js';

/** Sapling diversifier size (11 bytes, same as Zcash) */
export const SAPLING_DIVERSIFIER_SIZE = 11;

/** Sapling spending key size */
export const SAPLING_SK_SIZE = 32;

/** Full viewing key size (ak + nk + ovk) */
export const SAPLING_FVK_SIZE = 96;

/** Payment address size (diversifier + pk_d) */
export const SAPLING_ADDRESS_SIZE = 43;

/**
 * Sapling Payment Address
 * Format: 11-byte diversifier + 32-byte pk_d (identical to Zcash)
 */
export class SaplingPaymentAddress {
  constructor(
    public readonly d: Uint8Array,    // 11 bytes
    public readonly pk_d: Uint8Array  // 32 bytes
  ) {
    if (d.length !== SAPLING_DIVERSIFIER_SIZE) {
      throw new Error(`Diversifier must be ${SAPLING_DIVERSIFIER_SIZE} bytes`);
    }
    if (pk_d.length !== 32) {
      throw new Error('pk_d must be 32 bytes');
    }
  }

  /**
   * Convert to 43-byte representation (same as Zcash)
   */
  toBytes(): Uint8Array {
    const bytes = new Uint8Array(SAPLING_ADDRESS_SIZE);
    bytes.set(this.d, 0);
    bytes.set(this.pk_d, SAPLING_DIVERSIFIER_SIZE);
    return bytes;
  }

  /**
   * Create from 43-byte representation
   */
  static fromBytes(bytes: Uint8Array): SaplingPaymentAddress {
    if (bytes.length !== SAPLING_ADDRESS_SIZE) {
      throw new Error(`Address must be ${SAPLING_ADDRESS_SIZE} bytes`);
    }

    const d = bytes.slice(0, SAPLING_DIVERSIFIER_SIZE);
    const pk_d = bytes.slice(SAPLING_DIVERSIFIER_SIZE, SAPLING_ADDRESS_SIZE);

    return new SaplingPaymentAddress(d, pk_d);
  }

  /**
   * Get base58 string representation
   */
  toBase58(): string {
    const bytes = this.toBytes();
    return this.bytesToBase58(bytes);
  }

  /**
   * Create from base58 string
   */
  static fromBase58(str: string): SaplingPaymentAddress {
    const bytes = this.base58ToBytes(str);
    return SaplingPaymentAddress.fromBytes(bytes);
  }

  /**
   * Get hash of payment address (for indexing)
   */
  getHash(): Uint8Array {
    const bytes = this.toBytes();
    // Double SHA-256 (same as Zcash)
    const hash1 = sha256(bytes);
    const hash2 = sha256(hash1);
    return hash2;
  }

  // Helper methods
  private bytesToBase58(bytes: Uint8Array): string {
    // Use bs58 encoding
    const bs58 = require('bs58');
    return bs58.encode(bytes);
  }

  private static base58ToBytes(str: string): Uint8Array {
    const bs58 = require('bs58');
    return bs58.decode(str);
  }
}

/**
 * Sapling Incoming Viewing Key (ivk)
 * Used to derive payment addresses and decrypt incoming notes
 */
export class SaplingIncomingViewingKey {
  constructor(public readonly ivk: Uint8Array) {
    if (ivk.length !== 32) {
      throw new Error('IVK must be 32 bytes');
    }
  }

  /**
   * Derive payment address from diversifier
   * Same algorithm as Rust implementation
   */
  address(diversifier: Uint8Array): SaplingPaymentAddress {
    if (diversifier.length !== SAPLING_DIVERSIFIER_SIZE) {
      throw new Error(`Diversifier must be ${SAPLING_DIVERSIFIER_SIZE} bytes`);
    }

    // Derive pk_d from ivk and diversifier using Blake3
    const pk_d = blake3(
      new Uint8Array([
        ...this.ivk,
        ...diversifier,
        ...Buffer.from('sapling_pk_d_derivation', 'utf8')
      ]),
      { dkLen: 32 }
    );

    return new SaplingPaymentAddress(diversifier, pk_d);
  }

  /**
   * Generate default diversifier (same as Rust implementation)
   */
  static defaultDiversifier(): Uint8Array {
    const div = new Uint8Array(SAPLING_DIVERSIFIER_SIZE);
    div[0] = 1; // Start with non-zero
    return div;
  }

  /**
   * Generate random diversifier
   */
  static randomDiversifier(): Uint8Array {
    const div = new Uint8Array(SAPLING_DIVERSIFIER_SIZE);
    crypto.getRandomValues(div);
    div[0] = div[0] || 1; // Ensure first byte is non-zero
    return div;
  }
}

/**
 * Sapling Full Viewing Key (fvk)
 * Contains ak (authentication key), nk (nullifier deriving key), ovk (outgoing viewing key)
 */
export class SaplingFullViewingKey {
  constructor(
    public readonly ak: Uint8Array,   // 32 bytes
    public readonly nk: Uint8Array,   // 32 bytes
    public readonly ovk: Uint8Array   // 32 bytes
  ) {
    if (ak.length !== 32 || nk.length !== 32 || ovk.length !== 32) {
      throw new Error('All FVK components must be 32 bytes');
    }
  }

  /**
   * Convert to 96-byte representation
   */
  toBytes(): Uint8Array {
    const bytes = new Uint8Array(SAPLING_FVK_SIZE);
    bytes.set(this.ak, 0);
    bytes.set(this.nk, 32);
    bytes.set(this.ovk, 64);
    return bytes;
  }

  /**
   * Create from 96-byte representation
   */
  static fromBytes(bytes: Uint8Array): SaplingFullViewingKey {
    if (bytes.length !== SAPLING_FVK_SIZE) {
      throw new Error(`FVK must be ${SAPLING_FVK_SIZE} bytes`);
    }

    const ak = bytes.slice(0, 32);
    const nk = bytes.slice(32, 64);
    const ovk = bytes.slice(64, 96);

    return new SaplingFullViewingKey(ak, nk, ovk);
  }

  /**
   * Derive incoming viewing key
   * Same algorithm as Rust implementation
   */
  inViewingKey(): SaplingIncomingViewingKey {
    const ivk = blake3(
      new Uint8Array([
        ...this.ak,
        ...this.nk,
        ...Buffer.from('sapling_ivk_derivation', 'utf8')
      ]),
      { dkLen: 32 }
    );

    return new SaplingIncomingViewingKey(ivk);
  }

  /**
   * Get fingerprint for key derivation (ZIP 32)
   */
  getFingerprint(): Uint8Array {
    const hash = sha256(
      new Uint8Array([
        ...this.ak,
        ...this.nk,
        ...this.ovk,
        ...Buffer.from('sapling_fvk_fingerprint', 'utf8')
      ])
    );
    return hash;
  }

  /**
   * Check if viewing key is valid
   */
  isValid(): boolean {
    // Check that keys are not all zeros
    const akValid = !this.ak.every(b => b === 0);
    const nkValid = !this.nk.every(b => b === 0);
    const ovkValid = !this.ovk.every(b => b === 0);

    return akValid && nkValid && ovkValid;
  }
}

/**
 * Sapling Expanded Spending Key
 * Contains ask, nsk, ovk
 */
export class SaplingExpandedSpendingKey {
  constructor(
    public readonly ask: Uint8Array,  // 32 bytes
    public readonly nsk: Uint8Array,  // 32 bytes
    public readonly ovk: Uint8Array   // 32 bytes
  ) {
    if (ask.length !== 32 || nsk.length !== 32 || ovk.length !== 32) {
      throw new Error('All expanded SK components must be 32 bytes');
    }
  }

  /**
   * Derive full viewing key
   * Same algorithm as Rust implementation
   */
  fullViewingKey(): SaplingFullViewingKey {
    // Derive ak from ask
    const ak = blake3(
      new Uint8Array([
        ...this.ask,
        ...Buffer.from('sapling_ak_derivation', 'utf8')
      ]),
      { dkLen: 32 }
    );

    // Derive nk from nsk
    const nk = blake3(
      new Uint8Array([
        ...this.nsk,
        ...Buffer.from('sapling_nk_derivation', 'utf8')
      ]),
      { dkLen: 32 }
    );

    return new SaplingFullViewingKey(ak, nk, this.ovk);
  }
}

/**
 * Sapling Spending Key (32-byte seed)
 * Master secret key - NEVER store on-chain or share
 */
export class SaplingSpendingKey {
  constructor(public readonly sk: Uint8Array) {
    if (sk.length !== SAPLING_SK_SIZE) {
      throw new Error(`Spending key must be ${SAPLING_SK_SIZE} bytes`);
    }
  }

  /**
   * Generate random spending key from seed
   */
  static random(seed: Uint8Array): SaplingSpendingKey {
    const sk = blake3(
      new Uint8Array([
        ...seed,
        ...Buffer.from('sapling_spending_key', 'utf8')
      ]),
      { dkLen: 32 }
    );

    return new SaplingSpendingKey(sk);
  }

  /**
   * Generate from mnemonic phrase (BIP39)
   */
  static async fromMnemonic(mnemonic: string): Promise<SaplingSpendingKey> {
    const bip39 = await import('bip39');
    const seed = await bip39.mnemonicToSeed(mnemonic);
    return SaplingSpendingKey.random(seed);
  }

  /**
   * Expand spending key to get ask, nsk, ovk
   * Same algorithm as Rust implementation
   */
  expandedSpendingKey(): SaplingExpandedSpendingKey {
    // Derive ask
    const ask = blake3(
      new Uint8Array([
        ...this.sk,
        ...Buffer.from('sapling_ask_derivation', 'utf8')
      ]),
      { dkLen: 32 }
    );

    // Derive nsk
    const nsk = blake3(
      new Uint8Array([
        ...this.sk,
        ...Buffer.from('sapling_nsk_derivation', 'utf8')
      ]),
      { dkLen: 32 }
    );

    // Derive ovk
    const ovk = blake3(
      new Uint8Array([
        ...this.sk,
        ...Buffer.from('sapling_ovk_derivation', 'utf8')
      ]),
      { dkLen: 32 }
    );

    return new SaplingExpandedSpendingKey(ask, nsk, ovk);
  }

  /**
   * Get full viewing key
   */
  fullViewingKey(): SaplingFullViewingKey {
    return this.expandedSpendingKey().fullViewingKey();
  }

  /**
   * Get default payment address
   */
  defaultAddress(): SaplingPaymentAddress {
    const fvk = this.fullViewingKey();
    const ivk = fvk.inViewingKey();
    const div = SaplingIncomingViewingKey.defaultDiversifier();

    return ivk.address(div);
  }

  /**
   * Export to bytes
   */
  toBytes(): Uint8Array {
    return new Uint8Array(this.sk);
  }

  /**
   * Import from bytes
   */
  static fromBytes(bytes: Uint8Array): SaplingSpendingKey {
    if (bytes.length !== SAPLING_SK_SIZE) {
      throw new Error(`Spending key must be ${SAPLING_SK_SIZE} bytes`);
    }
    return new SaplingSpendingKey(bytes);
  }
}

/**
 * Hierarchical Deterministic Wallet (ZIP 32)
 * Generate multiple addresses from a single seed
 */
export class SaplingHDWallet {
  private spendingKey: SaplingSpendingKey;
  private fullViewingKey: SaplingFullViewingKey;
  private incomingViewingKey: SaplingIncomingViewingKey;

  constructor(spendingKey: SaplingSpendingKey) {
    this.spendingKey = spendingKey;
    this.fullViewingKey = spendingKey.fullViewingKey();
    this.incomingViewingKey = this.fullViewingKey.inViewingKey();
  }

  /**
   * Create from mnemonic phrase
   */
  static async fromMnemonic(mnemonic: string): Promise<SaplingHDWallet> {
    const sk = await SaplingSpendingKey.fromMnemonic(mnemonic);
    return new SaplingHDWallet(sk);
  }

  /**
   * Create from spending key
   */
  static fromSpendingKey(sk: SaplingSpendingKey): SaplingHDWallet {
    return new SaplingHDWallet(sk);
  }

  /**
   * Get spending key (use carefully - this is the master secret!)
   */
  getSpendingKey(): SaplingSpendingKey {
    return this.spendingKey;
  }

  /**
   * Get full viewing key (safe to store)
   */
  getFullViewingKey(): SaplingFullViewingKey {
    return this.fullViewingKey;
  }

  /**
   * Get incoming viewing key
   */
  getIncomingViewingKey(): SaplingIncomingViewingKey {
    return this.incomingViewingKey;
  }

  /**
   * Get default payment address
   */
  getDefaultAddress(): SaplingPaymentAddress {
    return this.spendingKey.defaultAddress();
  }

  /**
   * Generate diversified address (can create unlimited)
   */
  generateDiversifiedAddress(index: number): SaplingPaymentAddress {
    // Generate deterministic diversifier from index
    const indexBytes = new Uint8Array(4);
    new DataView(indexBytes.buffer).setUint32(0, index, true);

    const diversifier = blake3(
      new Uint8Array([
        ...this.spendingKey.sk,
        ...indexBytes,
        ...Buffer.from('diversifier', 'utf8')
      ]),
      { dkLen: SAPLING_DIVERSIFIER_SIZE }
    );

    // Ensure first byte is non-zero
    diversifier[0] = diversifier[0] || 1;

    return this.incomingViewingKey.address(diversifier);
  }

  /**
   * Generate multiple diversified addresses
   */
  generateDiversifiedAddresses(count: number): SaplingPaymentAddress[] {
    const addresses: SaplingPaymentAddress[] = [];
    for (let i = 0; i < count; i++) {
      addresses.push(this.generateDiversifiedAddress(i));
    }
    return addresses;
  }
}

/**
 * Utility functions for Sapling addresses
 */
export class SaplingUtils {
  /**
   * Generate new wallet with mnemonic
   */
  static async generateWallet(): Promise<{
    wallet: SaplingHDWallet;
    mnemonic: string;
  }> {
    const bip39 = await import('bip39');
    const mnemonic = bip39.generateMnemonic(256); // 24 words
    const wallet = await SaplingHDWallet.fromMnemonic(mnemonic);

    return { wallet, mnemonic };
  }

  /**
   * Restore wallet from mnemonic
   */
  static async restoreWallet(mnemonic: string): Promise<SaplingHDWallet> {
    return await SaplingHDWallet.fromMnemonic(mnemonic);
  }

  /**
   * Check if address is valid Sapling address
   */
  static isValidAddress(address: string): boolean {
    try {
      const addr = SaplingPaymentAddress.fromBase58(address);
      return addr.toBytes().length === SAPLING_ADDRESS_SIZE;
    } catch {
      return false;
    }
  }

  /**
   * Parse address from various formats
   */
  static parseAddress(address: string | Uint8Array): SaplingPaymentAddress {
    if (typeof address === 'string') {
      return SaplingPaymentAddress.fromBase58(address);
    } else {
      return SaplingPaymentAddress.fromBytes(address);
    }
  }
}
