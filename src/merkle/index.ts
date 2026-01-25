/**
 * Merkle Tree Module
 * 
 * Responsibilities:
 * - Generate cryptographic commitment over log batches
 * - Create deterministic leaf hashes
 * - Build balanced binary Merkle tree
 * - Generate inclusion proofs for individual logs
 * - Verify Merkle proofs
 * 
 * CRITICAL INVARIANTS:
 * - Internal hash MUST preserve left/right position (NO SORTING)
 * - Leaf hash includes both timestamps (event + ingestion)
 * - Tree construction must be deterministic
 */

import { LogEntry } from '../ingestion';

export interface MerkleProof {
  proof_id?: string;
  log_id: string;
  batch_id: string;
  leaf_hash: string;
  siblings: string[];          // Sibling hashes from leaf to root
  path: ('left' | 'right')[];  // Position at each level
  tree_depth: number;
}

export interface MerkleTree {
  root: string;
  leaves: string[];
  depth: number;
}

export interface MerkleTreeGenerator {
  /**
   * Compute leaf hash from log entry
   * INVARIANT: Must be deterministic and include both timestamps
   * INVARIANT: Must use canonical serialization (sorted JSON keys)
   */
  computeLeafHash(log: LogEntry): string;
  
  /**
   * Compute internal node hash
   * CRITICAL INVARIANT: DO NOT SORT - preserve left/right position
   * Must be: keccak256(left + right)
   */
  computeInternalHash(left: string, right: string): string;
  
  /**
   * Build Merkle tree from logs
   * INVARIANT: Logs must be pre-sorted by sequence_number
   */
  buildTree(logs: LogEntry[]): MerkleTree;
  
  /**
   * Generate inclusion proof for a log
   * INVARIANT: Proof must be derivable from log + tree structure
   */
  generateProof(log: LogEntry, tree: MerkleTree): MerkleProof;
  
  /**
   * Verify a Merkle proof
   * Pure function - no database access
   */
  verifyProof(leafHash: string, proof: MerkleProof, expectedRoot: string): boolean;
  
  /**
   * Compute batch hash (for v2 - optional in MVP)
   * batch_hash = H(batch_id || start_time || end_time || log_count || merkle_root)
   */
  computeBatchHash?(
    batchId: string,
    startTime: Date,
    endTime: Date,
    logCount: number,
    merkleRoot: string
  ): string;
}

/**
 * Hash encoding standard
 * - Algorithm: Keccak-256 (Ethereum-compatible)
 * - Format: 0x-prefixed hexadecimal
 * - Case: lowercase
 * - Length: 66 characters (0x + 64 hex digits)
 */
export type Hash = string; // 0x-prefixed hex string
