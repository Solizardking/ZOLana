//! Instruction handlers for Dark Protocol.

use anchor_lang::prelude::*;

pub mod ai_agent;
pub mod private_swap;
pub mod private_transfer;
pub mod privacy_pool;
pub mod shield;
pub mod shielded_address;
pub mod unshield;

/// Verification is not wired to a production verifier yet.
pub mod verify {
    use super::*;
    use crate::errors::DarkProtocolError;

    pub fn handler(
        _ctx: Context<crate::VerifyProof>,
        _proof: Vec<u8>,
        _public_inputs: Vec<[u8; 32]>,
    ) -> Result<()> {
        err!(DarkProtocolError::FeatureNotProductionReady)
    }
}

/// Direct Merkle updates would let callers create commitments without custody
/// accounting. Keep this closed until an authority-gated implementation exists.
pub mod merkle {
    use super::*;
    use crate::errors::DarkProtocolError;

    pub fn update_handler(
        _ctx: Context<crate::UpdateMerkleTree>,
        _commitment: [u8; 32],
    ) -> Result<()> {
        err!(DarkProtocolError::FeatureNotProductionReady)
    }
}
