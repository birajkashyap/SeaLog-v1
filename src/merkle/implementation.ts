/**
 * Merkle Tree Implementation
 *
 * CRITICAL INVARIANTS ENFORCED:
 * 1. Internal hash MUST preserve left/right position (NO SORTING)
 * 2. Leaf hash includes both timestamps (event + ingestion)
 * 3. All operations are deterministic and reproducible
 * 4. Uses Keccak-256 (Ethereum-compatible)
 * 5. Output: 0x-prefixed lowercase hex (66 chars)
 *
 * ODD-NODE HANDLING RULE:
 * When a level has an odd number of nodes, the last node is DUPLICATED and HASHED.
 * Strategy: parent = keccak256(node || node)
 * This is standard Bitcoin/Ethereum-style Merkle tree behavior.
 * Note: keccak256(x || x) ≠ x (the parent hash will differ from the leaf)
 *
 * CROSS-BATCH CHAINING:
 * batch_chain_hash_N = keccak256(prev_chain_hash || merkle_root_N)
 * Genesis: prev_chain_hash = keccak256("SeaLog::Genesis::v1") (hardcoded constant)
 */

import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex } from '@noble/hashes/utils';
import type { LogEntry } from '../ingestion';
import type { MerkleProof, MerkleTree, Hash } from './index';

/**
 * Convert string to Keccak-256 hash
 * Output format: 0x-prefixed lowercase hexadecimal
 */
function keccak256(data: string): Hash {
  const bytes = new TextEncoder().encode(data);
  const hash = keccak_256(bytes);
  return '0x' + bytesToHex(hash);
}

/**
 * Compute leaf hash from log entry
 * INVARIANT: Must be deterministic and include both timestamps
 */
export function computeLeafHash(log: LogEntry): Hash {
  // Canonical serialization - order matters!
  const parts = [
    log.log_id,
    log.timestamp.toISOString(),        // Event time (untrusted)
    log.ingested_at.toISOString(),      // Ingestion time (trusted)
    log.sequence_number.toString(),
    log.source_service,
    log.log_level,
    log.message,
    // Sort metadata keys for determinism
    log.metadata ? JSON.stringify(log.metadata, Object.keys(log.metadata).sort()) : '',
  ];
  
  const canonicalData = parts.join('||');
  return keccak256(canonicalData);
}

/**
 * Compute internal node hash
 * CRITICAL: DO NOT SORT - preserve left/right position
 */
export function computeInternalHash(left: Hash, right: Hash): Hash {
  // Position matters! No sorting allowed.
  return keccak256(left + right);
}

/**
 * Build Merkle tree from logs
 * INVARIANT: Logs must be pre-sorted by sequence_number
 */
export function buildTree(logs: LogEntry[]): MerkleTree {
  if (logs.length === 0) {
    throw new Error('Cannot build tree from empty log array');
  }
  
  // Compute leaf hashes
  const leaves = logs.map(computeLeafHash);
  
  // Build tree bottom-up
  let currentLevel: Hash[] = [...leaves];
  let depth = 0;
  
  while (currentLevel.length > 1) {
    const nextLevel: Hash[] = [];
    
    for (let i = 0; i < currentLevel.length; i += 2) {
      if (i + 1 < currentLevel.length) {
        // Pair exists
        const left = currentLevel[i];
        const right = currentLevel[i + 1];
        nextLevel.push(computeInternalHash(left, right));
      } else {
        // ODD NODE: Duplicate and hash (Bitcoin-style)
        // parent = keccak256(node || node)
        // Note: The resulting hash will DIFFER from the node itself
        const node = currentLevel[i];
        nextLevel.push(computeInternalHash(node, node));
      }
    }
    
    currentLevel = nextLevel;
    depth++;
  }
  
  return {
    root: currentLevel[0],
    leaves,
    depth,
  };
}

/**
 * Generate inclusion proof for a log
 * INVARIANT: Proof must be derivable from log + tree structure
 */
export function generateProof(
  log: LogEntry,
  tree: MerkleTree
): MerkleProof {
  const leafHash = computeLeafHash(log);
  
  // Find index of this log in the leaves array
  const leafIndex = tree.leaves.indexOf(leafHash);
  if (leafIndex === -1) {
    throw new Error(`Log ${log.log_id} not found in tree`);
  }
  
  // Build proof by traversing up the tree
  const siblings: Hash[] = [];
  const path: ('left' | 'right')[] = [];
  
  let currentLevel: Hash[] = [...tree.leaves];
  let currentIndex = leafIndex;
  
  while (currentLevel.length > 1) {
    const isLeftNode = currentIndex % 2 === 0;
    
    if (isLeftNode) {
      // Current node is left, sibling is right
      if (currentIndex + 1 < currentLevel.length) {
        siblings.push(currentLevel[currentIndex + 1]);
      } else {
        // No right sibling (odd node) - duplicate current
        siblings.push(currentLevel[currentIndex]);
      }
      path.push('left');
    } else {
      // Current node is right, sibling is left
      siblings.push(currentLevel[currentIndex - 1]);
      path.push('right');
    }
    
    // Move to parent level
    const nextLevel: Hash[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      if (i + 1 < currentLevel.length) {
        nextLevel.push(computeInternalHash(currentLevel[i], currentLevel[i + 1]));
      } else {
        nextLevel.push(computeInternalHash(currentLevel[i], currentLevel[i]));
      }
    }
    
    currentLevel = nextLevel;
    currentIndex = Math.floor(currentIndex / 2);
  }
  
  return {
    log_id: log.log_id,
    batch_id: log.batch_id || '',
    leaf_hash: leafHash,
    siblings,
    path,
    tree_depth: tree.depth,
  };
}

/**
 * Verify a Merkle proof
 * Pure function - no database access
 */
export function verifyProof(
  leafHash: Hash,
  proof: MerkleProof,
  expectedRoot: Hash
): boolean {
  let currentHash = leafHash;
  
  // Traverse up the tree using siblings and path
  for (let i = 0; i < proof.siblings.length; i++) {
    const sibling = proof.siblings[i];
    const position = proof.path[i];
    
    if (position === 'left') {
      // Current node is left, sibling is right
      currentHash = computeInternalHash(currentHash, sibling);
    } else {
      // Current node is right, sibling is left
      currentHash = computeInternalHash(sibling, currentHash);
    }
  }
  
  return currentHash === expectedRoot;
}

/**
 * Compute batch hash (full batch commitment)
 * Binds batch metadata + merkle root + chain hash together.
 * Format: keccak256(batchId || startTime || endTime || logCount || merkleRoot || batchChainHash)
 */
export function computeBatchHash(
  batchId: string,
  startTime: Date,
  endTime: Date,
  logCount: number,
  merkleRoot: Hash,
  batchChainHash: Hash,
): Hash {
  const canonicalData = [
    batchId,
    startTime.toISOString(),
    endTime.toISOString(),
    logCount.toString(),
    merkleRoot,
    batchChainHash,
  ].join('||');

  return keccak256(canonicalData);
}

/**
 * GENESIS_CHAIN_HASH — the cryptographic anchor for the first batch's chain.
 *
 * Computed as keccak256("SeaLog::Genesis::v1").
 * This value is deterministic and must NEVER change; it anchors the entire
 * cross-batch chain. Any batch whose prev_batch_chain_hash === GENESIS_CHAIN_HASH
 * is the first batch in the chain.
 *
 * This constant is exported so offline auditors and tests can verify it independently.
 */
export const GENESIS_CHAIN_HASH: Hash = keccak256('SeaLog::Genesis::v1');

/**
 * Compute the cross-batch chain hash.
 *
 * INVARIANT: This is a pure function — same inputs always produce the same output.
 * INVARIANT: Internal hash semantics (no sorting, position-preserving) do NOT apply here.
 *            This is a simple sequential chain link, not a Merkle internal node.
 *
 * @param prevChainHash - chain hash of the previous batch (or GENESIS_CHAIN_HASH for batch 1)
 * @param merkleRoot    - merkle root of the current batch
 * @returns             - the chain hash for the current batch
 */
export function computeChainHash(prevChainHash: Hash, merkleRoot: Hash): Hash {
  return keccak256(prevChainHash + merkleRoot);
}
