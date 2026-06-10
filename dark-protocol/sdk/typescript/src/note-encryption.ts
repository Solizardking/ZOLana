/**
 * Zcash-style Note Encryption for Solana
 *
 * Implements encrypted note transmission with ChaCha20-Poly1305 AEAD
 * Compatible with: programs/dark-protocol/src/crypto/note_encryption.rs
 */

import { blake3 } from '@noble/hashes/blake3';
import { sha256 } from '@noble/hashes/sha256';
import { chacha20poly1305 } from '@noble/ciphers/chacha';
import { SaplingPaymentAddress, SaplingIncomingViewingKey } from './sapling';

/** Authentication bytes for encrypted data */
export const NOTEENCRYPTION_AUTH_BYTES = 16;

/** Note plaintext field sizes */
export const V_SIZE = 8;         // Value (amount)
export const RHO_SIZE = 32;      // Nullifier seed
export const R_SIZE = 32;        // Randomness
export const MEMO_SIZE = 512;    // Memo field

/** Sapling encrypted plaintext size */
export const SAPLING_ENCPLAINTEXT_SIZE =
  1 + 11 + V_SIZE + R_SIZE + MEMO_SIZE; // leadbyte + diversifier + value + rseed + memo

/** Sapling outgoing plaintext size */
export const SAPLING_OUTPLAINTEXT_SIZE = 32 + 32; // pk_d + esk

/** Sapling ciphertext sizes */
export const SAPLING_ENCCIPHERTEXT_SIZE =
  SAPLING_ENCPLAINTEXT_SIZE + NOTEENCRYPTION_AUTH_BYTES;

export const SAPLING_OUTCIPHERTEXT_SIZE =
  SAPLING_OUTPLAINTEXT_SIZE + NOTEENCRYPTION_AUTH_BYTES;

/**
 * Sapling Note Plaintext
 * Structure before encryption
 */
export class SaplingNotePlaintext {
  constructor(
    public readonly leadbyte: number,        // 1 byte (0x01 or 0x02 for ZIP 212)
    public readonly d: Uint8Array,           // 11 bytes (diversifier)
    public readonly value: bigint,           // 8 bytes (note amount)
    public readonly rseed: Uint8Array,       // 32 bytes (randomness seed)
    public readonly memo: Uint8Array         // 512 bytes (memo field)
  ) {
    if (d.length !== 11) throw new Error('Diversifier must be 11 bytes');
    if (rseed.length !== 32) throw new Error('rseed must be 32 bytes');
    if (memo.length !== MEMO_SIZE) throw new Error(`Memo must be ${MEMO_SIZE} bytes`);
  }

  /**
   * Create new note plaintext
   */
  static new(
    paymentAddress: SaplingPaymentAddress,
    value: bigint,
    rseed: Uint8Array,
    memo: Uint8Array
  ): SaplingNotePlaintext {
    return new SaplingNotePlaintext(
      0x02, // ZIP 212 activated
      paymentAddress.d,
      value,
      rseed,
      memo
    );
  }

  /**
   * Serialize to bytes
   */
  toBytes(): Uint8Array {
    const bytes = new Uint8Array(SAPLING_ENCPLAINTEXT_SIZE);
    let offset = 0;

    // Leadbyte
    bytes[offset] = this.leadbyte;
    offset += 1;

    // Diversifier (11 bytes)
    bytes.set(this.d, offset);
    offset += 11;

    // Value (8 bytes, little-endian)
    const valueView = new DataView(bytes.buffer, offset, 8);
    valueView.setBigUint64(0, this.value, true);
    offset += 8;

    // Rseed (32 bytes)
    bytes.set(this.rseed, offset);
    offset += 32;

    // Memo (512 bytes)
    bytes.set(this.memo, offset);

    return bytes;
  }

  /**
   * Deserialize from bytes
   */
  static fromBytes(bytes: Uint8Array): SaplingNotePlaintext {
    if (bytes.length !== SAPLING_ENCPLAINTEXT_SIZE) {
      throw new Error(`Invalid plaintext size: ${bytes.length}`);
    }

    let offset = 0;

    // Leadbyte
    const leadbyte = bytes[offset];
    if (leadbyte !== 0x01 && leadbyte !== 0x02) {
      throw new Error('Invalid leadbyte');
    }
    offset += 1;

    // Diversifier
    const d = bytes.slice(offset, offset + 11);
    offset += 11;

    // Value
    const valueView = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
    const value = valueView.getBigUint64(0, true);
    offset += 8;

    // Rseed
    const rseed = bytes.slice(offset, offset + 32);
    offset += 32;

    // Memo
    const memo = bytes.slice(offset, offset + MEMO_SIZE);

    return new SaplingNotePlaintext(leadbyte, d, value, rseed, memo);
  }

  /**
   * Derive note commitment (simplified)
   */
  cm(pk_d: Uint8Array): Uint8Array {
    const hash = blake3(
      new Uint8Array([
        this.leadbyte,
        ...this.d,
        ...pk_d,
        ...this.valueToBytes(),
        ...this.rseed,
        ...Buffer.from('sapling_note_commitment', 'utf8')
      ]),
      { dkLen: 32 }
    );

    return hash;
  }

  /**
   * Derive note commitment randomness
   */
  rcm(): Uint8Array {
    const hash = blake3(
      new Uint8Array([
        ...this.rseed,
        ...Buffer.from('sapling_rcm', 'utf8')
      ]),
      { dkLen: 32 }
    );

    return hash;
  }

  private valueToBytes(): Uint8Array {
    const bytes = new Uint8Array(8);
    const view = new DataView(bytes.buffer);
    view.setBigUint64(0, this.value, true);
    return bytes;
  }
}

/**
 * Sapling Outgoing Plaintext
 * For sender to recover sent notes
 */
export class SaplingOutgoingPlaintext {
  constructor(
    public readonly pk_d: Uint8Array,  // 32 bytes
    public readonly esk: Uint8Array    // 32 bytes (ephemeral secret key)
  ) {
    if (pk_d.length !== 32) throw new Error('pk_d must be 32 bytes');
    if (esk.length !== 32) throw new Error('esk must be 32 bytes');
  }

  /**
   * Serialize to bytes
   */
  toBytes(): Uint8Array {
    const bytes = new Uint8Array(SAPLING_OUTPLAINTEXT_SIZE);
    bytes.set(this.pk_d, 0);
    bytes.set(this.esk, 32);
    return bytes;
  }

  /**
   * Deserialize from bytes
   */
  static fromBytes(bytes: Uint8Array): SaplingOutgoingPlaintext {
    if (bytes.length !== SAPLING_OUTPLAINTEXT_SIZE) {
      throw new Error('Invalid outgoing plaintext size');
    }

    const pk_d = bytes.slice(0, 32);
    const esk = bytes.slice(32, 64);

    return new SaplingOutgoingPlaintext(pk_d, esk);
  }
}

/**
 * Note Encryption Context
 * Handles encryption of notes for recipients
 */
export class NoteEncryption {
  private esk: Uint8Array;  // Ephemeral secret key
  private epk: Uint8Array;  // Ephemeral public key
  private h_sig: Uint8Array; // Signature hash

  constructor(h_sig: Uint8Array, seed: Uint8Array) {
    this.h_sig = h_sig;
    this.esk = NoteEncryption.generateEsk(seed);
    this.epk = NoteEncryption.deriveEpk(this.esk);
  }

  /**
   * Generate ephemeral secret key
   */
  private static generateEsk(seed: Uint8Array): Uint8Array {
    return blake3(
      new Uint8Array([
        ...seed,
        ...Buffer.from('sapling_esk_generation', 'utf8')
      ]),
      { dkLen: 32 }
    );
  }

  /**
   * Derive ephemeral public key from esk
   */
  private static deriveEpk(esk: Uint8Array): Uint8Array {
    return blake3(
      new Uint8Array([
        ...esk,
        ...Buffer.from('sapling_epk_derivation', 'utf8')
      ]),
      { dkLen: 32 }
    );
  }

  /**
   * Encrypt note for recipient
   */
  async encryptNote(
    plaintext: SaplingNotePlaintext,
    pk_enc: Uint8Array
  ): Promise<Uint8Array> {
    // Derive shared secret using DH
    const sharedSecret = this.deriveSharedSecret(pk_enc);

    // Derive symmetric key
    const encKey = this.deriveEncryptionKey(sharedSecret, true);

    // Serialize plaintext
    const ptBytes = plaintext.toBytes();

    // Encrypt using ChaCha20-Poly1305
    const ciphertext = await this.chacha20Poly1305Encrypt(ptBytes, encKey);

    return ciphertext;
  }

  /**
   * Encrypt outgoing plaintext for sender recovery
   */
  async encryptOutgoing(
    outPlaintext: SaplingOutgoingPlaintext,
    ovk: Uint8Array,
    cv: Uint8Array
  ): Promise<Uint8Array> {
    // Derive outgoing encryption key
    const outKey = this.deriveOutgoingKey(ovk, cv);

    // Serialize outgoing plaintext
    const ptBytes = outPlaintext.toBytes();

    // Encrypt
    const ciphertext = await this.chacha20Poly1305Encrypt(ptBytes, outKey);

    return ciphertext;
  }

  /**
   * Derive shared secret (simplified ECDH)
   */
  private deriveSharedSecret(pk_enc: Uint8Array): Uint8Array {
    return blake3(
      new Uint8Array([
        ...this.esk,
        ...pk_enc,
        ...Buffer.from('sapling_ka_agree', 'utf8')
      ]),
      { dkLen: 32 }
    );
  }

  /**
   * Derive encryption key from shared secret
   */
  private deriveEncryptionKey(sharedSecret: Uint8Array, isIncoming: boolean): Uint8Array {
    const label = isIncoming ? 'sapling_enc_key' : 'sapling_out_key';

    return blake3(
      new Uint8Array([
        ...sharedSecret,
        ...this.epk,
        ...this.h_sig,
        ...Buffer.from(label, 'utf8')
      ]),
      { dkLen: 32 }
    );
  }

  /**
   * Derive outgoing encryption key
   */
  private deriveOutgoingKey(ovk: Uint8Array, cv: Uint8Array): Uint8Array {
    return blake3(
      new Uint8Array([
        ...ovk,
        ...cv,
        ...this.epk,
        ...Buffer.from('sapling_ock', 'utf8')
      ]),
      { dkLen: 32 }
    );
  }

  /**
   * ChaCha20-Poly1305 encryption
   */
  private async chacha20Poly1305Encrypt(
    plaintext: Uint8Array,
    key: Uint8Array
  ): Promise<Uint8Array> {
    // Generate nonce (12 bytes for ChaCha20-Poly1305)
    const nonce = new Uint8Array(12);
    crypto.getRandomValues(nonce);

    // Encrypt with AEAD
    const cipher = chacha20poly1305(key, nonce);
    const ciphertext = cipher.encrypt(plaintext);

    // Prepend nonce to ciphertext
    const result = new Uint8Array(nonce.length + ciphertext.length);
    result.set(nonce, 0);
    result.set(ciphertext, nonce.length);

    return result;
  }

  /**
   * Get ephemeral public key
   */
  getEpk(): Uint8Array {
    return this.epk;
  }

  /**
   * Get ephemeral secret key (use carefully!)
   */
  getEsk(): Uint8Array {
    return this.esk;
  }
}

/**
 * Note Decryption Context
 * Handles decryption of received notes
 */
export class NoteDecryption {
  private ivk: Uint8Array; // Incoming viewing key

  constructor(ivk: Uint8Array) {
    if (ivk.length !== 32) {
      throw new Error('IVK must be 32 bytes');
    }
    this.ivk = ivk;
  }

  /**
   * Create from Sapling incoming viewing key
   */
  static fromSaplingIVK(ivk: SaplingIncomingViewingKey): NoteDecryption {
    return new NoteDecryption(ivk.ivk);
  }

  /**
   * Decrypt encrypted note
   */
  async decryptNote(
    ciphertext: Uint8Array,
    epk: Uint8Array,
    h_sig: Uint8Array
  ): Promise<SaplingNotePlaintext> {
    if (ciphertext.length !== SAPLING_ENCCIPHERTEXT_SIZE) {
      throw new Error('Invalid ciphertext size');
    }

    // Derive shared secret
    const sharedSecret = this.deriveSharedSecret(epk);

    // Derive decryption key
    const decKey = this.deriveDecryptionKey(sharedSecret, epk, h_sig);

    // Decrypt
    const plaintext = await this.chacha20Poly1305Decrypt(ciphertext, decKey);

    // Parse plaintext
    return SaplingNotePlaintext.fromBytes(plaintext);
  }

  /**
   * Derive shared secret for decryption
   */
  private deriveSharedSecret(epk: Uint8Array): Uint8Array {
    return blake3(
      new Uint8Array([
        ...this.ivk,
        ...epk,
        ...Buffer.from('sapling_ka_agree', 'utf8')
      ]),
      { dkLen: 32 }
    );
  }

  /**
   * Derive decryption key
   */
  private deriveDecryptionKey(
    sharedSecret: Uint8Array,
    epk: Uint8Array,
    h_sig: Uint8Array
  ): Uint8Array {
    return blake3(
      new Uint8Array([
        ...sharedSecret,
        ...epk,
        ...h_sig,
        ...Buffer.from('sapling_enc_key', 'utf8')
      ]),
      { dkLen: 32 }
    );
  }

  /**
   * ChaCha20-Poly1305 decryption
   */
  private async chacha20Poly1305Decrypt(
    ciphertext: Uint8Array,
    key: Uint8Array
  ): Promise<Uint8Array> {
    if (ciphertext.length < 12 + NOTEENCRYPTION_AUTH_BYTES) {
      throw new Error('Ciphertext too short');
    }

    // Extract nonce (first 12 bytes)
    const nonce = ciphertext.slice(0, 12);

    // Extract actual ciphertext
    const ct = ciphertext.slice(12);

    // Decrypt with AEAD
    const cipher = chacha20poly1305(key, nonce);
    const plaintext = cipher.decrypt(ct);

    return plaintext;
  }
}

/**
 * Encrypted Note for storage/transmission
 */
export interface EncryptedNote {
  /** Encrypted note ciphertext */
  encCiphertext: Uint8Array;

  /** Outgoing ciphertext for sender */
  outCiphertext: Uint8Array;

  /** Ephemeral public key */
  epk: Uint8Array;

  /** Note commitment */
  cm: Uint8Array;
}

/**
 * Utility functions for note encryption
 */
export class NoteEncryptionUtils {
  /**
   * Create encrypted note for recipient
   */
  static async createEncryptedNote(params: {
    recipientAddress: SaplingPaymentAddress;
    value: bigint;
    memo: string;
    senderOvk: Uint8Array;
  }): Promise<EncryptedNote> {
    // Generate randomness
    const rseed = new Uint8Array(32);
    crypto.getRandomValues(rseed);

    // Create memo bytes
    const memoBytes = new Uint8Array(MEMO_SIZE);
    const encoder = new TextEncoder();
    const memoEncoded = encoder.encode(params.memo);
    memoBytes.set(memoEncoded.slice(0, MEMO_SIZE));

    // Create plaintext
    const plaintext = SaplingNotePlaintext.new(
      params.recipientAddress,
      params.value,
      rseed,
      memoBytes
    );

    // Generate signature hash
    const h_sig = sha256(rseed);

    // Create encryption context
    const encryption = new NoteEncryption(h_sig, rseed);

    // Derive recipient's encryption key (from payment address)
    const pk_enc = params.recipientAddress.pk_d;

    // Encrypt for recipient
    const encCiphertext = await encryption.encryptNote(plaintext, pk_enc);

    // Create outgoing plaintext for sender recovery
    const outPlaintext = new SaplingOutgoingPlaintext(
      params.recipientAddress.pk_d,
      encryption.getEsk()
    );

    // Derive value commitment (simplified)
    const cv = blake3(
      new Uint8Array([
        ...params.value.toString().split('').map(c => c.charCodeAt(0)),
        ...rseed
      ]),
      { dkLen: 32 }
    );

    // Encrypt for sender
    const outCiphertext = await encryption.encryptOutgoing(
      outPlaintext,
      params.senderOvk,
      cv
    );

    // Get note commitment
    const cm = plaintext.cm(params.recipientAddress.pk_d);

    return {
      encCiphertext,
      outCiphertext,
      epk: encryption.getEpk(),
      cm
    };
  }

  /**
   * Try to decrypt note with viewing key
   */
  static async tryDecryptNote(
    encryptedNote: EncryptedNote,
    ivk: SaplingIncomingViewingKey,
    h_sig: Uint8Array
  ): Promise<SaplingNotePlaintext | null> {
    try {
      const decryption = NoteDecryption.fromSaplingIVK(ivk);
      const plaintext = await decryption.decryptNote(
        encryptedNote.encCiphertext,
        encryptedNote.epk,
        h_sig
      );
      return plaintext;
    } catch {
      return null;
    }
  }

  /**
   * Generate empty memo
   */
  static emptyMemo(): Uint8Array {
    return new Uint8Array(MEMO_SIZE);
  }

  /**
   * Create memo from string
   */
  static memoFromString(str: string): Uint8Array {
    const memo = new Uint8Array(MEMO_SIZE);
    const encoder = new TextEncoder();
    const encoded = encoder.encode(str);
    memo.set(encoded.slice(0, MEMO_SIZE));
    return memo;
  }

  /**
   * Parse memo to string
   */
  static memoToString(memo: Uint8Array): string {
    const decoder = new TextDecoder();
    // Find first null byte
    let length = memo.findIndex(b => b === 0);
    if (length === -1) length = memo.length;
    return decoder.decode(memo.slice(0, length));
  }
}
