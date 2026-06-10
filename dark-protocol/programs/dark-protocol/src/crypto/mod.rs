pub mod commitment;
pub mod nullifier;
pub mod merkle;
pub mod zk_proof;
pub mod encryption;
pub mod sapling;
pub mod sapling_v2;
pub mod note_encryption;
pub mod groth16;

pub use commitment::*;
pub use nullifier::*;
pub use merkle::*;
pub use zk_proof::*;
pub use encryption::*;
pub use sapling::*;
pub use note_encryption::*;
pub use groth16::*;

use sha2::{Sha256, Digest};
use blake3;

/// Hash a commitment using SHA-256
pub fn hash_commitment(value: &[u8; 32], randomness: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(value);
    hasher.update(randomness);
    hasher.finalize().into()
}

/// Hash a nullifier using BLAKE3 for better performance
pub fn hash_nullifier(commitment: &[u8; 32], secret: &[u8; 32]) -> [u8; 32] {
    let mut hasher = blake3::Hasher::new();
    hasher.update(commitment);
    hasher.update(secret);
    hasher.finalize().into()
}

/// Hash two nodes in merkle tree
pub fn hash_pair(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(left);
    hasher.update(right);
    hasher.finalize().into()
}

/// Generate pseudorandom bytes using BLAKE3
pub fn generate_random_bytes(seed: &[u8], output_len: usize) -> Vec<u8> {
    let mut hasher = blake3::Hasher::new();
    hasher.update(seed);
    let hash: [u8; 32] = hasher.finalize().into();
    hash[..output_len.min(32)].to_vec()
}

/// Constant-time comparison to prevent timing attacks
pub fn constant_time_eq(a: &[u8; 32], b: &[u8; 32]) -> bool {
    let mut result = 0u8;
    for i in 0..32 {
        result |= a[i] ^ b[i];
    }
    result == 0
}
