use anchor_lang::prelude::*;

/// Main protocol state containing global configuration
#[account]
pub struct ProtocolState {
    pub authority: Pubkey,
    pub merkle_tree_depth: u8,
    pub total_shielded_supply: u64,
    pub total_commitments: u64,
    pub total_nullifiers: u64,
    pub paused: bool,
    pub bump: u8,
}

impl ProtocolState {
    pub const SPACE: usize = 32 + 1 + 8 + 8 + 8 + 1 + 1;
}

/// Merkle tree for commitment tracking (Zcash-style)
#[account]
pub struct MerkleTree {
    pub depth: u8,
    pub next_index: u64,
    pub root: [u8; 32],
    pub filled_subtrees: Vec<[u8; 32]>,
    pub roots: Vec<[u8; 32]>, // Historical roots for proof verification
    pub bump: u8,
}

impl MerkleTree {
    pub const SPACE: usize = 1 + 8 + 32 + (4 + 32 * 32) + (4 + 32 * 100) + 1;
    
    pub const ZERO_VALUE: [u8; 32] = [
        0x2f, 0xe5, 0x4c, 0x60, 0xd3, 0xab, 0xbf, 0x8d,
        0x0d, 0x80, 0x43, 0x3e, 0xf5, 0x60, 0x61, 0x5f,
        0x38, 0xea, 0x7b, 0x60, 0x8d, 0x52, 0xb3, 0x14,
        0x29, 0x8d, 0x9f, 0x6e, 0x8c, 0x42, 0xf0, 0x00,
    ];
}

/// Shielded address containing Zcash Sapling viewing key data
/// Compatible with Zcash Sapling address system
#[account]
pub struct ShieldedAddress {
    pub owner: Pubkey,
    /// Sapling full viewing key (96 bytes: ak + nk + ovk)
    pub full_viewing_key: [u8; 96],
    /// Commitment to spending key (never store actual spending key on-chain!)
    pub spending_key_commitment: [u8; 32],
    /// Default diversifier for this address (11 bytes)
    pub diversifier: [u8; 11],
    /// Payment address pk_d (32 bytes)
    pub pk_d: [u8; 32],
    pub created_at: i64,
    pub bump: u8,
}

impl ShieldedAddress {
    pub const SPACE: usize = 32 + 96 + 32 + 11 + 32 + 8 + 1;

    /// Get the Sapling payment address from this shielded address
    pub fn payment_address(&self) -> crate::zcash::SaplingPaymentAddress {
        crate::zcash::SaplingPaymentAddress::new(self.diversifier, self.pk_d)
    }
}

/// Note representing a shielded UTXO with Zcash Sapling encryption
#[account]
pub struct Note {
    /// Note commitment (32 bytes)
    pub commitment: [u8; 32],
    /// Nullifier hash (32 bytes)
    pub nullifier_hash: [u8; 32],
    /// Ephemeral public key from note encryption (32 bytes)
    pub ephemeral_key: [u8; 32],
    /// Encrypted note ciphertext (580 bytes for Zcash Sapling)
    pub enc_ciphertext: Vec<u8>,
    /// Outgoing ciphertext for sender recovery (80 bytes)
    pub out_ciphertext: Vec<u8>,
    /// Token mint for this note
    pub token_mint: Pubkey,
    /// h_sig for note encryption (32 bytes)
    pub h_sig: [u8; 32],
    pub created_at: i64,
    pub spent: bool,
    pub bump: u8,
}

impl Note {
    // 580 bytes for enc_ciphertext, 80 bytes for out_ciphertext
    pub const SPACE: usize = 32 + 32 + 32 + (4 + 580) + (4 + 80) + 32 + 32 + 8 + 1 + 1;

    /// Check if this note can be decrypted by a given incoming viewing key
    pub fn try_decrypt(&self, ivk: &[u8; 32]) -> Option<Vec<u8>> {
        // Note: Full note decryption happens off-chain with TypeScript SDK
        // On-chain we only store encrypted data
        // Return Some if we have encrypted data, caller should decrypt off-chain
        if !self.enc_ciphertext.is_empty() {
            Some(self.enc_ciphertext.clone())
        } else {
            None
        }
    }
}

/// Set of spent nullifiers to prevent double-spending
#[account]
pub struct NullifierSet {
    pub nullifiers: Vec<[u8; 32]>,
    pub bump: u8,
}

impl NullifierSet {
    pub const SPACE: usize = 4 + (32 * 10000) + 1; // Support 10k nullifiers initially
    
    pub fn contains(&self, nullifier: &[u8; 32]) -> bool {
        self.nullifiers.iter().any(|n| n == nullifier)
    }
    
    pub fn insert(&mut self, nullifier: [u8; 32]) -> Result<()> {
        require!(!self.contains(&nullifier), crate::errors::DarkProtocolError::NullifierAlreadyExists);
        self.nullifiers.push(nullifier);
        Ok(())
    }
}

/// Privacy pool for mixing transactions
#[account]
pub struct PrivacyPool {
    pub total_deposited: u64,
    pub total_withdrawn: u64,
    pub active_commitments: u64,
    pub token_mint: Pubkey,
    pub min_deposit: u64,
    pub max_deposit: u64,
    pub fee_bps: u16, // Basis points (1 bps = 0.01%)
    pub bump: u8,
}

impl PrivacyPool {
    pub const SPACE: usize = 8 + 8 + 8 + 32 + 8 + 8 + 2 + 1;
}

/// AI Agent registered in TEE environment
#[account]
pub struct AIAgent {
    pub agent_pubkey: Pubkey,
    pub owner: Pubkey,
    pub tee_attestation_hash: [u8; 32],
    pub capabilities: Vec<u8>,
    pub trust_score: u16,
    pub total_actions: u64,
    pub successful_actions: u64,
    pub registered_at: i64,
    pub last_action_at: i64,
    pub is_active: bool,
    pub bump: u8,
}

impl AIAgent {
    pub const SPACE: usize = 32 + 32 + 32 + (4 + 256) + 2 + 8 + 8 + 8 + 8 + 1 + 1;
}

/// Zero-knowledge proof for private transactions
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct ZKProof {
    pub proof_a: [u8; 64],
    pub proof_b: [u8; 128],
    pub proof_c: [u8; 64],
}

impl ZKProof {
    pub const SIZE: usize = 64 + 128 + 64;
}

/// Encrypted note data
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct EncryptedNote {
    pub ciphertext: Vec<u8>,
    pub ephemeral_key: [u8; 32],
    pub nonce: [u8; 24],
}

/// Transaction metadata for privacy tracking
#[derive(Clone)]
pub struct PrivateTransactionMetadata {
    pub input_count: u8,
    pub output_count: u8,
    pub fee: u64,
    pub timestamp: i64,
    pub transaction_type: TransactionType,
}

impl anchor_lang::AnchorSerialize for PrivateTransactionMetadata {
    fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()> {
        self.input_count.serialize(writer)?;
        self.output_count.serialize(writer)?;
        self.fee.serialize(writer)?;
        self.timestamp.serialize(writer)?;
        self.transaction_type.serialize(writer)
    }
}

impl anchor_lang::AnchorDeserialize for PrivateTransactionMetadata {
    fn deserialize(buf: &mut &[u8]) -> std::io::Result<Self> {
        Ok(Self {
            input_count: u8::deserialize(buf)?,
            output_count: u8::deserialize(buf)?,
            fee: u64::deserialize(buf)?,
            timestamp: i64::deserialize(buf)?,
            transaction_type: TransactionType::deserialize(buf)?,
        })
    }

    fn deserialize_reader<R: std::io::Read>(reader: &mut R) -> std::io::Result<Self> {
        Ok(Self {
            input_count: u8::deserialize_reader(reader)?,
            output_count: u8::deserialize_reader(reader)?,
            fee: u64::deserialize_reader(reader)?,
            timestamp: i64::deserialize_reader(reader)?,
            transaction_type: TransactionType::deserialize_reader(reader)?,
        })
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum TransactionType {
    Shield,
    Unshield,
    PrivateTransfer,
    PrivateSwap,
    PoolDeposit,
    PoolWithdraw,
}

impl anchor_lang::AnchorSerialize for TransactionType {
    fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()> {
        (*self as u8).serialize(writer)
    }
}

impl anchor_lang::AnchorDeserialize for TransactionType {
    fn deserialize(buf: &mut &[u8]) -> std::io::Result<Self> {
        let discriminant = u8::deserialize(buf)?;
        match discriminant {
            0 => Ok(TransactionType::Shield),
            1 => Ok(TransactionType::Unshield),
            2 => Ok(TransactionType::PrivateTransfer),
            3 => Ok(TransactionType::PrivateSwap),
            4 => Ok(TransactionType::PoolDeposit),
            5 => Ok(TransactionType::PoolWithdraw),
            _ => Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "invalid enum discriminant")),
        }
    }

    fn deserialize_reader<R: std::io::Read>(reader: &mut R) -> std::io::Result<Self> {
        let discriminant = u8::deserialize_reader(reader)?;
        match discriminant {
            0 => Ok(TransactionType::Shield),
            1 => Ok(TransactionType::Unshield),
            2 => Ok(TransactionType::PrivateTransfer),
            3 => Ok(TransactionType::PrivateSwap),
            4 => Ok(TransactionType::PoolDeposit),
            5 => Ok(TransactionType::PoolWithdraw),
            _ => Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "invalid enum discriminant")),
        }
    }
}

/// Commitment for Pedersen commitment scheme
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct Commitment {
    pub value: [u8; 32],
    pub randomness: [u8; 32],
}

impl Commitment {
    pub fn hash(&self) -> [u8; 32] {
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();
        hasher.update(&self.value);
        hasher.update(&self.randomness);
        let result = hasher.finalize();
        result.into()
    }
}

/// Nullifier for preventing double-spending
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct Nullifier {
    pub commitment: [u8; 32],
    pub secret: [u8; 32],
}

impl Nullifier {
    pub fn hash(&self) -> [u8; 32] {
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();
        hasher.update(&self.commitment);
        hasher.update(&self.secret);
        let result = hasher.finalize();
        result.into()
    }
}

/// TEE attestation data
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TEEAttestation {
    pub measurement: [u8; 32],
    pub timestamp: i64,
    pub signature: Vec<u8>,
}

/// Privacy-preserving swap route
#[derive(Clone)]
pub struct PrivateSwapRoute {
    pub input_token: Pubkey,
    pub output_token: Pubkey,
    pub input_amount: u64,
    pub min_output_amount: u64,
    pub jupiter_route_data: Vec<u8>,
    pub privacy_level: PrivacyLevel,
}

impl anchor_lang::AnchorSerialize for PrivateSwapRoute {
    fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()> {
        self.input_token.serialize(writer)?;
        self.output_token.serialize(writer)?;
        self.input_amount.serialize(writer)?;
        self.min_output_amount.serialize(writer)?;
        self.jupiter_route_data.serialize(writer)?;
        self.privacy_level.serialize(writer)
    }
}

impl anchor_lang::AnchorDeserialize for PrivateSwapRoute {
    fn deserialize(buf: &mut &[u8]) -> std::io::Result<Self> {
        Ok(Self {
            input_token: Pubkey::deserialize(buf)?,
            output_token: Pubkey::deserialize(buf)?,
            input_amount: u64::deserialize(buf)?,
            min_output_amount: u64::deserialize(buf)?,
            jupiter_route_data: Vec::<u8>::deserialize(buf)?,
            privacy_level: PrivacyLevel::deserialize(buf)?,
        })
    }

    fn deserialize_reader<R: std::io::Read>(reader: &mut R) -> std::io::Result<Self> {
        Ok(Self {
            input_token: Pubkey::deserialize_reader(reader)?,
            output_token: Pubkey::deserialize_reader(reader)?,
            input_amount: u64::deserialize_reader(reader)?,
            min_output_amount: u64::deserialize_reader(reader)?,
            jupiter_route_data: Vec::<u8>::deserialize_reader(reader)?,
            privacy_level: PrivacyLevel::deserialize_reader(reader)?,
        })
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum PrivacyLevel {
    /// Full privacy - complete shielding
    Full,
    /// Partial privacy - amount visible
    Partial,
    /// Minimal privacy - only counterparty hidden
    Minimal,
}

impl anchor_lang::AnchorSerialize for PrivacyLevel {
    fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()> {
        (*self as u8).serialize(writer)
    }
}

impl anchor_lang::AnchorDeserialize for PrivacyLevel {
    fn deserialize(buf: &mut &[u8]) -> std::io::Result<Self> {
        let discriminant = u8::deserialize(buf)?;
        match discriminant {
            0 => Ok(PrivacyLevel::Full),
            1 => Ok(PrivacyLevel::Partial),
            2 => Ok(PrivacyLevel::Minimal),
            _ => Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "invalid enum discriminant")),
        }
    }

    fn deserialize_reader<R: std::io::Read>(reader: &mut R) -> std::io::Result<Self> {
        let discriminant = u8::deserialize_reader(reader)?;
        match discriminant {
            0 => Ok(PrivacyLevel::Full),
            1 => Ok(PrivacyLevel::Partial),
            2 => Ok(PrivacyLevel::Minimal),
            _ => Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "invalid enum discriminant")),
        }
    }
}

impl anchor_lang::idl::IdlBuild for PrivacyLevel {
    fn insert_types(_types: &mut std::collections::BTreeMap<String, Vec<anchor_lang::idl::IdlTypeDefinition>>) {
        _types.insert("privacy_level".to_string(), vec![
            anchor_lang::idl::IdlTypeDefinition {
                name: "privacy_level".to_string(),
                variants: Some(vec![
                    anchor_lang::idl::IdlVariant {
                        name: "full".to_string(),
                        fields: None,
                    },
                    anchor_lang::idl::IdlVariant {
                        name: "partial".to_string(),
                        fields: None,
                    },
                    anchor_lang::idl::IdlVariant {
                        name: "minimal".to_string(),
                        fields: None,
                    },
                ]),
                ty: anchor_lang::idl::IdlDefinedType::Enum {
                    generics: std::vec::Vec::new(),
                },
            },
        ]);
    }
}
