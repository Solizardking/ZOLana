//! Pseudo-Random Functions (PRF) for Zcash key derivation
//!
//! Ported from src/zcash/prf.cpp
//! Uses BLAKE2b for PRF expansion as specified in the Sapling protocol

use blake2b_simd::Params as Blake2bParams;
use solana_program::msg;

pub use super::ZCASH_EXPANDSEED_PERSONALIZATION;

/// PRF tags for different key derivation purposes
pub const PRF_ASK_TAG: u8 = 0;  // ask (spend authorizing key)
pub const PRF_NSK_TAG: u8 = 1;  // nsk (proof authorizing key)
pub const PRF_OVK_TAG: u8 = 2;  // ovk (outgoing viewing key)
pub const PRF_RCM_TAG: u8 = 4;  // rcm (note commitment randomness)
pub const PRF_ESK_TAG: u8 = 5;  // esk (ephemeral secret key)

/// PRF^expand using BLAKE2b-512
///
/// Expands a 32-byte key with a 1-byte tag into 64 bytes
/// Uses the "Zcash_ExpandSeed" personalization
pub fn prf_expand(sk: &[u8; 32], t: u8) -> [u8; 64] {
    let mut blob = [0u8; 33];
    blob[0..32].copy_from_slice(sk);
    blob[32] = t;

    let hash = Blake2bParams::new()
        .hash_length(64)
        .personal(ZCASH_EXPANDSEED_PERSONALIZATION)
        .to_state()
        .update(&blob)
        .finalize();

    let mut result = [0u8; 64];
    result.copy_from_slice(hash.as_bytes());
    result
}

/// Derive ask (spend authorizing key) from spending key
pub fn prf_ask(sk: &[u8; 32]) -> [u8; 32] {
    let expanded = prf_expand(sk, PRF_ASK_TAG);
    // In the real implementation, this would be reduced to scalar
    // For now, we take the first 32 bytes
    let mut result = [0u8; 32];
    result.copy_from_slice(&expanded[0..32]);
    result
}

/// Derive nsk (proof authorizing key) from spending key
pub fn prf_nsk(sk: &[u8; 32]) -> [u8; 32] {
    let expanded = prf_expand(sk, PRF_NSK_TAG);
    // In the real implementation, this would be reduced to scalar
    let mut result = [0u8; 32];
    result.copy_from_slice(&expanded[0..32]);
    result
}

/// Derive ovk (outgoing viewing key) from spending key
pub fn prf_ovk(sk: &[u8; 32]) -> [u8; 32] {
    let expanded = prf_expand(sk, PRF_OVK_TAG);
    let mut result = [0u8; 32];
    result.copy_from_slice(&expanded[0..32]);
    result
}

/// Derive rcm (note commitment randomness) from rseed
pub fn prf_rcm(rseed: &[u8; 32]) -> [u8; 32] {
    let expanded = prf_expand(rseed, PRF_RCM_TAG);
    // In the real implementation, this would be reduced to scalar
    let mut result = [0u8; 32];
    result.copy_from_slice(&expanded[0..32]);
    result
}

/// Derive esk (ephemeral secret key) from rseed
pub fn prf_esk(rseed: &[u8; 32]) -> [u8; 32] {
    let expanded = prf_expand(rseed, PRF_ESK_TAG);
    // In the real implementation, this would be reduced to scalar
    let mut result = [0u8; 32];
    result.copy_from_slice(&expanded[0..32]);
    result
}

/// Generate default diversifier from spending key
///
/// Iterates through diversifier indices until a valid one is found
/// Uses tag 3 with incrementing counter
pub fn default_diversifier(sk: &[u8; 32]) -> [u8; 11] {
    let mut blob = [0u8; 34];
    blob[0..32].copy_from_slice(sk);
    blob[32] = 3; // Diversifier tag

    // Try up to 256 diversifiers
    for i in 0..=255u8 {
        blob[33] = i;

        let hash = Blake2bParams::new()
            .hash_length(64)
            .personal(ZCASH_EXPANDSEED_PERSONALIZATION)
            .to_state()
            .update(&blob)
            .finalize();

        let mut diversifier = [0u8; 11];
        diversifier.copy_from_slice(&hash.as_bytes()[0..11]);

        // In real implementation, would check if diversifier is valid
        // For now, return first one
        if check_diversifier_basic(&diversifier) {
            return diversifier;
        }
    }

    msg!("Failed to find valid diversifier");
    [0u8; 11] // Fallback
}

/// Basic diversifier validation
/// In production, this would call into librustzcash
fn check_diversifier_basic(d: &[u8; 11]) -> bool {
    // Very basic check: not all zeros
    !d.iter().all(|&b| b == 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_prf_expand() {
        let sk = [1u8; 32];
        let expanded = prf_expand(&sk, PRF_ASK_TAG);
        assert_eq!(expanded.len(), 64);
        // Should be deterministic
        let expanded2 = prf_expand(&sk, PRF_ASK_TAG);
        assert_eq!(expanded, expanded2);
    }

    #[test]
    fn test_prf_functions() {
        let sk = [42u8; 32];
        let ask = prf_ask(&sk);
        let nsk = prf_nsk(&sk);
        let ovk = prf_ovk(&sk);

        // Different tags should produce different outputs
        assert_ne!(ask, nsk);
        assert_ne!(ask, ovk);
        assert_ne!(nsk, ovk);
    }
}
