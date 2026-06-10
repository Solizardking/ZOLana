use blake3;
use crate::state::Nullifier;

/// Create nullifier from commitment and secret
pub fn create_nullifier(commitment: [u8; 32], secret: [u8; 32]) -> Nullifier {
    Nullifier {
        commitment,
        secret,
    }
}

/// Verify nullifier is valid
pub fn verify_nullifier(
    nullifier: &Nullifier,
    expected_hash: &[u8; 32],
) -> bool {
    let computed_hash = nullifier.hash();
    &computed_hash == expected_hash
}

/// Generate nullifier secret from spending key
pub fn derive_nullifier_secret(spending_key: &[u8; 32], nonce: u64) -> [u8; 32] {
    let mut hasher = blake3::Hasher::new();
    hasher.update(b"nullifier_secret");
    hasher.update(spending_key);
    hasher.update(&nonce.to_le_bytes());
    hasher.finalize().into()
}
