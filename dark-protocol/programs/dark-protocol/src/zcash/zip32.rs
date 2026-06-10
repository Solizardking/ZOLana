//! ZIP-32 Hierarchical Deterministic Key Derivation
//!
//! Ported from src/zcash/address/zip32.cpp and zip32.h
//! Implements HD wallet key derivation for Sapling keys

use blake2b_simd::Params as Blake2bParams;
use solana_program::msg;

use super::sapling::{
    SaplingExpandedSpendingKey, SaplingFullViewingKey,
    SaplingIncomingViewingKey, SaplingPaymentAddress,
};
use super::{HARDENED_KEY_LIMIT, ZCASH_HD_SEED_FP_PERSONAL, ZCASH_TADDR_OVK_PERSONAL};

/// Diversifier index for address generation (88 bits / 11 bytes)
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct DiversifierIndex {
    data: [u8; 11],
}

impl DiversifierIndex {
    pub fn new(data: [u8; 11]) -> Self {
        Self { data }
    }

    pub fn zero() -> Self {
        Self { data: [0u8; 11] }
    }

    pub fn from_u64(value: u64) -> Self {
        let mut data = [0u8; 11];
        data[0] = (value & 0xFF) as u8;
        data[1] = ((value >> 8) & 0xFF) as u8;
        data[2] = ((value >> 16) & 0xFF) as u8;
        data[3] = ((value >> 24) & 0xFF) as u8;
        data[4] = ((value >> 32) & 0xFF) as u8;
        data[5] = ((value >> 40) & 0xFF) as u8;
        data[6] = ((value >> 48) & 0xFF) as u8;
        data[7] = ((value >> 56) & 0xFF) as u8;
        Self { data }
    }

    /// Increment diversifier index
    pub fn increment(&mut self) -> bool {
        for i in 0..11 {
            self.data[i] = self.data[i].wrapping_add(1);
            if self.data[i] != 0 {
                return true; // No overflow
            }
        }
        false // Overflow
    }

    /// Get next diversifier index
    pub fn succ(&self) -> Option<Self> {
        let mut next = *self;
        if next.increment() {
            Some(next)
        } else {
            None
        }
    }

    pub fn to_bytes(&self) -> [u8; 11] {
        self.data
    }
}

/// HD seed for wallet
#[derive(Debug, Clone)]
pub struct HDSeed {
    seed: Vec<u8>,
}

impl HDSeed {
    pub fn new(seed: Vec<u8>) -> Self {
        Self { seed }
    }

    /// Get seed fingerprint using BLAKE2b
    pub fn fingerprint(&self) -> [u8; 32] {
        let hash = Blake2bParams::new()
            .hash_length(32)
            .personal(ZCASH_HD_SEED_FP_PERSONAL)
            .to_state()
            .update(&self.seed)
            .finalize();

        let mut result = [0u8; 32];
        result.copy_from_slice(hash.as_bytes());
        result
    }

    pub fn raw_seed(&self) -> &[u8] {
        &self.seed
    }
}

/// Generate ovk for shielding from transparent address
pub fn ovk_for_shielding_from_taddr(seed: &HDSeed) -> [u8; 32] {
    use super::prf::prf_ovk;

    let raw_seed = seed.raw_seed();

    // I = BLAKE2b-512("ZcTaddrToSapling", seed)
    let hash = Blake2bParams::new()
        .hash_length(64)
        .personal(ZCASH_TADDR_OVK_PERSONAL)
        .to_state()
        .update(raw_seed)
        .finalize();

    // I_L = I[0..32]
    let mut intermediate_l = [0u8; 32];
    intermediate_l.copy_from_slice(&hash.as_bytes()[0..32]);

    // ovk = truncate_32(PRF^expand(I_L, [0x02]))
    prf_ovk(&intermediate_l)
}

/// Sapling diversifiable full viewing key
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SaplingDiversifiableFullViewingKey {
    pub fvk: SaplingFullViewingKey,
    pub dk: [u8; 32], // Diversifier key
}

impl SaplingDiversifiableFullViewingKey {
    pub fn new(fvk: SaplingFullViewingKey, dk: [u8; 32]) -> Self {
        Self { fvk, dk }
    }

    /// Get internal (change) full viewing key
    pub fn get_internal_dfvk(&self) -> Self {
        // Simplified: In production would call sapling::zip32::derive_internal_fvk
        use solana_program::hash::hash;
        let mut data = Vec::with_capacity(128);
        data.extend_from_slice(&self.fvk.to_bytes());
        data.extend_from_slice(&self.dk);
        let hash_result = hash(&data).to_bytes();

        // Derive internal dk
        let mut internal_dk = [0u8; 32];
        internal_dk.copy_from_slice(&hash_result);

        Self {
            fvk: self.fvk,
            dk: internal_dk,
        }
    }

    /// Attempt to derive address at diversifier index
    pub fn address(&self, j: DiversifierIndex) -> Option<SaplingPaymentAddress> {
        // Simplified: In production would call sapling::zip32::address
        let ivk = self.fvk.in_viewing_key();
        let diversifier = self.diversifier_at_index(j);
        ivk.address(diversifier)
    }

    /// Find first valid address starting from index
    pub fn find_address(&self, mut j: DiversifierIndex) -> (SaplingPaymentAddress, DiversifierIndex) {
        loop {
            if let Some(addr) = self.address(j) {
                return (addr, j);
            }
            j = j.succ().expect("Diversifier index overflow");
        }
    }

    /// Get default address (at diversifier index 0)
    pub fn default_address(&self) -> SaplingPaymentAddress {
        let (addr, _) = self.find_address(DiversifierIndex::zero());
        addr
    }

    /// Get change address (internal)
    pub fn get_change_address(&self) -> SaplingPaymentAddress {
        let internal_dfvk = self.get_internal_dfvk();
        internal_dfvk.default_address()
    }

    /// Get change incoming viewing key
    pub fn get_change_ivk(&self) -> SaplingIncomingViewingKey {
        let internal_dfvk = self.get_internal_dfvk();
        internal_dfvk.fvk.in_viewing_key()
    }

    /// Get OVKs (internal, external)
    pub fn get_ovks(&self) -> ([u8; 32], [u8; 32]) {
        let internal_dfvk = self.get_internal_dfvk();
        (internal_dfvk.fvk.ovk, self.fvk.ovk)
    }

    /// Generate diversifier at index
    fn diversifier_at_index(&self, j: DiversifierIndex) -> [u8; 11] {
        // Simplified: In production would call sapling::zip32 functions
        use super::prf::ZCASH_EXPANDSEED_PERSONALIZATION;

        let mut data = Vec::with_capacity(43);
        data.extend_from_slice(&self.dk);
        data.extend_from_slice(&j.to_bytes());

        let hash = Blake2bParams::new()
            .hash_length(64)
            .personal(ZCASH_EXPANDSEED_PERSONALIZATION)
            .to_state()
            .update(&data)
            .finalize();

        let mut diversifier = [0u8; 11];
        diversifier.copy_from_slice(&hash.as_bytes()[0..11]);
        diversifier
    }

    /// Serialize to bytes
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(128);
        bytes.extend_from_slice(&self.fvk.to_bytes());
        bytes.extend_from_slice(&self.dk);
        bytes
    }
}

/// Sapling extended full viewing key (with derivation metadata)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SaplingExtendedFullViewingKey {
    pub depth: u8,
    pub parent_fvk_tag: u32,
    pub child_index: u32,
    pub chaincode: [u8; 32],
    pub fvk: SaplingFullViewingKey,
    pub dk: [u8; 32],
}

impl SaplingExtendedFullViewingKey {
    /// Serialize to bytes (169 bytes)
    pub fn to_bytes(&self) -> [u8; 169] {
        let mut bytes = [0u8; 169];
        bytes[0] = self.depth;
        bytes[1..5].copy_from_slice(&self.parent_fvk_tag.to_be_bytes());
        bytes[5..9].copy_from_slice(&self.child_index.to_be_bytes());
        bytes[9..41].copy_from_slice(&self.chaincode);
        bytes[41..137].copy_from_slice(&self.fvk.to_bytes());
        bytes[137..169].copy_from_slice(&self.dk);
        bytes
    }

    /// Get as diversifiable full viewing key
    pub fn as_dfvk(&self) -> SaplingDiversifiableFullViewingKey {
        SaplingDiversifiableFullViewingKey::new(self.fvk, self.dk)
    }
}

/// Sapling extended spending key
#[derive(Debug, Clone)]
pub struct SaplingExtendedSpendingKey {
    pub depth: u8,
    pub parent_fvk_tag: u32,
    pub child_index: u32,
    pub chaincode: [u8; 32],
    pub expsk: SaplingExpandedSpendingKey,
    pub dk: [u8; 32],
}

impl SaplingExtendedSpendingKey {
    /// Derive master key from HD seed
    pub fn master(seed: &HDSeed) -> Self {
        // Simplified: In production would call sapling::zip32::xsk_master
        use solana_program::hash::hash;

        let raw_seed = seed.raw_seed();
        let hash_result = hash(raw_seed).to_bytes();

        // Derive ask, nsk, ovk from hash
        let mut ask = [0u8; 32];
        let mut nsk = [0u8; 32];
        let mut ovk = [0u8; 32];
        let mut chaincode = [0u8; 32];
        let mut dk = [0u8; 32];

        ask.copy_from_slice(&hash_result);
        nsk = hash(&ask).to_bytes();
        ovk = hash(&nsk).to_bytes();
        chaincode = hash(&ovk).to_bytes();
        dk = hash(&chaincode).to_bytes();

        let expsk = SaplingExpandedSpendingKey::new(ask, nsk, ovk);

        Self {
            depth: 0,
            parent_fvk_tag: 0,
            child_index: 0,
            chaincode,
            expsk,
            dk,
        }
    }

    /// Derive child key at index (hardened derivation only)
    pub fn derive(&self, i: u32) -> Result<Self, &'static str> {
        if i < HARDENED_KEY_LIMIT {
            return Err("Non-hardened derivation is unsupported");
        }

        // Simplified: In production would call sapling::zip32::xsk_derive
        use solana_program::hash::hash;

        let mut data = Vec::with_capacity(169);
        data.extend_from_slice(&self.to_bytes());
        data.extend_from_slice(&i.to_be_bytes());

        let hash_result = hash(&data).to_bytes();

        let mut ask = [0u8; 32];
        let mut nsk = [0u8; 32];
        let mut ovk = [0u8; 32];
        let mut chaincode = [0u8; 32];
        let mut dk = [0u8; 32];

        ask.copy_from_slice(&hash_result);
        nsk = hash(&ask).to_bytes();
        ovk = hash(&nsk).to_bytes();
        chaincode = hash(&ovk).to_bytes();
        dk = hash(&chaincode).to_bytes();

        let expsk = SaplingExpandedSpendingKey::new(ask, nsk, ovk);

        Ok(Self {
            depth: self.depth + 1,
            parent_fvk_tag: (self.to_xfvk().fvk.get_fingerprint()[0] as u32) << 24,
            child_index: i,
            chaincode,
            expsk,
            dk,
        })
    }

    /// Derive key for account using standard path: m/32'/coin_type'/account'
    pub fn for_account(
        seed: &HDSeed,
        bip44_coin_type: u32,
        account_id: u32,
    ) -> Result<(Self, String), &'static str> {
        let m = Self::master(seed);

        // Derive m/32'
        let m_32h = m.derive(32 | HARDENED_KEY_LIMIT)?;

        // Derive m/32'/coin_type'
        let m_32h_cth = m_32h.derive(bip44_coin_type | HARDENED_KEY_LIMIT)?;

        // Derive m/32'/coin_type'/account'
        let xsk = m_32h_cth.derive(account_id | HARDENED_KEY_LIMIT)?;

        let path = format!("m/32'/{}'/{}'", bip44_coin_type, account_id);
        Ok((xsk, path))
    }

    /// Convert to extended full viewing key
    pub fn to_xfvk(&self) -> SaplingExtendedFullViewingKey {
        SaplingExtendedFullViewingKey {
            depth: self.depth,
            parent_fvk_tag: self.parent_fvk_tag,
            child_index: self.child_index,
            chaincode: self.chaincode,
            fvk: self.expsk.full_viewing_key(),
            dk: self.dk,
        }
    }

    /// Derive internal (change) key
    pub fn derive_internal_key(&self) -> Self {
        // Simplified: In production would call sapling::zip32::xsk_derive_internal
        use solana_program::hash::hash;

        let data = self.to_bytes();
        let hash_result = hash(&data).to_bytes();

        let mut ask = [0u8; 32];
        let mut nsk = [0u8; 32];
        let mut ovk = [0u8; 32];
        let mut dk = [0u8; 32];

        ask.copy_from_slice(&hash_result);
        nsk = hash(&ask).to_bytes();
        ovk = hash(&nsk).to_bytes();
        dk = hash(&ovk).to_bytes();

        let expsk = SaplingExpandedSpendingKey::new(ask, nsk, ovk);

        Self {
            depth: self.depth,
            parent_fvk_tag: self.parent_fvk_tag,
            child_index: self.child_index,
            chaincode: self.chaincode,
            expsk,
            dk,
        }
    }

    /// Serialize to bytes (169 bytes)
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(169);
        bytes.push(self.depth);
        bytes.extend_from_slice(&self.parent_fvk_tag.to_be_bytes());
        bytes.extend_from_slice(&self.child_index.to_be_bytes());
        bytes.extend_from_slice(&self.chaincode);
        bytes.extend_from_slice(&self.expsk.to_bytes());
        bytes.extend_from_slice(&self.dk);
        bytes
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_diversifier_index() {
        let mut idx = DiversifierIndex::from_u64(0);
        assert!(idx.increment());

        let idx2 = idx.succ().unwrap();
        assert!(idx2 > idx);
    }

    #[test]
    fn test_hd_seed() {
        let seed = HDSeed::new(vec![1, 2, 3, 4, 5]);
        let fp = seed.fingerprint();
        assert_eq!(fp.len(), 32);

        // Fingerprint should be deterministic
        let fp2 = seed.fingerprint();
        assert_eq!(fp, fp2);
    }

    #[test]
    fn test_extended_spending_key() {
        let seed = HDSeed::new(vec![42u8; 32]);
        let master = SaplingExtendedSpendingKey::master(&seed);

        assert_eq!(master.depth, 0);
        assert_eq!(master.child_index, 0);

        // Test derivation
        let child = master.derive(HARDENED_KEY_LIMIT).unwrap();
        assert_eq!(child.depth, 1);
    }

    #[test]
    fn test_for_account() {
        let seed = HDSeed::new(vec![99u8; 32]);
        let (xsk, path) = SaplingExtendedSpendingKey::for_account(&seed, 133, 0).unwrap();

        assert!(path.contains("m/32'/133'/0'"));
        assert_eq!(xsk.depth, 3);
    }
}
