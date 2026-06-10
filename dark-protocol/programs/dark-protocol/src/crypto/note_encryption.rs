/// Zcash-style note encryption for Solana
/// Implements encrypted note transmission with ChaCha20-Poly1305

use anchor_lang::prelude::*;
use sha2::{Sha256, Digest};
use blake3;

use super::sapling::{SaplingPaymentAddress, SAPLING_DIVERSIFIER_SIZE};

/// Authentication bytes for encrypted data
pub const NOTEENCRYPTION_AUTH_BYTES: usize = 16;

/// Note plaintext sizes
pub const V_SIZE: usize = 8;  // Value (amount)
pub const RHO_SIZE: usize = 32;  // Nullifier seed
pub const R_SIZE: usize = 32;  // Randomness
pub const MEMO_SIZE: usize = 512;  // Memo field

/// Sapling encrypted plaintext size
pub const SAPLING_ENCPLAINTEXT_SIZE: usize =
    1 + SAPLING_DIVERSIFIER_SIZE + V_SIZE + R_SIZE + MEMO_SIZE;

/// Sapling outgoing plaintext size (for sender recovery)
pub const SAPLING_OUTPLAINTEXT_SIZE: usize = 32 + 32;  // pk_d + esk

/// Sapling ciphertext sizes
pub const SAPLING_ENCCIPHERTEXT_SIZE: usize =
    SAPLING_ENCPLAINTEXT_SIZE + NOTEENCRYPTION_AUTH_BYTES;

pub const SAPLING_OUTCIPHERTEXT_SIZE: usize =
    SAPLING_OUTPLAINTEXT_SIZE + NOTEENCRYPTION_AUTH_BYTES;

/// Encrypted note for Sapling
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SaplingEncryptedNote {
    /// Encrypted note ciphertext
    pub enc_ciphertext: Vec<u8>,  // SAPLING_ENCCIPHERTEXT_SIZE bytes
    /// Outgoing ciphertext for sender
    pub out_ciphertext: Vec<u8>,  // SAPLING_OUTCIPHERTEXT_SIZE bytes
    /// Ephemeral public key
    pub epk: [u8; 32],
    /// Commitment
    pub cm: [u8; 32],
}

/// Note plaintext before encryption
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SaplingNotePlaintext {
    /// Lead byte (0x01 or 0x02 depending on ZIP 212)
    pub leadbyte: u8,
    /// Diversifier
    pub d: [u8; SAPLING_DIVERSIFIER_SIZE],
    /// Note value
    pub value: u64,
    /// Randomness seed
    pub rseed: [u8; 32],
    /// Memo field
    pub memo: [u8; MEMO_SIZE],
}

impl SaplingNotePlaintext {
    pub const SIZE: usize = 1 + SAPLING_DIVERSIFIER_SIZE + 8 + 32 + MEMO_SIZE;

    /// Create new note plaintext
    pub fn new(
        payment_address: &SaplingPaymentAddress,
        value: u64,
        rseed: [u8; 32],
        memo: [u8; MEMO_SIZE],
    ) -> Self {
        Self {
            leadbyte: 0x02,  // ZIP 212 activated
            d: payment_address.d,
            value,
            rseed,
            memo,
        }
    }

    /// Serialize to bytes
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(Self::SIZE);
        bytes.push(self.leadbyte);
        bytes.extend_from_slice(&self.d);
        bytes.extend_from_slice(&self.value.to_le_bytes());
        bytes.extend_from_slice(&self.rseed);
        bytes.extend_from_slice(&self.memo);
        bytes
    }

    /// Deserialize from bytes
    pub fn from_bytes(bytes: &[u8]) -> Result<Self> {
        require!(bytes.len() == Self::SIZE, ErrorCode::InvalidPlaintextSize);

        let leadbyte = bytes[0];
        require!(leadbyte == 0x01 || leadbyte == 0x02, ErrorCode::InvalidLeadByte);

        let mut d = [0u8; SAPLING_DIVERSIFIER_SIZE];
        d.copy_from_slice(&bytes[1..12]);

        let mut value_bytes = [0u8; 8];
        value_bytes.copy_from_slice(&bytes[12..20]);
        let value = u64::from_le_bytes(value_bytes);

        let mut rseed = [0u8; 32];
        rseed.copy_from_slice(&bytes[20..52]);

        let mut memo = [0u8; MEMO_SIZE];
        memo.copy_from_slice(&bytes[52..564]);

        Ok(Self {
            leadbyte,
            d,
            value,
            rseed,
            memo,
        })
    }

    /// Derive note commitment (simplified)
    pub fn cm(&self, pk_d: &[u8; 32]) -> [u8; 32] {
        let mut hasher = blake3::Hasher::new();
        hasher.update(&[self.leadbyte]);
        hasher.update(&self.d);
        hasher.update(pk_d);
        hasher.update(&self.value.to_le_bytes());
        hasher.update(&self.rseed);
        hasher.update(b"sapling_note_commitment");
        hasher.finalize().into()
    }

    /// Derive rcm (note commitment randomness)
    pub fn rcm(&self) -> [u8; 32] {
        let mut hasher = blake3::Hasher::new();
        hasher.update(&self.rseed);
        hasher.update(b"sapling_rcm");
        hasher.finalize().into()
    }
}

/// Outgoing plaintext for sender recovery
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct SaplingOutgoingPlaintext {
    /// Diversified transmission key
    pub pk_d: [u8; 32],
    /// Ephemeral secret key
    pub esk: [u8; 32],
}

impl SaplingOutgoingPlaintext {
    pub const SIZE: usize = 64;

    /// Serialize to bytes
    pub fn to_bytes(&self) -> [u8; Self::SIZE] {
        let mut bytes = [0u8; Self::SIZE];
        bytes[0..32].copy_from_slice(&self.pk_d);
        bytes[32..64].copy_from_slice(&self.esk);
        bytes
    }

    /// Deserialize from bytes
    pub fn from_bytes(bytes: &[u8; Self::SIZE]) -> Self {
        let mut pk_d = [0u8; 32];
        let mut esk = [0u8; 32];
        pk_d.copy_from_slice(&bytes[0..32]);
        esk.copy_from_slice(&bytes[32..64]);
        Self { pk_d, esk }
    }
}

/// Note encryption context
pub struct NoteEncryption {
    /// Ephemeral secret key
    esk: [u8; 32],
    /// Ephemeral public key
    epk: [u8; 32],
    /// Signature hash
    h_sig: [u8; 32],
}

impl NoteEncryption {
    /// Create new encryption context
    pub fn new(h_sig: [u8; 32], seed: &[u8]) -> Self {
        // Generate ephemeral keypair
        let esk = Self::generate_esk(seed);
        let epk = Self::derive_epk(&esk);

        Self { esk, epk, h_sig }
    }

    /// Generate ephemeral secret key
    fn generate_esk(seed: &[u8]) -> [u8; 32] {
        let mut hasher = blake3::Hasher::new();
        hasher.update(seed);
        hasher.update(b"sapling_esk_generation");
        hasher.finalize().into()
    }

    /// Derive ephemeral public key from esk
    fn derive_epk(esk: &[u8; 32]) -> [u8; 32] {
        let mut hasher = blake3::Hasher::new();
        hasher.update(esk);
        hasher.update(b"sapling_epk_derivation");
        hasher.finalize().into()
    }

    /// Encrypt note for recipient
    pub fn encrypt_note(
        &self,
        plaintext: &SaplingNotePlaintext,
        pk_enc: &[u8; 32],
    ) -> Result<Vec<u8>> {
        // Derive shared secret using DH
        let shared_secret = self.derive_shared_secret(pk_enc);

        // Derive symmetric key
        let enc_key = self.derive_encryption_key(&shared_secret, true);

        // Serialize plaintext
        let pt_bytes = plaintext.to_bytes();

        // Encrypt using ChaCha20-Poly1305 simulation (simplified)
        let ciphertext = self.chacha20_poly1305_encrypt(&pt_bytes, &enc_key)?;

        Ok(ciphertext)
    }

    /// Encrypt outgoing plaintext for sender
    pub fn encrypt_outgoing(
        &self,
        out_plaintext: &SaplingOutgoingPlaintext,
        ovk: &[u8; 32],
        cv: &[u8; 32],
    ) -> Result<Vec<u8>> {
        // Derive outgoing encryption key
        let out_key = self.derive_outgoing_key(ovk, cv);

        // Serialize outgoing plaintext
        let pt_bytes = out_plaintext.to_bytes();

        // Encrypt
        let ciphertext = self.chacha20_poly1305_encrypt(&pt_bytes, &out_key)?;

        Ok(ciphertext)
    }

    /// Derive shared secret (simplified ECDH)
    fn derive_shared_secret(&self, pk_enc: &[u8; 32]) -> [u8; 32] {
        let mut hasher = blake3::Hasher::new();
        hasher.update(&self.esk);
        hasher.update(pk_enc);
        hasher.update(b"sapling_ka_agree");
        hasher.finalize().into()
    }

    /// Derive encryption key from shared secret
    fn derive_encryption_key(&self, shared_secret: &[u8; 32], is_incoming: bool) -> [u8; 32] {
        let mut hasher = blake3::Hasher::new();
        hasher.update(shared_secret);
        hasher.update(&self.epk);
        hasher.update(&self.h_sig);
        if is_incoming {
            hasher.update(b"sapling_enc_key");
        } else {
            hasher.update(b"sapling_out_key");
        }
        hasher.finalize().into()
    }

    /// Derive outgoing encryption key
    fn derive_outgoing_key(&self, ovk: &[u8; 32], cv: &[u8; 32]) -> [u8; 32] {
        let mut hasher = blake3::Hasher::new();
        hasher.update(ovk);
        hasher.update(cv);
        hasher.update(&self.epk);
        hasher.update(b"sapling_ock");
        hasher.finalize().into()
    }

    /// ChaCha20-Poly1305 encryption (simplified with XOR + MAC)
    fn chacha20_poly1305_encrypt(&self, plaintext: &[u8], key: &[u8; 32]) -> Result<Vec<u8>> {
        // In production, use proper ChaCha20-Poly1305
        // This is a simplified version for demonstration

        let mut ciphertext = Vec::with_capacity(plaintext.len() + NOTEENCRYPTION_AUTH_BYTES);

        // XOR encryption (replace with ChaCha20 in production)
        for (i, &byte) in plaintext.iter().enumerate() {
            ciphertext.push(byte ^ key[i % 32]);
        }

        // Compute authentication tag (simplified)
        let tag = self.compute_poly1305_tag(&ciphertext, key);
        ciphertext.extend_from_slice(&tag);

        Ok(ciphertext)
    }

    /// Compute Poly1305 MAC tag (simplified)
    fn compute_poly1305_tag(&self, data: &[u8], key: &[u8; 32]) -> [u8; NOTEENCRYPTION_AUTH_BYTES] {
        let mut hasher = Sha256::new();
        hasher.update(key);
        hasher.update(data);
        hasher.update(b"poly1305_tag");
        let hash = hasher.finalize();
        let mut tag = [0u8; NOTEENCRYPTION_AUTH_BYTES];
        tag.copy_from_slice(&hash[0..NOTEENCRYPTION_AUTH_BYTES]);
        tag
    }

    /// Get ephemeral public key
    pub fn epk(&self) -> [u8; 32] {
        self.epk
    }

    /// Get ephemeral secret key
    pub fn esk(&self) -> [u8; 32] {
        self.esk
    }
}

/// Note decryption context
pub struct NoteDecryption {
    /// Incoming viewing key (acts as decryption key)
    ivk: [u8; 32],
}

impl NoteDecryption {
    /// Create new decryption context
    pub fn new(ivk: [u8; 32]) -> Self {
        Self { ivk }
    }

    /// Decrypt encrypted note
    pub fn decrypt_note(
        &self,
        ciphertext: &[u8],
        epk: &[u8; 32],
        h_sig: &[u8; 32],
    ) -> Result<SaplingNotePlaintext> {
        require!(
            ciphertext.len() == SAPLING_ENCCIPHERTEXT_SIZE,
            ErrorCode::InvalidCiphertextSize
        );

        // Derive shared secret
        let shared_secret = self.derive_shared_secret(epk);

        // Derive decryption key
        let dec_key = self.derive_decryption_key(&shared_secret, epk, h_sig);

        // Decrypt (simplified)
        let plaintext = self.chacha20_poly1305_decrypt(ciphertext, &dec_key)?;

        // Parse plaintext
        SaplingNotePlaintext::from_bytes(&plaintext)
    }

    /// Derive shared secret for decryption
    fn derive_shared_secret(&self, epk: &[u8; 32]) -> [u8; 32] {
        let mut hasher = blake3::Hasher::new();
        hasher.update(&self.ivk);
        hasher.update(epk);
        hasher.update(b"sapling_ka_agree");
        hasher.finalize().into()
    }

    /// Derive decryption key
    fn derive_decryption_key(
        &self,
        shared_secret: &[u8; 32],
        epk: &[u8; 32],
        h_sig: &[u8; 32],
    ) -> [u8; 32] {
        let mut hasher = blake3::Hasher::new();
        hasher.update(shared_secret);
        hasher.update(epk);
        hasher.update(h_sig);
        hasher.update(b"sapling_enc_key");
        hasher.finalize().into()
    }

    /// ChaCha20-Poly1305 decryption (simplified)
    fn chacha20_poly1305_decrypt(&self, ciphertext: &[u8], key: &[u8; 32]) -> Result<Vec<u8>> {
        require!(
            ciphertext.len() >= NOTEENCRYPTION_AUTH_BYTES,
            ErrorCode::InvalidCiphertextSize
        );

        let data_len = ciphertext.len() - NOTEENCRYPTION_AUTH_BYTES;
        let data = &ciphertext[0..data_len];
        let tag = &ciphertext[data_len..];

        // Verify tag
        let expected_tag = self.compute_poly1305_tag(data, key);
        require!(tag == expected_tag, ErrorCode::InvalidAuthTag);

        // Decrypt (XOR in this simplified version)
        let mut plaintext = Vec::with_capacity(data_len);
        for (i, &byte) in data.iter().enumerate() {
            plaintext.push(byte ^ key[i % 32]);
        }

        Ok(plaintext)
    }

    /// Compute Poly1305 MAC tag
    fn compute_poly1305_tag(&self, data: &[u8], key: &[u8; 32]) -> [u8; NOTEENCRYPTION_AUTH_BYTES] {
        let mut hasher = Sha256::new();
        hasher.update(key);
        hasher.update(data);
        hasher.update(b"poly1305_tag");
        let hash = hasher.finalize();
        let mut tag = [0u8; NOTEENCRYPTION_AUTH_BYTES];
        tag.copy_from_slice(&hash[0..NOTEENCRYPTION_AUTH_BYTES]);
        tag
    }
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid plaintext size")]
    InvalidPlaintextSize,
    #[msg("Invalid lead byte")]
    InvalidLeadByte,
    #[msg("Invalid ciphertext size")]
    InvalidCiphertextSize,
    #[msg("Invalid authentication tag")]
    InvalidAuthTag,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_note_encryption_decryption() {
        // Create payment address
        let addr = SaplingPaymentAddress {
            d: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
            pk_d: [42u8; 32],
        };

        // Create plaintext
        let plaintext = SaplingNotePlaintext::new(
            &addr,
            100_000_000,  // 1 token
            [7u8; 32],    // rseed
            [0u8; MEMO_SIZE],
        );

        // Create encryption context
        let h_sig = [99u8; 32];
        let enc = NoteEncryption::new(h_sig, b"test_seed");

        // Encrypt
        let ivk = [55u8; 32];
        let ciphertext = enc.encrypt_note(&plaintext, &ivk).unwrap();

        // Decrypt
        let dec = NoteDecryption::new(ivk);
        let decrypted = dec.decrypt_note(&ciphertext, &enc.epk(), &h_sig).unwrap();

        assert_eq!(plaintext.value, decrypted.value);
        assert_eq!(plaintext.d, decrypted.d);
    }
}
