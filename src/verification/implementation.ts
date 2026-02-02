/**
 * Verification Service Implementation
 * 
 * CRITICAL: Never trust proofs from database
 * All verification derives proofs from log data
 */

import type {
  VerificationService,
  VerificationResult,
  BatchVerificationResult,
  AuditEvidence,
} from './index';
import type { LogEntry } from '../ingestion';
import type { AnchorStatus } from '../anchoring';
import { storageService } from '../storage/implementation';
import { computeLeafHash, buildTree, generateProof, verifyProof } from '../merkle/implementation';
import { createAnchorService } from '../anchoring/implementation';
import { IntegrityError } from '../types';

export class VerificationServiceImpl implements VerificationService {
  private anchorService = createAnchorService();

  /**
   * Verify a log entry
   * INVARIANT: Must derive proof from log data, not trust DB proofs
   */
  async verifyLog(
    logId: string,
    expectedContent?: Partial<LogEntry>
  ): Promise<VerificationResult> {
    // 1. Retrieve log entry
    const log = await storageService.getLogById(logId);
    if (!log) {
      throw new IntegrityError(`Log ${logId} not found`);
    }

    // 2. Verify content matches if provided
    const contentMatches = expectedContent
      ? this.checkContentMatch(log, expectedContent)
      : true;

    if (!log.batch_id) {
      throw new IntegrityError(`Log ${logId} not yet batched`);
    }

    // 3. Retrieve batch
    const batch = await storageService.getBatchById(log.batch_id);
    if (!batch) {
      throw new IntegrityError(`Batch ${log.batch_id} not found`);
    }

    // 4. Get all logs in batch and rebuild tree
    const batchLogs = await storageService.getLogsByBatchId(log.batch_id);
    const tree = buildTree(batchLogs);

    // 5. Derive Merkle proof (NOT from database)
    const proof = generateProof(log, tree);

    // 6. Verify Merkle proof against batch root
    const leafHash = computeLeafHash(log);
    const merkleProofValid = verifyProof(leafHash, proof, batch.merkle_root);

    // 7. Check if batch is anchored (demo mode: may not be anchored)
    const isAnchored = !!batch.anchor_tx_hash;
    let rootOnChain = false;
    let confirmations = 0;
    
    if (isAnchored) {
      // 8. Verify root is anchored on blockchain (only if anchored)
      const anchorStatus = await this.anchorService.getAnchorStatus(batch.merkle_root);
      rootOnChain = anchorStatus.is_anchored;
      
      // 9. Get blockchain confirmation count
      confirmations = await this.getConfirmations(batch.anchor_tx_hash!);
    }

    // Build response based on whether batch is anchored
    const response: VerificationResult = {
      valid: isAnchored ? (merkleProofValid && rootOnChain && contentMatches) : merkleProofValid && contentMatches,
      log_entry: log,
      batch: {
        batch_id: batch.batch_id,
        merkle_root: batch.merkle_root,
        log_count: batch.log_count,
      },
      merkle_proof: proof,
      verification_steps: {
        merkle_proof_valid: merkleProofValid,
        root_on_chain: isAnchored ? rootOnChain : false,
        content_matches: contentMatches,
      },
    };

    // Only include blockchain_anchor if batch is anchored
    if (isAnchored && batch.anchor_tx_hash) {
      response.blockchain_anchor = {
        tx_hash: batch.anchor_tx_hash,
        block_number: batch.anchor_block_number || 0,
        timestamp: batch.anchor_timestamp?.toISOString() || '',
        confirmations,
        explorer_url: this.anchorService.getExplorerUrl(batch.anchor_tx_hash),
      };
    }

    return response;
  }

  /**
   * Verify a batch
   */
  async verifyBatch(batchId: string): Promise<BatchVerificationResult> {
    const batch = await storageService.getBatchById(batchId);
    if (!batch) {
      throw new IntegrityError(`Batch ${batchId} not found`);
    }

    // Check if batch is anchored (demo mode: may not be anchored)
    let anchorStatus: AnchorStatus;
    if (batch.anchor_tx_hash) {
      anchorStatus = await this.anchorService.getAnchorStatus(batch.merkle_root);
    } else {
      // Demo mode: batch not anchored yet
      anchorStatus = {
        is_anchored: false,
        merkle_root: batch.merkle_root,
        timestamp: undefined,
        block_number: undefined,
      };
    }

    return {
      valid: anchorStatus.is_anchored,
      batch,
      merkle_root: batch.merkle_root,
      blockchain_anchor: anchorStatus,
      verification_url: batch.anchor_tx_hash
        ? this.anchorService.getExplorerUrl(batch.anchor_tx_hash)
        : '',
    };
  }

  /**
   * Generate audit evidence bundle
   */
  async generateAuditBundle(logId: string): Promise<AuditEvidence> {
    const verification = await this.verifyLog(logId);
    
    // Get full batch details
    const log = await storageService.getLogById(logId);
    const batch = await storageService.getBatchById(log!.batch_id!);

    const auditBundle: AuditEvidence = {
      version: '1.0',
      generated_at: new Date().toISOString(),
      verification_type: 'log',
      log_entry: verification.log_entry,
      batch: {
        batch_id: verification.batch.batch_id,
        start_time: batch!.start_time,
        end_time: batch!.end_time,
        log_count: verification.batch.log_count,
        merkle_root: verification.batch.merkle_root,
        created_at: batch!.created_at,
        status: batch!.status,
      },
      merkle_proof: verification.merkle_proof,
      verification_result: {
        merkle_proof_valid: verification.verification_steps.merkle_proof_valid,
        root_anchored: verification.verification_steps.root_on_chain,
        content_integrity: verification.verification_steps.content_matches,
        overall_status: verification.valid ? 'VALID' : 'INVALID',
      },
      reproducibility_guide: {
        instructions: this.getReproductionInstructions(),
        smart_contract_abi: process.env.CONTRACT_ADDRESS || 'Deploy contract first',
        verification_script: this.getVerificationScript(),
      },
    };

    // Only include blockchain_anchor if batch is anchored
    if (verification.blockchain_anchor) {
      auditBundle.blockchain_anchor = {
        network: process.env.BLOCKCHAIN_NETWORK || 'sepolia',
        contract_address: process.env.CONTRACT_ADDRESS || '',
        tx_hash: verification.blockchain_anchor.tx_hash,
        block_number: verification.blockchain_anchor.block_number,
        timestamp: verification.blockchain_anchor.timestamp,
        explorer_url: verification.blockchain_anchor.explorer_url,
      };
    }

    return auditBundle;
  }

  /**
   * Verify offline using audit bundle
   */
  async verifyOffline(bundle: AuditEvidence): Promise<boolean> {
    if (!bundle.log_entry || !bundle.merkle_proof) {
      return false;
    }

    // Recompute leaf hash
    const leafHash = computeLeafHash(bundle.log_entry);

    // Verify Merkle proof
    const proofValid = verifyProof(
      leafHash,
      bundle.merkle_proof,
      bundle.batch.merkle_root
    );

    return proofValid && bundle.verification_result.root_anchored;
  }

  /**
   * Check if log content matches expected
   */
  private checkContentMatch(log: LogEntry, expected: Partial<LogEntry>): boolean {
    if (expected.message && log.message !== expected.message) return false;
    if (expected.log_level && log.log_level !== expected.log_level) return false;
    if (expected.source_service && log.source_service !== expected.source_service) return false;
    return true;
  }

  /**
   * Get number of confirmations for a transaction
   */
  private async getConfirmations(txHash: string): Promise<number> {
    // Simplified - would need provider access in full implementation
    return 6; // Assume 6 confirmations for now
  }

  /**
   * Get reproduction instructions for auditors
   */
  private getReproductionInstructions(): string {
    return `
# Independent Verification Instructions

1. Verify Merkle Proof Locally:
   - Recompute leaf hash from log data
   - Hash up the tree using siblings and path
   - Compare result with batch Merkle root

2. Verify On-Chain Anchor:
   - Connect to Ethereum node
   - Query smart contract at ${process.env.CONTRACT_ADDRESS}
   - Call verifyAnchor(merkleRoot)
   - Confirm root exists with correct timestamp

3. Tools:
   - ethers.js for blockchain queries
   - keccak256 for hashing (from @noble/hashes)
   - No SeaLog API required
`;
  }

  /**
   * Get standalone verification script
   */
  private getVerificationScript(): string {
    return `
// Standalone verification script
const { keccak256 } = require('@noble/hashes/sha3');
const { ethers } = require('ethers');

// Recompute leaf hash and verify proof
// (Full script would be provided with bundle)
`;
  }
}

// Export singleton
export const verificationService = new VerificationServiceImpl();
