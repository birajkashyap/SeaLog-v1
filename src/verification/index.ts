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
   * Generate audit evidence bundle
   */
  generateAuditBundle(logId: string): Promise<AuditEvidence>;
  
  /**
   * Verify offline using audit bundle (no database access)
   * Pure function for independent verification
   */
  verifyOffline(bundle: AuditEvidence): Promise<boolean>;
}

export interface VerificationResult {
  valid: boolean;
  log_entry: LogEntry;
  batch: {
    batch_id: string;
    merkle_root: string;
    log_count: number;
  };
  merkle_proof: MerkleProof;
  blockchain_anchor: {
    tx_hash: string;
    block_number: number;
    timestamp: string;
    confirmations: number;
    explorer_url: string;  // Etherscan link
  };
  verification_steps: {
    merkle_proof_valid: boolean;
    root_on_chain: boolean;
    content_matches: boolean;
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
  blockchain_anchor: {
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
