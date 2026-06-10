//! Note encryption and decryption using ChaCha20-Poly1305
//!
//! Ported from src/zcash/NoteEncryption.cpp and NoteEncryption.hpp
//! Implements authenticated encryption for Sapling notes

use blake2b_simd::Params as Blake2bParams;
use chacha20poly1305::{
    aead::{Aead, NewAead, generic_array::GenericArray},
    ChaCha20Poly1305, Nonce,
};
use solana_program::msg;

use super::{NOTEENCRYPTION_AUTH_BYTES, NOTEENCRYPTION_CIPHER_KEYSIZE, ZCASH_KDF_PERSONALIZATION_PREFIX};

/// Note plaintext size for Sapling
pub const SAPLING_NOTEPLAINTEXT_SIZE: usize = 564; // 1 + 11 + 8 + 32 + 512 (leading + d + value + rcm + memo)
pub const SAPLING_ENCPLAINTEXT_SIZE: usize = 564;
pub const SAPLING_ENCCIPHERTEXT_SIZE: usize = SAPLING_ENCPLAINTEXT_SIZE + NOTEENCRYPTION_AUTH_BYTES;

/// Key Derivation Function for note encryption
///
/// Derives encryption key from DH secret and public keys
fn kdf(
    dhsecret: &[u8; 32],
    epk: &[u8; 32],
    pk_enc: &[u8; 32],
    h_sig: &[u8; 32],
    nonce: u8,
) -> Result<[u8; NOTEENCRYPTION_CIPHER_KEYSIZE], &'static str> {
    if nonce == 0xff {
        return Err("No additional nonce space for KDF");
    }

    // Build input block: h_sig || dhsecret || epk || pk_enc
    let mut block = [0u8; 128];
    block[0..32].copy_from_slice(h_sig);
    block[32..64].copy_from_slice(dhsecret);
    block[64..96].copy_from_slice(epk);
    block[96..128].copy_from_slice(pk_enc);

    // Build personalization: "ZcashKDF" || nonce
    let mut personalization = [0u8; 16];
    personalization[0..8].copy_from_slice(ZCASH_KDF_PERSONALIZATION_PREFIX);
    personalization[8] = nonce;

    // BLAKE2b-256 with personalization
    let hash = Blake2bParams::new()
        .hash_length(NOTEENCRYPTION_CIPHER_KEYSIZE)
        .personal(&personalization)
        .to_state()
        .update(&block)
        .finalize();

    let mut result = [0u8; NOTEENCRYPTION_CIPHER_KEYSIZE];
    result.copy_from_slice(hash.as_bytes());
    Ok(result)
}

/// Note encryption context
///
/// Handles encryption of notes to recipients
pub struct NoteEncryption {
    pub epk: [u8; 32],          // Ephemeral public key
    pub esk: [u8; 32],          // Ephemeral secret key
    pub h_sig: [u8; 32],        // Transaction signature hash
    nonce: u8,                  // Encryption nonce
}

impl NoteEncryption {
    /// Create new note encryption context
    pub fn new(h_sig: [u8; 32]) -> Self {
        // Generate ephemeral keypair
        let esk = Self::generate_esk();
        let epk = Self::generate_pubkey(&esk);

        Self {
            epk,
            esk,
            h_sig,
            nonce: 0,
        }
    }

    /// Encrypt plaintext for recipient
    pub fn encrypt(
        &mut self,
        pk_enc: &[u8; 32],
        plaintext: &[u8],
    ) -> Result<Vec<u8>, &'static str> {
        // Perform Diffie-Hellman
        let dhsecret = self.dh_secret(&self.esk, pk_enc)?;

        // Derive symmetric key
        let key = kdf(&dhsecret, &self.epk, pk_enc, &self.h_sig, self.nonce)?;

        // Increment nonce
        self.nonce += 1;

        // Encrypt using ChaCha20-Poly1305
        let cipher = ChaCha20Poly1305::new(GenericArray::from_slice(&key));

        // Nonce is zero because we never reuse keys
        let nonce = Nonce::from_slice(&[0u8; 12]);

        let ciphertext = cipher
            .encrypt(nonce, plaintext)
            .map_err(|_| "Encryption failed")?;

        Ok(ciphertext)
    }

    /// Generate ephemeral secret key
    fn generate_esk() -> [u8; 32] {
        // In production, use secure random number generator
        use solana_program::hash::hash;
        hash(b"ephemeral_key_seed").to_bytes()
    }

    /// Generate public key from secret key
    fn generate_pubkey(sk: &[u8; 32]) -> [u8; 32] {
        // Simplified: In production would use curve25519 scalar multiplication
        use solana_program::hash::hash;
        hash(sk).to_bytes()
    }

    /// Compute Diffie-Hellman shared secret
    fn dh_secret(&self, sk: &[u8; 32], pk: &[u8; 32]) -> Result<[u8; 32], &'static str> {
        // Simplified: In production would use crypto_scalarmult
        use solana_program::hash::hash;
        let mut data = Vec::with_capacity(64);
        data.extend_from_slice(sk);
        data.extend_from_slice(pk);
        Ok(hash(&data).to_bytes())
    }

    /// Get ephemeral secret key
    pub fn get_esk(&self) -> [u8; 32] {
        self.esk
    }

    /// Get ephemeral public key
    pub fn get_epk(&self) -> [u8; 32] {
        self.epk
    }
}

/// Note decryption context
///
/// Handles decryption of received notes
pub struct NoteDecryption {
    sk_enc: [u8; 32],  // Incoming viewing key
    pk_enc: [u8; 32],  // Public encryption key
}

impl NoteDecryption {
    /// Create new note decryption context
    pub fn new(sk_enc: [u8; 32]) -> Self {
        let pk_enc = Self::derive_pk_enc(&sk_enc);
        Self { sk_enc, pk_enc }
    }

    /// Decrypt ciphertext
    pub fn decrypt(
        &self,
        ciphertext: &[u8],
        epk: &[u8; 32],
        h_sig: &[u8; 32],
        nonce: u8,
    ) -> Result<Vec<u8>, &'static str> {
        // Perform Diffie-Hellman
        let dhsecret = self.dh_secret(&self.sk_enc, epk)?;

        // Derive symmetric key
        let key = kdf(&dhsecret, epk, &self.pk_enc, h_sig, nonce)?;

        // Decrypt using ChaCha20-Poly1305
        let cipher = ChaCha20Poly1305::new(GenericArray::from_slice(&key));

        // Nonce is zero because we never reuse keys
        let nonce_bytes = Nonce::from_slice(&[0u8; 12]);

        let plaintext = cipher
            .decrypt(nonce_bytes, ciphertext)
            .map_err(|_| "Decryption failed")?;

        Ok(plaintext)
    }

    /// Derive public encryption key from secret key
    fn derive_pk_enc(sk_enc: &[u8; 32]) -> [u8; 32] {
        // Simplified: In production would use curve25519 scalar multiplication
        use solana_program::hash::hash;
        hash(sk_enc).to_bytes()
    }

    /// Compute Diffie-Hellman shared secret
    fn dh_secret(&self, sk: &[u8; 32], pk: &[u8; 32]) -> Result<[u8; 32], &'static str> {
        // Simplified: In production would use crypto_scalarmult
        use solana_program::hash::hash;
        let mut data = Vec::with_capacity(64);
        data.extend_from_slice(sk);
        data.extend_from_slice(pk);
        Ok(hash(&data).to_bytes())
    }
}

/// Payment disclosure note decryption
///
/// Allows decryption with ephemeral secret key (for payment disclosure)
pub struct PaymentDisclosureNoteDecryption {
    base: NoteDecryption,
}

impl PaymentDisclosureNoteDecryption {
    pub fn new(sk_enc: [u8; 32]) -> Self {
        Self {
            base: NoteDecryption::new(sk_enc),
        }
    }

    /// Decrypt with ephemeral secret key
    pub fn decrypt_with_esk(
        &self,
        ciphertext: &[u8],
        pk_enc: &[u8; 32],
        esk: &[u8; 32],
        h_sig: &[u8; 32],
        nonce: u8,
    ) -> Result<Vec<u8>, &'static str> {
        // Perform Diffie-Hellman
        let dhsecret = self.dh_secret(esk, pk_enc)?;

        // Regenerate ephemeral public key
        let epk = NoteEncryption::generate_pubkey(esk);

        // Derive symmetric key
        let key = kdf(&dhsecret, &epk, pk_enc, h_sig, nonce)?;

        // Decrypt using ChaCha20-Poly1305
        let cipher = ChaCha20Poly1305::new(GenericArray::from_slice(&key));

        let nonce_bytes = Nonce::from_slice(&[0u8; 12]);

        let plaintext = cipher
            .decrypt(nonce_bytes, ciphertext)
            .map_err(|_| "Decryption failed")?;

        Ok(plaintext)
    }

    fn dh_secret(&self, sk: &[u8; 32], pk: &[u8; 32]) -> Result<[u8; 32], &'static str> {
        use solana_program::hash::hash;
        let mut data = Vec::with_capacity(64);
        data.extend_from_slice(sk);
        data.extend_from_slice(pk);
        Ok(hash(&data).to_bytes())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt() {
        let h_sig = [42u8; 32];
        let mut enc = NoteEncryption::new(h_sig);

        let sk_enc = [1u8; 32];
        let dec = NoteDecryption::new(sk_enc);

        let plaintext = b"Hello, Sapling!";
        let pk_enc = dec.pk_enc;

        // Encrypt
        let ciphertext = enc.encrypt(&pk_enc, plaintext).unwrap();

        // Decrypt
        let decrypted = dec.decrypt(&ciphertext, &enc.epk, &h_sig, 0).unwrap();

        assert_eq!(plaintext, decrypted.as_slice());
    }

    #[test]
    fn test_kdf_deterministic() {
        let dhsecret = [1u8; 32];
        let epk = [2u8; 32];
        let pk_enc = [3u8; 32];
        let h_sig = [4u8; 32];

        let key1 = kdf(&dhsecret, &epk, &pk_enc, &h_sig, 0).unwrap();
        let key2 = kdf(&dhsecret, &epk, &pk_enc, &h_sig, 0).unwrap();

        assert_eq!(key1, key2);
    }

    #[test]
    fn test_different_nonces() {
        let dhsecret = [1u8; 32];
        let epk = [2u8; 32];
        let pk_enc = [3u8; 32];
        let h_sig = [4u8; 32];

        let key1 = kdf(&dhsecret, &epk, &pk_enc, &h_sig, 0).unwrap();
        let key2 = kdf(&dhsecret, &epk, &pk_enc, &h_sig, 1).unwrap();

        assert_ne!(key1, key2);
    }
}
