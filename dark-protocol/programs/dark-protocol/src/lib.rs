use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount};

pub mod state;
pub mod crypto;
pub mod errors;
pub mod zcash;
pub mod instructions;

use state::*;
use errors::DarkProtocolError;

// Import Zcash Sapling primitives for use in instructions
use crate::zcash::*;

declare_id!("Bf3jjD5Pojx5mHZVwJCWg7wC1oPg2hsn7ufsWaKoHv9E");

#[program]
pub mod dark_protocol {
    use super::*;

    /// Initialize the Dark Protocol with a privacy pool
    pub fn initialize_protocol(
        ctx: Context<InitializeProtocol>,
        merkle_tree_depth: u8,
    ) -> Result<()> {
        let protocol = &mut ctx.accounts.protocol_state;
        protocol.authority = ctx.accounts.authority.key();
        protocol.merkle_tree_depth = merkle_tree_depth;
        protocol.total_shielded_supply = 0;
        protocol.total_commitments = 0;
        protocol.total_nullifiers = 0;
        protocol.paused = false;
        protocol.bump = ctx.bumps.protocol_state;

        let tree = &mut ctx.accounts.merkle_tree;
        tree.depth = merkle_tree_depth;
        tree.next_index = 0;
        tree.root = MerkleTree::ZERO_VALUE;
        tree.filled_subtrees = Vec::new();
        tree.roots = Vec::new();
        tree.bump = ctx.bumps.merkle_tree;

        Ok(())
    }

    /// Create a shielded address (privacy-preserving address)
    pub fn create_shielded_address(
        ctx: Context<CreateShieldedAddress>,
        viewing_key: [u8; 32],
        spending_key_commitment: [u8; 32],
    ) -> Result<()> {
        instructions::shielded_address::create_handler(
            ctx,
            viewing_key,
            spending_key_commitment,
        )
    }

    /// Shield tokens - move tokens from transparent to shielded pool
    pub fn shield_tokens(
        ctx: Context<ShieldTokens>,
        amount: u64,
        commitment: [u8; 32],
        nullifier: [u8; 32],
    ) -> Result<()> {
        instructions::shield::handler(ctx, amount, commitment, nullifier)
    }

    /// Unshield tokens - move tokens from shielded to transparent pool
    pub fn unshield_tokens(
        ctx: Context<UnshieldTokens>,
        amount: u64,
        nullifier: [u8; 32],
        proof: Vec<u8>,
    ) -> Result<()> {
        instructions::unshield::handler(ctx, amount, nullifier, proof)
    }

    /// Private transfer - transfer tokens between shielded addresses
    pub fn private_transfer(
        ctx: Context<PrivateTransfer>,
        input_nullifiers: Vec<[u8; 32]>,
        output_commitments: Vec<[u8; 32]>,
        proof: Vec<u8>,
        encrypted_memo: Vec<u8>,
    ) -> Result<()> {
        instructions::private_transfer::handler(
            ctx,
            input_nullifiers,
            output_commitments,
            proof,
            encrypted_memo,
        )
    }

    /// Private swap using Jupiter integration
    pub fn private_swap(
        ctx: Context<PrivateSwap>,
        input_amount: u64,
        input_commitment: [u8; 32],
        output_commitment: [u8; 32],
        nullifier: [u8; 32],
        proof: Vec<u8>,
        jupiter_route_plan: Vec<u8>,
    ) -> Result<()> {
        instructions::private_swap::handler(
            ctx,
            input_amount,
            input_commitment,
            output_commitment,
            nullifier,
            proof,
            jupiter_route_plan,
        )
    }

    /// Add liquidity to privacy pool
    pub fn add_to_privacy_pool(
        ctx: Context<AddToPrivacyPool>,
        amount: u64,
        commitment: [u8; 32],
    ) -> Result<()> {
        instructions::privacy_pool::add_handler(ctx, amount, commitment)
    }

    /// Remove liquidity from privacy pool
    pub fn remove_from_privacy_pool(
        ctx: Context<RemoveFromPrivacyPool>,
        amount: u64,
        nullifier: [u8; 32],
        proof: Vec<u8>,
    ) -> Result<()> {
        instructions::privacy_pool::remove_handler(ctx, amount, nullifier, proof)
    }

    /// Verify zero-knowledge proof
    pub fn verify_zk_proof(
        ctx: Context<VerifyProof>,
        proof: Vec<u8>,
        public_inputs: Vec<[u8; 32]>,
    ) -> Result<()> {
        instructions::verify::handler(ctx, proof, public_inputs)
    }

    /// Update merkle tree with new commitment
    pub fn update_merkle_tree(
        ctx: Context<UpdateMerkleTree>,
        commitment: [u8; 32],
    ) -> Result<()> {
        instructions::merkle::update_handler(ctx, commitment)
    }

    /// Register AI agent in TEE
    pub fn register_ai_agent(
        ctx: Context<RegisterAIAgent>,
        agent_pubkey: Pubkey,
        tee_attestation: Vec<u8>,
        capabilities: Vec<u8>,
    ) -> Result<()> {
        instructions::ai_agent::register_handler(
            ctx,
            agent_pubkey,
            tee_attestation,
            capabilities,
        )
    }

    /// Execute AI agent action with privacy
    pub fn execute_ai_action(
        ctx: Context<ExecuteAIAction>,
        action_type: u8,
        encrypted_params: Vec<u8>,
        proof: Vec<u8>,
    ) -> Result<()> {
        instructions::ai_agent::execute_handler(
            ctx,
            action_type,
            encrypted_params,
            proof,
        )
    }
}

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + ProtocolState::SPACE,
        seeds = [b"protocol"],
        bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        init,
        payer = authority,
        space = 8 + MerkleTree::SPACE,
        seeds = [b"merkle_tree"],
        bump
    )]
    pub merkle_tree: Account<'info, MerkleTree>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateShieldedAddress<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + ShieldedAddress::SPACE,
        seeds = [b"shielded_address", payer.key().as_ref()],
        bump
    )]
    pub shielded_address: Account<'info, ShieldedAddress>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64, commitment: [u8; 32], nullifier: [u8; 32])]
pub struct ShieldTokens<'info> {
    #[account(
        mut,
        seeds = [b"protocol"],
        bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        mut,
        seeds = [b"merkle_tree"],
        bump
    )]
    pub merkle_tree: Account<'info, MerkleTree>,

    #[account(
        init,
        payer = user,
        space = 8 + Note::SPACE,
        seeds = [b"note", commitment.as_ref()],
        bump
    )]
    pub note: Account<'info, Note>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub pool_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UnshieldTokens<'info> {
    #[account(
        mut,
        seeds = [b"protocol"],
        bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        mut,
        seeds = [b"nullifier_set"],
        bump
    )]
    pub nullifier_set: Account<'info, NullifierSet>,

    #[account(mut)]
    pub pool_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub recipient_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct PrivateTransfer<'info> {
    #[account(
        mut,
        seeds = [b"protocol"],
        bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        mut,
        seeds = [b"merkle_tree"],
        bump
    )]
    pub merkle_tree: Account<'info, MerkleTree>,

    #[account(
        mut,
        seeds = [b"nullifier_set"],
        bump
    )]
    pub nullifier_set: Account<'info, NullifierSet>,

    #[account(mut)]
    pub sender: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PrivateSwap<'info> {
    #[account(
        mut,
        seeds = [b"protocol"],
        bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        mut,
        seeds = [b"merkle_tree"],
        bump
    )]
    pub merkle_tree: Account<'info, MerkleTree>,

    #[account(
        mut,
        seeds = [b"nullifier_set"],
        bump
    )]
    pub nullifier_set: Account<'info, NullifierSet>,

    #[account(mut)]
    pub pool_token_account_in: Account<'info, TokenAccount>,

    #[account(mut)]
    pub pool_token_account_out: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: Jupiter program
    pub jupiter_program: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddToPrivacyPool<'info> {
    #[account(
        mut,
        seeds = [b"privacy_pool"],
        bump
    )]
    pub privacy_pool: Account<'info, PrivacyPool>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub pool_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RemoveFromPrivacyPool<'info> {
    #[account(
        mut,
        seeds = [b"privacy_pool"],
        bump
    )]
    pub privacy_pool: Account<'info, PrivacyPool>,

    #[account(
        mut,
        seeds = [b"nullifier_set"],
        bump
    )]
    pub nullifier_set: Account<'info, NullifierSet>,

    #[account(mut)]
    pub pool_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub recipient_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct VerifyProof<'info> {
    #[account(
        seeds = [b"protocol"],
        bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,
}

#[derive(Accounts)]
pub struct UpdateMerkleTree<'info> {
    #[account(
        mut,
        seeds = [b"merkle_tree"],
        bump
    )]
    pub merkle_tree: Account<'info, MerkleTree>,

    #[account(
        seeds = [b"protocol"],
        bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,
}

#[derive(Accounts)]
#[instruction(agent_pubkey: Pubkey)]
pub struct RegisterAIAgent<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + AIAgent::SPACE,
        seeds = [b"ai_agent", agent_pubkey.as_ref()],
        bump
    )]
    pub ai_agent: Account<'info, AIAgent>,

    #[account(
        mut,
        seeds = [b"protocol"],
        bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteAIAction<'info> {
    #[account(
        mut,
        seeds = [b"ai_agent", ai_agent.agent_pubkey.as_ref()],
        bump
    )]
    pub ai_agent: Account<'info, AIAgent>,

    #[account(
        mut,
        seeds = [b"protocol"],
        bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(mut)]
    pub executor: Signer<'info>,
}
