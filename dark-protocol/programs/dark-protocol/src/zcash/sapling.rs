//! Sapling address generation and key management
//!
//! Ported from src/zcash/address/sapling.hpp and sapling.cpp
//! Implements Sapling payment addresses, viewing keys, and spending keys

use blake2b_simd::Params as Blake2bParams;
use solana_program::{msg, pubkey::Pubkey};

use super::prf::{default_diversifier, prf_ask, prf_nsk, prf_ovk};
use super::{SAPLING_DIVERSIFIER_SIZE, ZCASH_SAPLING_FVFP_PERSONALIZATION};

/// Sapling diversifier (11 bytes)
pub type Diversifier = [u8; SAPLING_DIVERSIFIER_SIZE];

/// Sapling payment address
///
/// Consists of a diversifier and a public key pk_d
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SaplingPaymentAddress {
    pub d: Diversifier,
    pub pk_d: [u8; 32],
}

impl SaplingPaymentAddress {
    pub fn new(d: Diversifier, pk_d: [u8; 32]) -> Self {
        Self { d, pk_d }
    }

    /// Get raw bytes representation (43 bytes total)
    pub fn to_bytes(&self) -> [u8; 43] {
        let mut bytes = [0u8; 43];
        bytes[0..11].copy_from_slice(&self.d);
        bytes[11..43].copy_from_slice(&self.pk_d);
        bytes
    }

    /// Create from raw bytes
    pub fn from_bytes(bytes: &[u8; 43]) -> Self {
        let mut d = [0u8; 11];
        let mut pk_d = [0u8; 32];
        d.copy_from_slice(&bytes[0..11]);
        pk_d.copy_from_slice(&bytes[11..43]);
        Self { d, pk_d }
    }

    /// Get hash of this payment address
    pub fn get_hash(&self) -> [u8; 32] {
        use solana_program::hash::hash;
        let bytes = self.to_bytes();
        hash(&bytes).to_bytes()
    }
}

/// Sapling incoming viewing key
///
/// Allows decryption of incoming notes but not spending
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SaplingIncomingViewingKey {
    pub ivk: [u8; 32],
}

impl SaplingIncomingViewingKey {
    pub fn new(ivk: [u8; 32]) -> Self {
        Self { ivk }
    }

    /// Derive payment address from diversifier
    ///
    /// In production, this would call librustzcash to derive pk_d
    pub fn address(&self, d: Diversifier) -> Option<SaplingPaymentAddress> {
        // Simplified: In production would call sapling::spec::ivk_to_pkd
        // For now, we derive pk_d deterministically from ivk and diversifier
        if !check_diversifier_valid(&d) {
            return None;
        }

        let pk_d = derive_pk_d(&self.ivk, &d);
        Some(SaplingPaymentAddress::new(d, pk_d))
    }
}

/// Sapling full viewing key
///
/// Contains all keys needed for viewing but not spending
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SaplingFullViewingKey {
    pub ak: [u8; 32],  // spend validating key
    pub nk: [u8; 32],  // proof authorizing key
    pub ovk: [u8; 32], // outgoing viewing key
}

impl SaplingFullViewingKey {
    pub fn new(ak: [u8; 32], nk: [u8; 32], ovk: [u8; 32]) -> Self {
        Self { ak, nk, ovk }
    }

    /// Get fingerprint of this full viewing key (ZIP 32)
    pub fn get_fingerprint(&self) -> [u8; 32] {
        let mut data = Vec::with_capacity(96);
        data.extend_from_slice(&self.ak);
        data.extend_from_slice(&self.nk);
        data.extend_from_slice(&self.ovk);

        let hash = Blake2bParams::new()
            .hash_length(32)
            .personal(ZCASH_SAPLING_FVFP_PERSONALIZATION)
            .to_state()
            .update(&data)
            .finalize();

        let mut result = [0u8; 32];
        result.copy_from_slice(hash.as_bytes());
        result
    }

    /// Derive incoming viewing key from full viewing key
    pub fn in_viewing_key(&self) -> SaplingIncomingViewingKey {
        // In production: call sapling::spec::crh_ivk(ak, nk)
        let ivk = compute_ivk(&self.ak, &self.nk);
        SaplingIncomingViewingKey::new(ivk)
    }

    /// Check if this full viewing key is valid
    pub fn is_valid(&self) -> bool {
        let ivk = compute_ivk(&self.ak, &self.nk);
        !is_null(&ivk)
    }

    /// Serialize to bytes (96 bytes)
    pub fn to_bytes(&self) -> [u8; 96] {
        let mut bytes = [0u8; 96];
        bytes[0..32].copy_from_slice(&self.ak);
        bytes[32..64].copy_from_slice(&self.nk);
        bytes[64..96].copy_from_slice(&self.ovk);
        bytes
    }

    /// Deserialize from bytes
    pub fn from_bytes(bytes: &[u8; 96]) -> Self {
        let mut ak = [0u8; 32];
        let mut nk = [0u8; 32];
        let mut ovk = [0u8; 32];
        ak.copy_from_slice(&bytes[0..32]);
        nk.copy_from_slice(&bytes[32..64]);
        ovk.copy_from_slice(&bytes[64..96]);
        Self { ak, nk, ovk }
    }
}

/// Sapling expanded spending key
///
/// Intermediate representation after expanding from spending key
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SaplingExpandedSpendingKey {
    pub ask: [u8; 32],
    pub nsk: [u8; 32],
    pub ovk: [u8; 32],
}

impl SaplingExpandedSpendingKey {
    pub fn new(ask: [u8; 32], nsk: [u8; 32], ovk: [u8; 32]) -> Self {
        Self { ask, nsk, ovk }
    }

    /// Derive full viewing key from expanded spending key
    pub fn full_viewing_key(&self) -> SaplingFullViewingKey {
        // In production: call sapling::spec::ask_to_ak and nsk_to_nk
        let ak = compute_ak(&self.ask);
        let nk = compute_nk(&self.nsk);
        SaplingFullViewingKey::new(ak, nk, self.ovk)
    }

    /// Serialize to bytes (96 bytes)
    pub fn to_bytes(&self) -> [u8; 96] {
        let mut bytes = [0u8; 96];
        bytes[0..32].copy_from_slice(&self.ask);
        bytes[32..64].copy_from_slice(&self.nsk);
        bytes[64..96].copy_from_slice(&self.ovk);
        bytes
    }
}

/// Sapling spending key (32 bytes)
///
/// The master secret key for spending
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SaplingSpendingKey {
    pub sk: [u8; 32],
}

impl SaplingSpendingKey {
    pub fn new(sk: [u8; 32]) -> Self {
        Self { sk }
    }

    /// Generate random spending key
    pub fn random() -> Self {
        use solana_program::hash::hash;

        // Generate random bytes (in production, use secure RNG)
        let random_bytes = hash(b"random_seed").to_bytes();

        // Keep generating until we get a valid key
        let mut sk = Self::new(random_bytes);
        let mut attempts = 0;

        while !sk.full_viewing_key().is_valid() && attempts < 100 {
            let new_random = hash(&random_bytes).to_bytes();
            sk = Self::new(new_random);
            attempts += 1;
        }

        sk
    }

    /// Expand spending key using PRFs
    pub fn expanded_spending_key(&self) -> SaplingExpandedSpendingKey {
        let ask = prf_ask(&self.sk);
        let nsk = prf_nsk(&self.sk);
        let ovk = prf_ovk(&self.sk);
        SaplingExpandedSpendingKey::new(ask, nsk, ovk)
    }

    /// Derive full viewing key
    pub fn full_viewing_key(&self) -> SaplingFullViewingKey {
        self.expanded_spending_key().full_viewing_key()
    }

    /// Get default payment address
    pub fn default_address(&self) -> SaplingPaymentAddress {
        let diversifier = default_diversifier(&self.sk);
        let ivk = self.full_viewing_key().in_viewing_key();

        // This should always succeed for default diversifier
        ivk.address(diversifier)
            .expect("Default diversifier should always produce valid address")
    }
}

// Helper functions (simplified versions - production would use librustzcash)

fn check_diversifier_valid(d: &Diversifier) -> bool {
    // Basic validation: not all zeros
    !d.iter().all(|&b| b == 0)
}

fn derive_pk_d(ivk: &[u8; 32], d: &Diversifier) -> [u8; 32] {
    // Simplified: In production would use group hash into Jubjub
    use solana_program::hash::hash;
    let mut data = Vec::with_capacity(43);
    data.extend_from_slice(ivk);
    data.extend_from_slice(d);
    hash(&data).to_bytes()
}

fn compute_ivk(ak: &[u8; 32], nk: &[u8; 32]) -> [u8; 32] {
    // Simplified: In production would use CRH^ivk from Zcash spec
    use solana_program::hash::hash;
    let mut data = Vec::with_capacity(64);
    data.extend_from_slice(ak);
    data.extend_from_slice(nk);
    hash(&data).to_bytes()
}

fn compute_ak(ask: &[u8; 32]) -> [u8; 32] {
    // Simplified: In production would multiply ask by generator
    use solana_program::hash::hash;
    hash(ask).to_bytes()
}

fn compute_nk(nsk: &[u8; 32]) -> [u8; 32] {
    // Simplified: In production would multiply nsk by generator
    use solana_program::hash::hash;
    hash(nsk).to_bytes()
}

fn is_null(bytes: &[u8; 32]) -> bool {
    bytes.iter().all(|&b| b == 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_spending_key_derivation() {
        let sk = SaplingSpendingKey::new([42u8; 32]);
        let expanded = sk.expanded_spending_key();
        let fvk = sk.full_viewing_key();

        // Keys should be deterministic
        assert_eq!(fvk, expanded.full_viewing_key());
    }

    #[test]
    fn test_payment_address() {
        let sk = SaplingSpendingKey::new([1u8; 32]);
        let addr = sk.default_address();

        // Address should serialize/deserialize correctly
        let bytes = addr.to_bytes();
        let addr2 = SaplingPaymentAddress::from_bytes(&bytes);
        assert_eq!(addr, addr2);
    }

    #[test]
    fn test_ivk_address_derivation() {
        let sk = SaplingSpendingKey::new([99u8; 32]);
        let fvk = sk.full_viewing_key();
        let ivk = fvk.in_viewing_key();

        let diversifier = default_diversifier(&sk.sk);
        let addr = ivk.address(diversifier);
        assert!(addr.is_some());
    }
}
