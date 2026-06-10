# Dark Protocol TypeScript SDK - Zcash Sapling Integration

## Overview

The Dark Protocol TypeScript SDK now includes **complete Zcash Sapling implementation** for Solana, providing enterprise-grade privacy features with a developer-friendly API.

## What's New

### ✅ Zcash Sapling Address System ([sapling.ts](src/sapling.ts))

Complete implementation of Zcash's Sapling address hierarchy:

```typescript
import {
  SaplingSpendingKey,
  SaplingFullViewingKey,
  SaplingIncomingViewingKey,
  SaplingPaymentAddress,
  SaplingHDWallet,
  SaplingUtils
} from '@dark-protocol/sdk';

// Generate new wallet with mnemonic
const { wallet, mnemonic } = await SaplingUtils.generateWallet();

// Get default payment address (43 bytes, Zcash-compatible)
const address = wallet.getDefaultAddress();
console.log(address.toBase58()); // zs1...

// Generate unlimited diversified addresses
const addr1 = wallet.generateDiversifiedAddress(0);
const addr2 = wallet.generateDiversifiedAddress(1);
const addr3 = wallet.generateDiversifiedAddress(2);

// Get full viewing key (safe to store/share)
const fvk = wallet.getFullViewingKey();

// Get incoming viewing key (for decryption only)
const ivk = wallet.getIncomingViewingKey();
```

### ✅ Note Encryption/Decryption ([note-encryption.ts](src/note-encryption.ts))

Zcash-style encrypted notes with ChaCha20-Poly1305 AEAD:

```typescript
import {
  NoteEncryption,
  NoteDecryption,
  SaplingNotePlaintext,
  NoteEncryptionUtils
} from '@dark-protocol/sdk';

// Create encrypted note for recipient
const encryptedNote = await NoteEncryptionUtils.createEncryptedNote({
  recipientAddress: recipientAddress, // SaplingPaymentAddress
  value: 1000000000n, // 1 token
  memo: "Payment for services",
  senderOvk: senderOvk // Outgoing viewing key
});

// Try to decrypt note with viewing key
const plaintext = await NoteEncryptionUtils.tryDecryptNote(
  encryptedNote,
  myIncomingViewingKey,
  h_sig
);

if (plaintext) {
  console.log(`Received: ${plaintext.value}`);
  console.log(`Memo: ${NoteEncryptionUtils.memoToString(plaintext.memo)}`);
}
```

## Quick Start

### Installation

```bash
npm install @dark-protocol/sdk
# or
yarn add @dark-protocol/sdk
```

### Basic Usage

#### 1. Create Privacy Wallet

```typescript
import { DarkProtocolClient, SaplingHDWallet } from '@dark-protocol/sdk';

// Initialize client
const client = await DarkProtocolClient.create({
  heliusApiKey: 'your-helius-api-key',
  rpcUrl: 'https://api.mainnet-beta.solana.com'
});

// Generate new Sapling wallet
const { wallet, mnemonic } = await SaplingUtils.generateWallet();

// Or restore from mnemonic
const wallet = await SaplingHDWallet.fromMnemonic(mnemonic);

// Save mnemonic securely!
console.log('Save this mnemonic:', mnemonic);
```

#### 2. Get Shielded Addresses

```typescript
// Get default address
const defaultAddress = wallet.getDefaultAddress();
console.log('Default Address:', defaultAddress.toBase58());

// Generate diversified addresses (unlimited)
const addresses = wallet.generateDiversifiedAddresses(5);
addresses.forEach((addr, i) => {
  console.log(`Address ${i}:`, addr.toBase58());
});

// Each address uses same viewing key but different diversifier
// Perfect for payment segregation!
```

#### 3. Send Private Transaction

```typescript
// Create encrypted note
const note = await NoteEncryptionUtils.createEncryptedNote({
  recipientAddress: recipientAddress,
  value: 100_000_000n, // 0.1 SOL
  memo: "Private payment",
  senderOvk: wallet.getFullViewingKey().ovk
});

// Send to Solana
const tx = await client.program.methods
  .shieldTokens(
    note.encCiphertext,
    note.outCiphertext,
    Array.from(note.epk),
    Array.from(note.cm)
  )
  .accounts({
    wallet: walletPDA,
    note: notePDA,
    sender: wallet.publicKey,
    systemProgram: SystemProgram.programId
  })
  .rpc();

console.log('Transaction:', tx);
```

#### 4. Scan for Received Notes

```typescript
// Get your incoming viewing key
const ivk = wallet.getIncomingViewingKey();

// Scan blockchain for notes
const notes = await client.program.account.shieldedNote.all();

for (const noteAccount of notes) {
  // Try to decrypt with your IVK
  const plaintext = await NoteEncryptionUtils.tryDecryptNote(
    {
      encCiphertext: noteAccount.account.encCiphertext,
      outCiphertext: noteAccount.account.outCiphertext,
      epk: noteAccount.account.ephemeralKey,
      cm: noteAccount.account.commitment
    },
    ivk,
    noteAccount.account.hSig
  );

  if (plaintext) {
    console.log('Note belongs to you!');
    console.log('Value:', plaintext.value);
    console.log('Memo:', NoteEncryptionUtils.memoToString(plaintext.memo));
  }
}
```

## API Reference

### Sapling Address System

#### `SaplingSpendingKey`

Master secret key - NEVER share or store on-chain!

```typescript
class SaplingSpendingKey {
  // Generate from mnemonic
  static async fromMnemonic(mnemonic: string): Promise<SaplingSpendingKey>

  // Generate random from seed
  static random(seed: Uint8Array): SaplingSpendingKey

  // Derive full viewing key
  fullViewingKey(): SaplingFullViewingKey

  // Get default address
  defaultAddress(): SaplingPaymentAddress

  // Export to bytes
  toBytes(): Uint8Array
}
```

#### `SaplingFullViewingKey`

Safe to store - allows viewing transactions without spending capability.

```typescript
class SaplingFullViewingKey {
  ak: Uint8Array;   // Authentication key (32 bytes)
  nk: Uint8Array;   // Nullifier deriving key (32 bytes)
  ovk: Uint8Array;  // Outgoing viewing key (32 bytes)

  // Derive incoming viewing key
  inViewingKey(): SaplingIncomingViewingKey

  // Get fingerprint for ZIP 32
  getFingerprint(): Uint8Array

  // Check if valid
  isValid(): boolean

  // Convert to 96 bytes
  toBytes(): Uint8Array

  // Parse from bytes
  static fromBytes(bytes: Uint8Array): SaplingFullViewingKey
}
```

#### `SaplingPaymentAddress`

43-byte shielded address (11-byte diversifier + 32-byte pk_d)

```typescript
class SaplingPaymentAddress {
  d: Uint8Array;     // Diversifier (11 bytes)
  pk_d: Uint8Array;  // Diversified transmission key (32 bytes)

  // Convert to 43 bytes
  toBytes(): Uint8Array

  // Parse from bytes
  static fromBytes(bytes: Uint8Array): SaplingPaymentAddress

  // Base58 encoding
  toBase58(): string
  static fromBase58(str: string): SaplingPaymentAddress

  // Get hash (for indexing)
  getHash(): Uint8Array
}
```

#### `SaplingHDWallet`

Hierarchical deterministic wallet (ZIP 32)

```typescript
class SaplingHDWallet {
  // Create from mnemonic
  static async fromMnemonic(mnemonic: string): Promise<SaplingHDWallet>

  // Create from spending key
  static fromSpendingKey(sk: SaplingSpendingKey): SaplingHDWallet

  // Get keys (BE CAREFUL with spending key!)
  getSpendingKey(): SaplingSpendingKey
  getFullViewingKey(): SaplingFullViewingKey
  getIncomingViewingKey(): SaplingIncomingViewingKey

  // Get addresses
  getDefaultAddress(): SaplingPaymentAddress
  generateDiversifiedAddress(index: number): SaplingPaymentAddress
  generateDiversifiedAddresses(count: number): SaplingPaymentAddress[]
}
```

### Note Encryption

#### `NoteEncryption`

Encrypt notes for recipients

```typescript
class NoteEncryption {
  constructor(h_sig: Uint8Array, seed: Uint8Array)

  // Encrypt note for recipient
  async encryptNote(
    plaintext: SaplingNotePlaintext,
    pk_enc: Uint8Array
  ): Promise<Uint8Array>

  // Encrypt for sender recovery
  async encryptOutgoing(
    outPlaintext: SaplingOutgoingPlaintext,
    ovk: Uint8Array,
    cv: Uint8Array
  ): Promise<Uint8Array>

  // Get ephemeral public key
  getEpk(): Uint8Array
}
```

#### `NoteDecryption`

Decrypt received notes

```typescript
class NoteDecryption {
  constructor(ivk: Uint8Array)

  // Create from Sapling IVK
  static fromSaplingIVK(ivk: SaplingIncomingViewingKey): NoteDecryption

  // Decrypt note
  async decryptNote(
    ciphertext: Uint8Array,
    epk: Uint8Array,
    h_sig: Uint8Array
  ): Promise<SaplingNotePlaintext>
}
```

#### `SaplingNotePlaintext`

Note structure before encryption

```typescript
class SaplingNotePlaintext {
  leadbyte: number;        // 1 byte (ZIP 212 indicator)
  d: Uint8Array;           // 11 bytes (diversifier)
  value: bigint;           // 8 bytes (amount)
  rseed: Uint8Array;       // 32 bytes (randomness)
  memo: Uint8Array;        // 512 bytes (memo field)

  // Create new plaintext
  static new(
    paymentAddress: SaplingPaymentAddress,
    value: bigint,
    rseed: Uint8Array,
    memo: Uint8Array
  ): SaplingNotePlaintext

  // Serialize
  toBytes(): Uint8Array
  static fromBytes(bytes: Uint8Array): SaplingNotePlaintext

  // Derive commitment
  cm(pk_d: Uint8Array): Uint8Array

  // Derive randomness
  rcm(): Uint8Array
}
```

### Utility Functions

#### `SaplingUtils`

```typescript
class SaplingUtils {
  // Generate new wallet with mnemonic
  static async generateWallet(): Promise<{
    wallet: SaplingHDWallet;
    mnemonic: string;
  }>

  // Restore wallet
  static async restoreWallet(mnemonic: string): Promise<SaplingHDWallet>

  // Validate address
  static isValidAddress(address: string): boolean

  // Parse address
  static parseAddress(address: string | Uint8Array): SaplingPaymentAddress
}
```

#### `NoteEncryptionUtils`

```typescript
class NoteEncryptionUtils {
  // Create encrypted note
  static async createEncryptedNote(params: {
    recipientAddress: SaplingPaymentAddress;
    value: bigint;
    memo: string;
    senderOvk: Uint8Array;
  }): Promise<EncryptedNote>

  // Try decrypt
  static async tryDecryptNote(
    encryptedNote: EncryptedNote,
    ivk: SaplingIncomingViewingKey,
    h_sig: Uint8Array
  ): Promise<SaplingNotePlaintext | null>

  // Memo utilities
  static emptyMemo(): Uint8Array
  static memoFromString(str: string): Uint8Array
  static memoToString(memo: Uint8Array): string
}
```

## Integration Examples

### React Component

```tsx
import React, { useState, useEffect } from 'react';
import { SaplingHDWallet, SaplingUtils } from '@dark-protocol/sdk';

function PrivacyWallet() {
  const [wallet, setWallet] = useState<SaplingHDWallet | null>(null);
  const [addresses, setAddresses] = useState<string[]>([]);

  useEffect(() => {
    const initWallet = async () => {
      // Load or create wallet
      const stored = localStorage.getItem('wallet_mnemonic');
      const w = stored
        ? await SaplingUtils.restoreWallet(stored)
        : (await SaplingUtils.generateWallet()).wallet;

      setWallet(w);

      // Generate addresses
      const addrs = w.generateDiversifiedAddresses(3);
      setAddresses(addrs.map(a => a.toBase58()));
    };

    initWallet();
  }, []);

  return (
    <div>
      <h2>Shielded Addresses</h2>
      {addresses.map((addr, i) => (
        <div key={i}>
          <strong>Address {i}:</strong> {addr}
        </div>
      ))}
    </div>
  );
}
```

### Node.js Backend

```typescript
import { DarkProtocolClient, SaplingHDWallet } from '@dark-protocol/sdk';

async function processPrivatePayment() {
  // Initialize
  const client = await DarkProtocolClient.create({
    heliusApiKey: process.env.HELIUS_API_KEY!
  });

  const wallet = await SaplingHDWallet.fromMnemonic(
    process.env.WALLET_MNEMONIC!
  );

  // Scan for incoming payments
  const ivk = wallet.getIncomingViewingKey();
  const notes = await client.program.account.shieldedNote.all();

  for (const note of notes) {
    const plaintext = await NoteEncryptionUtils.tryDecryptNote(
      note.account,
      ivk,
      note.account.hSig
    );

    if (plaintext) {
      console.log('Received payment:', plaintext.value);
      // Process payment...
    }
  }
}
```

## Security Best Practices

### ⚠️ Critical Rules

1. **NEVER** store spending keys on-chain or in insecure locations
2. **ALWAYS** encrypt spending keys before storing locally
3. **VERIFY** all addresses before sending
4. **BACKUP** mnemonics securely (preferably offline)
5. **USE** viewing keys for read-only operations

### Key Management

```typescript
// ✅ GOOD: Store only viewing key
const fvk = wallet.getFullViewingKey();
localStorage.setItem('viewing_key', Buffer.from(fvk.toBytes()).toString('hex'));

// ❌ BAD: Don't store spending key in plaintext!
// localStorage.setItem('spending_key', ...); // NEVER DO THIS

// ✅ GOOD: Encrypt before storing
import { encrypt } from 'crypto-js';
const encryptedMnemonic = encrypt(mnemonic, userPassword);
localStorage.setItem('encrypted_wallet', encryptedMnemonic);
```

## Compatibility

### Zcash Compatibility

| Feature | Zcash | Our SDK | Compatible? |
|---------|-------|---------|-------------|
| Address format | 43 bytes | 43 bytes | ✅ Yes |
| Diversifiers | 11 bytes | 11 bytes | ✅ Yes |
| Note structure | 564 bytes | 564 bytes | ✅ Yes |
| Key hierarchy | sk→fvk→ivk→addr | sk→fvk→ivk→addr | ✅ Yes |
| ZIP 32 HD wallets | Yes | Yes | ✅ Yes |
| ZIP 212 | Yes | Yes | ✅ Yes |

### Solana Programs

Works with:
- `dark-protocol` - Core privacy program
- `shielded-wallet` - Full Zcash-style wallet
- Standard SPL tokens (for shielding/unshielding)

## Dependencies

```json
{
  "dependencies": {
    "@solana/web3.js": "^1.87.0",
    "@coral-xyz/anchor": "^0.30.0",
    "@noble/hashes": "^1.3.0",
    "@noble/ciphers": "^0.4.0",
    "bip39": "^3.1.0",
    "bs58": "^5.0.0"
  }
}
```

## Next Steps

1. **Build Solana Programs**: `cargo build-sbf`
2. **Deploy to Devnet**: `solana program deploy`
3. **Integrate SDK**: `npm install @dark-protocol/sdk`
4. **Add to Your App**: Import and use!

## Support

- **Documentation**: [ZCASH_INTEGRATION.md](../../ZCASH_INTEGRATION.md)
- **Examples**: [examples/](./examples/)
- **Issues**: [GitHub Issues](https://github.com/dark-protocol/issues)

---

**Privacy-first. Zcash-powered. Solana-speed.** 🔒⚡
