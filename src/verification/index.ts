/**
 * Verification Module
 * 
 * Responsibilities:
 * - Generate inclusion proofs for log entries
 * - Verify Merkle proofs against batch root
 * - Verify batch root against blockchain
 * - Create audit evidence bundles
 * - Provide public verification API
 * 
 * CRITICAL INVARIANT: Never trust proofs from database
 * All verification must derive proofs from log data
 */

import { LogEntry } from '../ingestion';
import { Batch } from '../batching';
import { MerkleProof } from '../merkle';
import { AnchorStatus } from '../anchoring';

export interface VerificationService {
  /**
   * Verify a log entry
   * INVARIANT: Must derive proof from log data, not trust DB proofs
   */
  verifyLog(logId: string, expectedContent?: Partial<LogEntry>): Promise<VerificationResult>;

  /**
   * Verify a batch
   */
  verifyBatch(batchId: string): Promise<BatchVerificationResult>;

  /**
   * Walk the cross-batch chain from fromBatchNumber to toBatchNumber.
   * Detects missing batches (gaps in batch_number) and broken chain links.
   */
  verifyBatchChain(fromBatchNumber?: number, toBatchNumber?: number): Promise<ChainVerificationResult>;

  /**
   * Generate audit evidence bundle
   */
  generateAuditBundle(logId: string): Promise<AuditEvidence>;

  /**
   * Verify offline using audit bundle (no database access)
   * Pure function for independent verification
   */
  verifyOffline(bundle: AuditEvidence): Promise<boolean>;
}

/**
 * Result of a dual-timestamp validation check.
 * Detects potential backdating attacks where a client supplies an event
 * timestamp that is significantly in the future relative to the server's
 * ingestion clock.
 */
export interface TimestampCheckResult {
  event_time: string;       // client-supplied timestamp (ISO 8601, untrusted)
  ingested_at: string;      // server-assigned ingestion time (ISO 8601, trusted)
  delta_ms: number;         // ingested_at.getTime() - event_time.getTime()
                            // negative means event_time is in the future relative to ingested_at
  suspicious: boolean;      // true if event_time > ingested_at + threshold
  threshold_ms: number;     // configurable skew tolerance (default: 60_000 ms)
}

/**
 * Result of walking the cross-batch cryptographic chain.
 * A valid chain means every batch_chain_hash can be recomputed from
 * (prev_batch_chain_hash, merkle_root) and batch_numbers are contiguous.
 */
export interface ChainVerificationResult {
  valid: boolean;                    // true iff chain_intact && no gaps
  batches_checked: number;           // number of batches examined
  chain_intact: boolean;             // all chain hashes verified correctly
  missing_batch_numbers: number[];   // batch_numbers absent from DB (gaps)
  broken_link_at?: number;           // batch_number where recomputed hash differs from stored
  genesis_hash: string;              // GENESIS_CHAIN_HASH used for this run
  from_batch_number: number;         // actual range start examined
  to_batch_number: number;           // actual range end examined
}

export interface VerificationResult {
  valid: boolean;
  log_entry: LogEntry;
  batch: {
    batch_id: string;
    batch_number: number;
    merkle_root: string;
    log_count: number;
    batch_chain_hash: string;
    prev_batch_chain_hash: string | null;
  };
  merkle_proof: MerkleProof;
  blockchain_anchor?: {  // Optional for demo mode
    tx_hash: string;
    block_number: number;
    timestamp: string;
    confirmations: number;
    explorer_url: string;  // Etherscan link
  };
  verification_steps: {
    merkle_proof_valid: boolean;
    /**
     * Always "derived" — proofs are NEVER read from the DB cache during verification.
     * This field is intentionally hardcoded to make the zero-trust guarantee explicit
     * and machine-readable in the API response.
     */
    proof_source: 'derived' | 'cached';
    root_on_chain: boolean;
    content_matches: boolean;
    timestamp_check: TimestampCheckResult;
    /**
     * Single-step chain check: verifies that this batch's batch_chain_hash is
     * consistent with its prev_batch_chain_hash and merkle_root.
     * Does NOT verify prior batches; use verifyBatchChain() for full chain audit.
     */
    chain_valid: boolean;
  };
  audit_bundle_url?: string;
}

export interface BatchVerificationResult {
  valid: boolean;
  batch: Batch;
  merkle_root: string;
  blockchain_anchor: AnchorStatus;
  verification_url: string;  // Etherscan link
}

export interface AuditEvidence {
  version: string;               // Bundle format version
  generated_at: string;
  verification_type: 'log' | 'batch';
  
  log_entry?: LogEntry;
  batch: Batch;
  merkle_proof?: MerkleProof;
  blockchain_anchor?: {  // Optional for demo mode
    network: string;             // e.g., "sepolia", "mainnet"
    contract_address: string;
    tx_hash: string;
    block_number: number;
    timestamp: string;
    explorer_url: string;        // Etherscan link
  };
  
  verification_result: {
    merkle_proof_valid: boolean;
    root_anchored: boolean;
    content_integrity: boolean;
    overall_status: 'VALID' | 'INVALID' | 'PARTIAL';
  };
  
  reproducibility_guide: {
    instructions: string;
    smart_contract_abi: any;
    verification_script: string;  // Standalone script
  };
}
