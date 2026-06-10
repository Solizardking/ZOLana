use anchor_lang::prelude::*;

#[error_code]
pub enum DarkProtocolError {
    #[msg("Merkle tree is full")]
    MerkleTreeFull,
    
    #[msg("Invalid merkle proof")]
    InvalidMerkleProof,
    
    #[msg("Nullifier already exists - double spend attempt")]
    NullifierAlreadyExists,
    
    #[msg("Invalid zero-knowledge proof")]
    InvalidZKProof,
    
    #[msg("Invalid commitment")]
    InvalidCommitment,
    
    #[msg("Invalid nullifier")]
    InvalidNullifier,
    
    #[msg("Insufficient shielded balance")]
    InsufficientShieldedBalance,
    
    #[msg("Amount exceeds maximum allowed")]
    AmountTooLarge,
    
    #[msg("Amount below minimum required")]
    AmountTooSmall,
    
    #[msg("Protocol is paused")]
    ProtocolPaused,
    
    #[msg("Unauthorized operation")]
    Unauthorized,
    
    #[msg("Invalid shielded address")]
    InvalidShieldedAddress,
    
    #[msg("Privacy pool error")]
    PrivacyPoolError,
    
    #[msg("TEE attestation verification failed")]
    TEEAttestationFailed,
    
    #[msg("AI agent not registered")]
    AIAgentNotRegistered,
    
    #[msg("AI agent not active")]
    AIAgentNotActive,
    
    #[msg("Invalid AI agent capability")]
    InvalidAIAgentCapability,
    
    #[msg("Jupiter swap failed")]
    JupiterSwapFailed,
    
    #[msg("Invalid swap route")]
    InvalidSwapRoute,
    
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,
    
    #[msg("Encrypted memo too large")]
    EncryptedMemoTooLarge,
    
    #[msg("Decryption failed")]
    DecryptionFailed,
    
    #[msg("Invalid encryption key")]
    InvalidEncryptionKey,
    
    #[msg("Merkle tree depth mismatch")]
    MerkleTreeDepthMismatch,
    
    #[msg("Invalid note")]
    InvalidNote,
    
    #[msg("Note already spent")]
    NoteAlreadySpent,
    
    #[msg("Invalid transaction type")]
    InvalidTransactionType,
    
    #[msg("Privacy level not supported")]
    PrivacyLevelNotSupported,
    
    #[msg("Computation overflow")]
    ComputationOverflow,
    
    #[msg("Invalid public input")]
    InvalidPublicInput,
    
    #[msg("Proof verification timeout")]
    ProofVerificationTimeout,
    
    #[msg("Invalid diversifier")]
    InvalidDiversifier,
    
    #[msg("Viewing key mismatch")]
    ViewingKeyMismatch,
    
    #[msg("Spending key verification failed")]
    SpendingKeyVerificationFailed,
}
