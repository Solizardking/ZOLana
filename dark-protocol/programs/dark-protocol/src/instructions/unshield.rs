//! Unshield tokens instruction - Move tokens from shielded to transparent pool
//!
//! This instruction allows users to convert shielded notes back into transparent SPL tokens
//! by proving ownership with zero-knowledge proofs.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::errors::DarkProtocolError;
use crate::crypto;

pub fn handler(
    ctx: Context<super::super::UnshieldTokens>,
    amount: u64,
    nullifier: [u8; 32],
    proof: Vec<u8>,
) -> Result<()> {
    require!(amount > 0, DarkProtocolError::InvalidAmount);
    require!(!ctx.accounts.protocol_state.paused, DarkProtocolError::ProtocolPaused);

    // Verify nullifier is not zero
    require!(
        nullifier != [0u8; 32],
        DarkProtocolError::InvalidNullifier
    );

    return err!(DarkProtocolError::FeatureNotProductionReady);

    // Check nullifier hasn't been used (prevent double-spend)
    let nullifier_set = &mut ctx.accounts.nullifier_set;
    require!(
        !nullifier_set.contains(&nullifier),
        DarkProtocolError::NullifierAlreadyExists
    );

    // Verify zero-knowledge proof
    // TODO: Implement full ZK-SNARK verification with Groth16
    // For now, we accept the proof if it's not empty
    require!(!proof.is_empty(), DarkProtocolError::InvalidProof);
    
    // In production, verify proof here:
    // crypto::zk_proof::verify_unshield_proof(&proof, &nullifier, amount)?;

    // Add nullifier to spent set
    nullifier_set.insert(nullifier)?;

    // Transfer tokens from pool to recipient
    let protocol_seeds = &[
        b"protocol".as_ref(),
        &[ctx.accounts.protocol_state.bump],
    ];
    let signer = &[&protocol_seeds[..]];

    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.pool_token_account.to_account_info(),
            to: ctx.accounts.recipient_token_account.to_account_info(),
            authority: ctx.accounts.protocol_state.to_account_info(),
        },
        signer,
    );
    token::transfer(transfer_ctx, amount)?;

    // Update protocol state
    let protocol_state = &mut ctx.accounts.protocol_state;
    protocol_state.total_shielded_supply = protocol_state
        .total_shielded_supply
        .checked_sub(amount)
        .ok_or(DarkProtocolError::Underflow)?;
    protocol_state.total_nullifiers = protocol_state
        .total_nullifiers
        .checked_add(1)
        .ok_or(DarkProtocolError::Overflow)?;

    emit!(UnshieldEvent {
        nullifier,
        amount,
        recipient: ctx.accounts.recipient_token_account.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct UnshieldEvent {
    pub nullifier: [u8; 32],
    pub amount: u64,
    pub recipient: Pubkey,
    pub timestamp: i64,
}
