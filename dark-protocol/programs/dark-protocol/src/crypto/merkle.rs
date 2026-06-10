use crate::errors::DarkProtocolError;
use crate::state::MerkleTree;
use anchor_lang::prelude::*;
use sha2::{Sha256, Digest};

const MAX_DEPTH: u8 = 32;

/// Compute merkle root from a path
pub fn compute_root(
    leaf: [u8; 32],
    path: Vec<[u8; 32]>,
    indices: Vec<bool>,
) -> Result<[u8; 32]> {
    require!(path.len() == indices.len(), DarkProtocolError::InvalidMerkleProof);
    require!(path.len() <= MAX_DEPTH as usize, DarkProtocolError::MerkleTreeDepthMismatch);
    
    let mut current = leaf;
    
    for (i, sibling) in path.iter().enumerate() {
        current = if indices[i] {
            hash_pair(sibling, &current)
        } else {
            hash_pair(&current, sibling)
        };
    }
    
    Ok(current)
}

/// Hash two merkle tree nodes
pub fn hash_pair(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(left);
    hasher.update(right);
    hasher.finalize().into()
}

/// Verify merkle proof
pub fn verify_merkle_proof(
    root: &[u8; 32],
    leaf: [u8; 32],
    path: Vec<[u8; 32]>,
    indices: Vec<bool>,
) -> Result<bool> {
    let computed_root = compute_root(leaf, path, indices)?;
    Ok(&computed_root == root)
}

/// Insert commitment into merkle tree
pub fn insert_commitment(
    tree: &mut MerkleTree,
    commitment: [u8; 32],
) -> Result<u64> {
    require!(
        tree.next_index < (1u64 << tree.depth),
        DarkProtocolError::MerkleTreeFull
    );
    
    let index = tree.next_index;
    let mut current = commitment;
    let mut current_index = index;
    
    // Update filled subtrees
    for level in 0..tree.depth {
        let is_right = current_index & 1 == 1;
        
        if level >= tree.filled_subtrees.len() as u8 {
            tree.filled_subtrees.push(MerkleTree::ZERO_VALUE);
        }
        
        if is_right {
            current = hash_pair(&tree.filled_subtrees[level as usize], &current);
        } else {
            tree.filled_subtrees[level as usize] = current;
            current = hash_pair(&current, &MerkleTree::ZERO_VALUE);
        }
        
        current_index >>= 1;
    }
    
    tree.root = current;
    tree.next_index += 1;
    
    // Store historical root
    tree.roots.push(current);
    
    // Keep only last 100 roots to save space
    if tree.roots.len() > 100 {
        tree.roots.remove(0);
    }
    
    Ok(index)
}

/// Check if root is valid (exists in historical roots)
pub fn is_known_root(tree: &MerkleTree, root: &[u8; 32]) -> bool {
    tree.roots.iter().any(|r| r == root) || &tree.root == root
}

/// Get merkle path for a given index
pub fn get_merkle_path(
    tree: &MerkleTree,
    index: u64,
) -> Result<(Vec<[u8; 32]>, Vec<bool>)> {
    require!(
        index < tree.next_index,
        DarkProtocolError::InvalidMerkleProof
    );
    
    let mut path = Vec::new();
    let mut indices = Vec::new();
    let mut current_index = index;
    
    for level in 0..tree.depth {
        let is_right = current_index & 1 == 1;
        indices.push(is_right);
        
        if level < tree.filled_subtrees.len() as u8 {
            path.push(tree.filled_subtrees[level as usize]);
        } else {
            path.push(MerkleTree::ZERO_VALUE);
        }
        
        current_index >>= 1;
    }
    
    Ok((path, indices))
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_hash_pair() {
        let left = [1u8; 32];
        let right = [2u8; 32];
        let hash = hash_pair(&left, &right);
        assert_ne!(hash, [0u8; 32]);
    }
    
    #[test]
    fn test_merkle_proof() {
        let leaf = [1u8; 32];
        let sibling = [2u8; 32];
        let path = vec![sibling];
        let indices = vec![false];
        
        let root = compute_root(leaf, path.clone(), indices.clone()).unwrap();
        assert!(verify_merkle_proof(&root, leaf, path, indices).unwrap());
    }
}
