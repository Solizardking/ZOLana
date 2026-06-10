//! Zcash cryptographic primitives ported to Rust for Solana
//!
//! This module contains ports of Zcash's privacy-preserving cryptography:
//! - Sapling address generation and key management
//! - Note encryption/decryption using ChaCha20-Poly1305
//! - Pseudo-random functions (PRF) for key derivation
//! - ZIP-32 hierarchical deterministic key derivation

pub mod prf;
pub mod sapling;
pub mod note_encryption;
pub mod zip32;

pub use prf::*;
pub use sapling::*;
pub use note_encryption::*;
pub use zip32::*;

// Core constants from Zcash
pub const SAPLING_DIVERSIFIER_SIZE: usize = 11;
pub const NOTEENCRYPTION_AUTH_BYTES: usize = 16;
pub const NOTEENCRYPTION_CIPHER_KEYSIZE: usize = 32;

// Personalization strings for BLAKE2b
pub const ZCASH_EXPANDSEED_PERSONALIZATION: &[u8; 16] = b"Zcash_ExpandSeed";
pub const ZCASH_SAPLING_FVFP_PERSONALIZATION: &[u8; 16] = b"ZcashSaplingFVFP";
pub const ZCASH_HD_SEED_FP_PERSONAL: &[u8; 16] = b"Zcash_HD_Seed_FP";
pub const ZCASH_TADDR_OVK_PERSONAL: &[u8; 16] = b"ZcTaddrToSapling";
pub const ZCASH_KDF_PERSONALIZATION_PREFIX: &[u8; 8] = b"ZcashKDF";

// Hardened key limit for BIP-32/ZIP-32
pub const HARDENED_KEY_LIMIT: u32 = 0x80000000;
