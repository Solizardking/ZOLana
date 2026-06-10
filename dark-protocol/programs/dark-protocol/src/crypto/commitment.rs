use sha2::{Sha256, Digest};
use crate::state::Commitment;

/// Create a Pedersen commitment
pub fn create_commitment(value: u64, randomness: [u8; 32]) -> Commitment {
    let mut value_bytes = [0u8; 32];
    value_bytes[..8].copy_from_slice(&value.to_le_bytes());
    
    Commitment {
        value: value_bytes,
        randomness,
    }
}

/// Verify commitment matches expected value
pub fn verify_commitment(
    commitment: &Commitment,
    expected_hash: &[u8; 32],
) -> bool {
    let computed_hash = commitment.hash();
    &computed_hash == expected_hash
}

/// Generate random blinding factor for commitment
pub fn generate_blinding_factor(seed: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(b"blinding_factor");
    hasher.update(seed);
    hasher.finalize().into()
}
