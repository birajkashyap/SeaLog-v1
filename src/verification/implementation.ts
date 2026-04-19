/**
 * Verification Service Implementation
 *
 * CRITICAL: Never trust proofs from database
 * All verification derives proofs from log data
 *
 * ENHANCEMENTS (research features):
 * 1. Dual-timestamp delta check: flags suspicious backdating (event_time >> ingested_at)
 * 2. Zero-trust proof source: proof_source is always "derived" — never "cached"
 * 3. Single-step chain validation: verifies batch_chain_hash consistency in verifyLog()
 * 4. Full cross-batch chain walk: verifyBatchChain() detects gaps and broken links
 */

import type {
  VerificationService,
  VerificationResult,
  BatchVerificationResult,
  AuditEvidence,
  TimestampCheckResult,
  ChainVerificationResult,
  NoveltyMetrics,
} from './index';
import type { LogEntry } from '../ingestion';
import type { AnchorStatus } from '../anchoring';
import { storageService } from '../storage/implementation';
import {
  computeLeafHash,
  buildTree,
  generateProof,
  verifyProof,
  computeChainHash,
  GENESIS_CHAIN_HASH,
} from '../merkle/implementation';
import { createAnchorService } from '../anchoring/implementation';
import { IntegrityError } from '../types';

/**
 * Threshold in milliseconds for flagging suspicious timestamps.
 * If event_time > ingested_at + TIMESTAMP_SKEW_THRESHOLD_MS, the log is suspicious.
 * A client can claim an event happened in the future relative to when the server received it.
 * Default: 60 seconds. Override via TIMESTAMP_SKEW_THRESHOLD_MS environment variable.
 */
const TIMESTAMP_SKEW_THRESHOLD_MS = parseInt(
  process.env.TIMESTAMP_SKEW_THRESHOLD_MS ?? '60000',
  10,
);

export class VerificationServiceImpl implements VerificationService {
  private anchorService = createAnchorService();

  /**
   * Verify a log entry.
   *
   * INVARIANT: Must derive proof from log data, not trust DB proofs.
   * INVARIANT: proof_source is always "derived".
   *
   * Verification steps:
   *   1. Retrieve log and batch
   *   2. Rebuild Merkle tree from ALL batch logs (re-derives proof)
   *   3. Verify Merkle proof against batch root
   *   4. Dual-timestamp check: detect future-dated event timestamps
   *   5. Single-step chain check: recompute batch_chain_hash and compare
   *   6. Optionally verify root on blockchain if batch is anchored
   */
  async verifyLog(
    logId: string,
    expectedContent?: Partial<LogEntry>,
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
    //    ZERO-TRUST: We do NOT read from the merkle_proofs cache table.
    const batchLogs = await storageService.getLogsByBatchId(log.batch_id);
    const tree = buildTree(batchLogs);

    // 5. Derive Merkle proof (NOT from database)
    const proof = generateProof(log, tree);

    // 6. Verify Merkle proof against batch root
    const leafHash = computeLeafHash(log);
    const merkleProofValid = verifyProof(leafHash, proof, batch.merkle_root);

    // 7. Dual-timestamp check
    //    delta_ms = ingested_at - event_time
    //    If delta_ms < -THRESHOLD → event claims to be in the future → suspicious
    const timestampCheck = this.checkTimestamps(log);

    // 8. Single-step chain validation
    //    Recompute this batch's chain hash and compare to stored value.
    //    Legacy batches (batch_chain_hash === "legacy") are excluded.
    const chainValid = this.verifySingleBatchChainLink(batch);

    // 9. Check if batch is anchored
    const isAnchored = !!batch.anchor_tx_hash;
    let rootOnChain = false;
    let confirmations = 0;

    if (isAnchored) {
      const anchorStatus = await this.anchorService.getAnchorStatus(batch.merkle_root);
      rootOnChain = anchorStatus.is_anchored;
      confirmations = await this.getConfirmations(batch.anchor_tx_hash!);
    }

    const response: VerificationResult = {
      valid: isAnchored
        ? merkleProofValid && rootOnChain && contentMatches && chainValid
        : merkleProofValid && contentMatches && chainValid,
      log_entry: log,
      batch: {
        batch_id: batch.batch_id,
        batch_number: batch.batch_number,
        merkle_root: batch.merkle_root,
        log_count: batch.log_count,
        batch_chain_hash: batch.batch_chain_hash,
        prev_batch_chain_hash: batch.prev_batch_chain_hash,
      },
      merkle_proof: proof,
      verification_steps: {
        merkle_proof_valid: merkleProofValid,
        // ZERO-TRUST: This field is ALWAYS "derived". Cached proofs from the
        // merkle_proofs table are never used during verification.
        proof_source: 'derived',
        root_on_chain: isAnchored ? rootOnChain : false,
        content_matches: contentMatches,
        timestamp_check: timestampCheck,
        chain_valid: chainValid,
        // ─── Novelty Metrics ─────────────────────────────────────────────
        novelty: this.computeNoveltyMetrics(merkleProofValid, contentMatches, timestampCheck),
      },
    };

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
   * Verify a batch using zero-trust reconstruction.
   *
   * This re-fetches every log in the batch, rebuilds the Merkle tree, and
   * compares the recomputed root to the stored batch commitment. The blockchain
   * anchor remains part of the result, but it is no longer the only check.
   */
  async verifyBatch(batchId: string): Promise<BatchVerificationResult> {
    const batch = await storageService.getBatchById(batchId);
    if (!batch) {
      throw new IntegrityError(`Batch ${batchId} not found`);
    }

    const batchLogs = await storageService.getLogsByBatchId(batchId);
    const tree = batchLogs.length > 0 ? buildTree(batchLogs) : null;
    const recomputedRoot = tree?.root ?? '';
    const rootMatch = recomputedRoot === batch.merkle_root;
    const logCountMatches = batchLogs.length === batch.log_count;
    const batchChainValid = this.verifySingleBatchChainLink(batch);
    const consistencyCheck = {
      root_matches: rootMatch,
      log_count_matches: logCountMatches,
      batch_chain_valid: batchChainValid,
    };

    let anchorStatus: AnchorStatus;
    if (batch.anchor_tx_hash) {
      anchorStatus = await this.anchorService.getAnchorStatus(batch.merkle_root);
    } else {
      anchorStatus = {
        is_anchored: false,
        merkle_root: batch.merkle_root,
        timestamp: undefined,
        block_number: undefined,
      };
    }

    const integrityScore = this.computeBatchIntegrityScore(
      rootMatch,
      logCountMatches,
      batchChainValid,
    );
    const anchorValid = batch.anchor_tx_hash ? anchorStatus.is_anchored : true;

    return {
      valid: rootMatch && logCountMatches && batchChainValid && anchorValid,
      batch,
      merkle_root: batch.merkle_root,
      recomputed_root: recomputedRoot,
      root_match: rootMatch,
      integrity_score: integrityScore,
      processing_time_ms: batch.processing_time_ms,
      number_of_logs: batch.log_count,
      tree_depth: tree?.depth ?? 0,
      log_count_verified: batchLogs.length,
      consistency_check: consistencyCheck,
      blockchain_anchor: anchorStatus,
      verification_url: batch.anchor_tx_hash
        ? this.anchorService.getExplorerUrl(batch.anchor_tx_hash)
        : '',
    };
  }

  /**
   * Walk the cross-batch chain from fromBatchNumber to toBatchNumber.
   *
   * Algorithm:
   *   1. Query all batches in the [from, to] range ordered by batch_number
   *   2. Detect gaps: if successive batch_numbers are not contiguous, record missing numbers
   *   3. Walk chain: for each batch, recompute chain hash from (prev_chain_hash, merkle_root)
   *      and compare to stored batch_chain_hash
   *   4. Skip legacy batches (batch_chain_hash === "legacy") — pre-migration batches have no chain
   *
   * @param fromBatchNumber - start of range (inclusive). Defaults to 1.
   * @param toBatchNumber   - end of range (inclusive). Defaults to max batch_number in DB.
   */
  async verifyBatchChain(
    fromBatchNumber?: number,
    toBatchNumber?: number,
  ): Promise<ChainVerificationResult> {
    // Resolve range defaults
    const range = await storageService.getBatchNumberRange();
    if (!range) {
      return {
        valid: true,
        batches_checked: 0,
        chain_intact: true,
        missing_batch_numbers: [],
        genesis_hash: GENESIS_CHAIN_HASH,
        from_batch_number: 0,
        to_batch_number: 0,
      };
    }

    const from = fromBatchNumber ?? range.min;
    const to = toBatchNumber ?? range.max;

    const batches = await storageService.getBatchChain(from, to);

    const missingBatchNumbers: number[] = [];
    let brokenLinkAt: number | undefined;
    let chainIntact = true;
    let prevChainHash: string = GENESIS_CHAIN_HASH;
    let expectedNext = from;

    for (const batch of batches) {
      // Gap detection: find missing batch_numbers between expectedNext and batch.batch_number
      for (let n = expectedNext; n < batch.batch_number; n++) {
        missingBatchNumbers.push(n);
      }
      expectedNext = batch.batch_number + 1;

      // Skip legacy batches — they predate chain tracking
      if (batch.batch_chain_hash === 'legacy') {
        // For legacy, we reset the chain anchor to this batch's chain hash as a resumption point
        // so that the first non-legacy batch after a legacy run is checked correctly.
        prevChainHash = batch.batch_chain_hash;
        continue;
      }

      // Determine what the prev hash should be for this batch's chain link computation
      const expectedPrevHash = batch.prev_batch_chain_hash ?? GENESIS_CHAIN_HASH;

      // If prevChainHash is "legacy" (we just came out of a legacy run), use the
      // batch's own prev_batch_chain_hash as the anchor (we cannot verify legacy links)
      const effectivePrevHash =
        prevChainHash === 'legacy' ? expectedPrevHash : prevChainHash;

      // Recompute chain hash
      const recomputed = computeChainHash(effectivePrevHash, batch.merkle_root);

      if (recomputed !== batch.batch_chain_hash) {
        chainIntact = false;
        brokenLinkAt = batch.batch_number;
        break;
      }

      prevChainHash = batch.batch_chain_hash;
    }

    // Check for gaps at the end of the range
    for (let n = expectedNext; n <= to; n++) {
      missingBatchNumbers.push(n);
    }

    const hasMissingBatches = missingBatchNumbers.length > 0;

    return {
      valid: chainIntact && !hasMissingBatches,
      batches_checked: batches.length,
      chain_intact: chainIntact,
      missing_batch_numbers: missingBatchNumbers,
      broken_link_at: brokenLinkAt,
      genesis_hash: GENESIS_CHAIN_HASH,
      from_batch_number: from,
      to_batch_number: to,
    };
  }

  /**
   * Generate audit evidence bundle
   */
  async generateAuditBundle(logId: string): Promise<AuditEvidence> {
    const verification = await this.verifyLog(logId);

    const log = await storageService.getLogById(logId);
    const batch = await storageService.getBatchById(log!.batch_id!);

    const auditBundle: AuditEvidence = {
      version: '1.1',
      generated_at: new Date().toISOString(),
      verification_type: 'log',
      log_entry: verification.log_entry,
      batch: {
        batch_id: verification.batch.batch_id,
        batch_number: verification.batch.batch_number,
        start_time: batch!.start_time,
        end_time: batch!.end_time,
        log_count: verification.batch.log_count,
        merkle_root: verification.batch.merkle_root,
        processing_time_ms: batch!.processing_time_ms,
        tree_depth: batch!.tree_depth,
        batch_hash: batch!.batch_hash,
        prev_batch_chain_hash: verification.batch.prev_batch_chain_hash,
        batch_chain_hash: verification.batch.batch_chain_hash,
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
   * Verify offline using audit bundle — no database access.
   * Pure function for independent verification.
   */
  async verifyOffline(bundle: AuditEvidence): Promise<boolean> {
    if (!bundle.log_entry || !bundle.merkle_proof) {
      return false;
    }

    // Recompute leaf hash from raw log data
    const leafHash = computeLeafHash(bundle.log_entry);

    // Verify Merkle proof
    const proofValid = verifyProof(
      leafHash,
      bundle.merkle_proof,
      bundle.batch.merkle_root,
    );

    return proofValid && bundle.verification_result.root_anchored;
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Dual-timestamp check.
   *
   * Computes delta_ms = ingested_at.getTime() - event_time.getTime()
   * A negative delta means event_time > ingested_at, i.e., the client claimed the
   * event happened after the server received it — a hallmark of backdating or clock skew.
   *
   * Note: Some skew is expected due to network latency (client clock vs server clock).
   * The threshold provides a configurable tolerance window.
   */
  private checkTimestamps(log: LogEntry): TimestampCheckResult {
    const delta_ms = log.ingested_at.getTime() - log.timestamp.getTime();
    const suspicious = delta_ms < -TIMESTAMP_SKEW_THRESHOLD_MS;

    return {
      event_time: log.timestamp.toISOString(),
      ingested_at: log.ingested_at.toISOString(),
      delta_ms,
      suspicious,
      threshold_ms: TIMESTAMP_SKEW_THRESHOLD_MS,
    };
  }

  /**
   * Single-step chain link verification for one batch.
   *
   * Recomputes: expected = keccak256(prev_batch_chain_hash || merkle_root)
   * and compares to stored batch_chain_hash.
   *
   * Returns true for legacy batches (cannot verify).
   * Returns true for genesis batch (prev is GENESIS_CHAIN_HASH by convention).
   */
  private verifySingleBatchChainLink(batch: {
    batch_chain_hash: string;
    prev_batch_chain_hash: string | null;
    merkle_root: string;
  }): boolean {
    // Skip legacy batches created before chain tracking
    if (batch.batch_chain_hash === 'legacy') {
      return true;
    }

    const prevHash = batch.prev_batch_chain_hash ?? GENESIS_CHAIN_HASH;
    const recomputed = computeChainHash(prevHash, batch.merkle_root);
    return recomputed === batch.batch_chain_hash;
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
  private async getConfirmations(_txHash: string): Promise<number> {
    // Simplified — full implementation would use provider.getBlockNumber()
    // and subtract the transaction's block number
    return 6;
  }

  // ─── Novelty Metrics Computation ─────────────────────────────────────────────

  /**
   * Compute the novelty metric bundle for a single log verification.
   *
   * Scoring (out of 100, purely additive deductions):
   *   Starting score: 100
   *   −40  if merkle_proof_valid is false   (mathematical integrity broken)
   *   −30  if content_integrity is false    (payload tampered)
   *   −30  if timestamp_skew is HIGH         (suspicious backdating)
   *
   * These weights are documented in Section 4.2 of the research paper.
   */
  private computeNoveltyMetrics(
    merkleProofValid: boolean,
    contentIntegrity: boolean,
    timestampCheck: TimestampCheckResult,
  ): NoveltyMetrics {
    const timestampSkew = this.classifyTimestampSkew(timestampCheck.delta_ms);

    let score = 100;
    if (!merkleProofValid)          score -= 40;
    if (!contentIntegrity)          score -= 30;
    if (timestampSkew === 'HIGH')   score -= 30;

    return {
      integrity_score: Math.max(0, score),
      timestamp_skew:  timestampSkew,
      root_match:      merkleProofValid,  // root recomputation IS the proof
      proof_source:    'DERIVED',
    };
  }

  /**
   * Batch-level integrity scoring for demo/comparison reporting.
   */
  private computeBatchIntegrityScore(
    rootMatch: boolean,
    logCountMatches: boolean,
    batchChainValid: boolean,
  ): number {
    let score = 100;
    if (!rootMatch) score -= 40;
    if (!logCountMatches) score -= 30;
    if (!batchChainValid) score -= 30;
    return Math.max(0, score);
  }

  /**
   * Classify the absolute value of delta_ms into a skew tier.
   *
   *  LOW    → |delta| ≤ 5 000 ms   (normal network round-trip / clock jitter)
   *  MEDIUM → |delta| ≤ 60 000 ms  (tolerable; flag for monitoring)
   *  HIGH   → |delta| > 60 000 ms  (suspicious; treat as backdating signal)
   */
  private classifyTimestampSkew(delta_ms: number): 'LOW' | 'MEDIUM' | 'HIGH' {
    const abs = Math.abs(delta_ms);
    if (abs <= 5_000)  return 'LOW';
    if (abs <= 60_000) return 'MEDIUM';
    return 'HIGH';
  }

  /**
   * Get reproduction instructions for auditors
   */
  private getReproductionInstructions(): string {
    return `
# Independent Verification Instructions

1. Verify Merkle Proof Locally:
   - Recompute leaf hash from log data using keccak256(@noble/hashes)
   - Hash up the tree using siblings and path
   - Compare result with batch Merkle root

2. Verify Dual-Timestamp:
   - Confirm ingested_at >= timestamp (within acceptable skew)
   - Large negative delta is a backdating signal

3. Verify Batch Chain:
   - Confirm keccak256(prev_batch_chain_hash || merkle_root) == batch_chain_hash
   - First batch uses GENESIS_CHAIN_HASH = keccak256("SeaLog::Genesis::v1")

4. Verify On-Chain Anchor:
   - Connect to Ethereum node
   - Query smart contract at ${process.env.CONTRACT_ADDRESS}
   - Call verifyAnchor(merkleRoot)
   - Confirm root exists with correct timestamp

5. Tools:
   - ethers.js for blockchain queries
   - keccak256 from @noble/hashes for hashing
   - No SeaLog API required for steps 1-3
`;
  }

  /**
   * Get standalone verification script
   */
  private getVerificationScript(): string {
    return `
// Standalone verification script
const { keccak_256 } = require('@noble/hashes/sha3');
const { bytesToHex } = require('@noble/hashes/utils');
const { ethers } = require('ethers');

function keccak256(data) {
  const bytes = new TextEncoder().encode(data);
  return '0x' + bytesToHex(keccak_256(bytes));
}

// Recompute chain hash
function verifyChainLink(prevChainHash, merkleRoot, storedChainHash) {
  return keccak256(prevChainHash + merkleRoot) === storedChainHash;
}

// Recompute leaf hash and verify proof
// (Full script would be provided with bundle)
`;
  }
}

// Export singleton
export const verificationService = new VerificationServiceImpl();
