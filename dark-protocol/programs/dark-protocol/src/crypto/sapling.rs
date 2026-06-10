/// Sapling-style address and key generation for Solana
/// Based on Zcash Sapling protocol adapted for Solana constraints

use sha2::{Sha256, Digest};
use sha3::{Sha3_256};
use blake3;
use anchor_lang::prelude::*;

/// Sapling diversifier size (11 bytes, same as Zcash)
pub const SAPLING_DIVERSIFIER_SIZE: usize = 11;

/// Sapling payment address (diversifier + pk_d)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct SaplingPaymentAddress {
    /// Diversifier (11 bytes)
    pub d: [u8; SAPLING_DIVERSIFIER_SIZE],
    /// Diversified transmission key pk_d (32 bytes)
    pub pk_d: [u8; 32],
}

impl SaplingPaymentAddress {
    pub const SIZE: usize = SAPLING_DIVERSIFIER_SIZE + 32;

    /// Get raw bytes representation (43 bytes total)
    pub fn to_bytes(&self) -> [u8; 43] {
        let mut bytes = [0u8; 43];
        bytes[0..11].copy_from_slice(&self.d);
        bytes[11..43].copy_from_slice(&self.pk_d);
        bytes
    }

    /// Create from raw bytes
    pub fn from_bytes(bytes: &[u8; 43]) -> Self {
        let mut d = [0u8; SAPLING_DIVERSIFIER_SIZE];
        let mut pk_d = [0u8; 32];
        d.copy_from_slice(&bytes[0..11]);
        pk_d.copy_from_slice(&bytes[11..43]);
        Self { d, pk_d }
    }

    /// Get SHA256d hash of this payment address
    pub fn get_hash(&self) -> [u8; 32] {
        let bytes = self.to_bytes();
        let hash1 = Sha256::digest(&bytes);
        let hash2 = Sha256::digest(&hash1);
        hash2.into()
    }
}

/// Sapling incoming viewing key (ivk)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct SaplingIncomingViewingKey {
    pub ivk: [u8; 32],
}

impl SaplingIncomingViewingKey {
    /// Derive payment address from diversifier
    pub fn address(&self, diversifier: [u8; SAPLING_DIVERSIFIER_SIZE]) -> Result<SaplingPaymentAddress> {
        // Derive pk_d from ivk and diversifier using hash-to-curve simulation
        let mut hasher = Blake3::new();
        hasher.update(&self.ivk);
        hasher.update(&diversifier);
        hasher.update(b"sapling_pk_d_derivation");
        let pk_d: [u8; 32] = hasher.finalize().into();

        Ok(SaplingPaymentAddress {
            d: diversifier,
            pk_d,
        })
    }

    /// Generate default diversifier (all zeros except first byte)
    pub fn default_diversifier() -> [u8; SAPLING_DIVERSIFIER_SIZE] {
        let mut div = [0u8; SAPLING_DIVERSIFIER_SIZE];
        div[0] = 1; // Start with non-zero to ensure validity
        div
    }
}

/// Sapling full viewing key (ak, nk, ovk)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct SaplingFullViewingKey {
    /// Authentication key (ak)
    pub ak: [u8; 32],
    /// Nullifier deriving key (nk)
    pub nk: [u8; 32],
    /// Outgoing viewing key (ovk)
    pub ovk: [u8; 32],
}

impl SaplingFullViewingKey {
    pub const SIZE: usize = 96;

    /// Get fingerprint for ZIP 32 key derivation
    pub fn get_fingerprint(&self) -> [u8; 32] {
        let mut hasher = Sha256::new();
        hasher.update(&self.ak);
        hasher.update(&self.nk);
        hasher.update(&self.ovk);
        hasher.update(b"sapling_fvk_fingerprint");
        hasher.finalize().into()
    }

    /// Derive incoming viewing key
    pub fn in_viewing_key(&self) -> SaplingIncomingViewingKey {
        let mut hasher = Blake3::new();
        hasher.update(&self.ak);
        hasher.update(&self.nk);
        hasher.update(b"sapling_ivk_derivation");
        let ivk = hasher.finalize().into();

        SaplingIncomingViewingKey { ivk }
    }

    /// Check if this full viewing key is valid
    pub fn is_valid(&self) -> bool {
        // Check that keys are not all zeros
        !self.ak.iter().all(|&x| x == 0) &&
        !self.nk.iter().all(|&x| x == 0) &&
        !self.ovk.iter().all(|&x| x == 0)
    }
}

/// Sapling expanded spending key (ask, nsk, ovk)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct SaplingExpandedSpendingKey {
    /// Spend authorizing key (ask)
    pub ask: [u8; 32],
    /// Proof authorizing key (nsk)
    pub nsk: [u8; 32],
    /// Outgoing viewing key (ovk)
    pub ovk: [u8; 32],
}

impl SaplingExpandedSpendingKey {
    pub const SIZE: usize = 96;

    /// Derive full viewing key from expanded spending key
    pub fn full_viewing_key(&self) -> SaplingFullViewingKey {
        // Derive ak from ask
        let mut hasher = Blake3::new();
        hasher.update(&self.ask);
        hasher.update(b"sapling_ak_derivation");
        let ak = hasher.finalize().into();

        // Derive nk from nsk
        let mut hasher = Blake3::new();
        hasher.update(&self.nsk);
        hasher.update(b"sapling_nk_derivation");
        let nk = hasher.finalize().into();

        SaplingFullViewingKey {
            ak,
            nk,
            ovk: self.ovk,
        }
    }
}

/// Sapling spending key (32-byte seed)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct SaplingSpendingKey {
    pub sk: [u8; 32],
}

impl SaplingSpendingKey {
    pub const SIZE: usize = 32;

    /// Generate random spending key from seed
    pub fn random(seed: &[u8]) -> Self {
        let mut hasher = Blake3::new();
        hasher.update(seed);
        hasher.update(b"sapling_spending_key");
        let sk = hasher.finalize().into();

        Self { sk }
    }

    /// Expand spending key to get ask, nsk, ovk
    pub fn expanded_spending_key(&self) -> SaplingExpandedSpendingKey {
        // Derive ask
        let mut hasher = Blake3::new();
        hasher.update(&self.sk);
        hasher.update(b"sapling_ask_derivation");
        let ask = hasher.finalize().into();

        // Derive nsk
        let mut hasher = Blake3::new();
        hasher.update(&self.sk);
        hasher.update(b"sapling_nsk_derivation");
        let nsk = hasher.finalize().into();

        // Derive ovk
        let mut hasher = Blake3::new();
        hasher.update(&self.sk);
        hasher.update(b"sapling_ovk_derivation");
        let ovk = hasher.finalize().into();

        SaplingExpandedSpendingKey { ask, nsk, ovk }
    }

    /// Get full viewing key
    pub fn full_viewing_key(&self) -> SaplingFullViewingKey {
        self.expanded_spending_key().full_viewing_key()
    }

    /// Get default payment address
    pub fn default_address(&self) -> SaplingPaymentAddress {
        let fvk = self.full_viewing_key();
        let ivk = fvk.in_viewing_key();
        let div = SaplingIncomingViewingKey::default_diversifier();

        ivk.address(div).unwrap()
    }
}

/// Blake3 wrapper for consistent hashing
struct Blake3 {
    hasher: blake3::Hasher,
}

impl Blake3 {
    fn new() -> Self {
        Self {
            hasher: blake3::Hasher::new(),
        }
    }

    fn update(&mut self, data: &[u8]) {
        self.hasher.update(data);
    }

    fn finalize(&self) -> [u8; 32] {
        let hash = self.hasher.clone().finalize();
        hash.into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sapling_key_generation() {
        let seed = b"test_seed_for_sapling_keys_12345";
        let sk = SaplingSpendingKey::random(seed);
        let fvk = sk.full_viewing_key();

        assert!(fvk.is_valid());

        let ivk = fvk.in_viewing_key();
        let div = SaplingIncomingViewingKey::default_diversifier();
        let addr = ivk.address(div).unwrap();

        // Verify address is 43 bytes
        let bytes = addr.to_bytes();
        assert_eq!(bytes.len(), 43);

        // Verify round-trip
        let addr2 = SaplingPaymentAddress::from_bytes(&bytes);
        assert_eq!(addr.d, addr2.d);
        assert_eq!(addr.pk_d, addr2.pk_d);
    }

    #[test]
    fn test_default_address() {
        let seed = b"another_test_seed_for_default_addr";
        let sk = SaplingSpendingKey::random(seed);
        let addr = sk.default_address();

        let hash = addr.get_hash();
        assert_ne!(hash, [0u8; 32]);
    }
}
