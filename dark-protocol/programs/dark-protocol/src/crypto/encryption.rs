use crate::state::EncryptedNote;
use sha2::{Sha256, Digest};

/// Encrypt note data using ChaCha20-Poly1305 (simplified)
pub fn encrypt_note(
    data: &[u8],
    shared_secret: &[u8; 32],
) -> EncryptedNote {
    // In production, use proper ChaCha20-Poly1305 or AES-GCM
    let mut hasher = Sha256::new();
    hasher.update(shared_secret);
    hasher.update(b"encryption_key");
    let key = hasher.finalize();
    
    // Simple XOR for demonstration (use proper encryption in production)
    let mut ciphertext = data.to_vec();
    for (i, byte) in ciphertext.iter_mut().enumerate() {
        *byte ^= key[i % 32];
    }
    
    let ephemeral_key = *shared_secret;
    let nonce = [1u8; 24]; // Use proper random nonce in production
    
    EncryptedNote {
        ciphertext,
        ephemeral_key,
        nonce,
    }
}

/// Decrypt note data
pub fn decrypt_note(
    encrypted: &EncryptedNote,
    shared_secret: &[u8; 32],
) -> Result<Vec<u8>, &'static str> {
    let mut hasher = Sha256::new();
    hasher.update(shared_secret);
    hasher.update(b"encryption_key");
    let key = hasher.finalize();
    
    // Simple XOR decryption (use proper decryption in production)
    let mut plaintext = encrypted.ciphertext.clone();
    for (i, byte) in plaintext.iter_mut().enumerate() {
        *byte ^= key[i % 32];
    }
    
    Ok(plaintext)
}

/// Derive shared secret using ECDH
pub fn derive_shared_secret(
    private_key: &[u8; 32],
    public_key: &[u8; 32],
) -> [u8; 32] {
    // In production, use proper ECDH with curve25519
    let mut hasher = Sha256::new();
    hasher.update(private_key);
    hasher.update(public_key);
    hasher.update(b"ecdh_shared_secret");
    hasher.finalize().into()
}

/// Generate ephemeral keypair for encryption
pub fn generate_ephemeral_keypair(seed: &[u8]) -> ([u8; 32], [u8; 32]) {
    let mut hasher = Sha256::new();
    hasher.update(seed);
    hasher.update(b"private_key");
    let private_key = hasher.finalize().into();
    
    let mut hasher = Sha256::new();
    hasher.update(&private_key);
    hasher.update(b"public_key");
    let public_key = hasher.finalize().into();
    
    (private_key, public_key)
}
