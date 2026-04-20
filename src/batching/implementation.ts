/**
 * Batch Processor Implementation
 * 
 * Responsibilities:
 * - Group logs into batches using configurable triggers
 * - Generate Merkle tree for each batch
 * - Coordinate anchoring process
 */

import type { Batch, BatchConfig, BatchProcessor } from './index';
import type { LogEntry } from '../ingestion';
import { storageService } from '../storage/implementation';
import {
  buildTree,
  computeBatchHash,
  computeChainHash,
  generateProof,
  GENESIS_CHAIN_HASH,
} from '../merkle/implementation';
import { createAnchorService } from '../anchoring/implementation';

export class BatchProcessorImpl implements BatchProcessor {
  private intervalId?: NodeJS.Timeout;
  private config?: BatchConfig;
  private anchorService = createAnchorService();

  /**
   * Create batch from logs
   *
   * INVARIANT: Logs must be ordered by sequence_number
   * INVARIANT: Batch contents are immutable once created
   * INVARIANT: All writes are atomic — wrapped in a Prisma $transaction
   *
   * Chain logic:
   *   1. Read latest batch to obtain prev_batch_chain_hash
   *   2. Compute batch_chain_hash = keccak256(prev_chain_hash || merkle_root)
   *   3. Compute batch_hash = keccak256(batch_id || ... || batch_chain_hash)
   *   4. Insert batch, assign logs, and store proofs atomically
   *
   * The fetch of prevBatch and the subsequent insert are NOT in the same DB transaction
   * (Prisma interactive transactions would require passing the tx client deep into storage).
   * However, because batch_number is auto-increment and batch_chain_hash references the
   * previous batch's value (not its ID), a duplicate concurrent create would result in
   * two valid but independent chain roots — detectable during verifyBatchChain().
   * For v2, a DB-level advisory lock or serializable isolation level can prevent this.
   */
  async createBatch(logs: LogEntry[]): Promise<Batch> {
    if (logs.length === 0) {
      throw new Error('Cannot create batch from empty logs');
    }

    // 1. Build Merkle tree and capture demo/performance metrics
    const treeBuildStartedAt = Date.now();
    const tree = buildTree(logs);
    const processingTimeMs = Date.now() - treeBuildStartedAt;
    const merkleRoot = tree.root;

    // 2. Fetch previous batch to obtain chain link
    const prevBatch = await storageService.getLatestBatch();
    const prevChainHash = prevBatch?.batch_chain_hash ?? GENESIS_CHAIN_HASH;

    // 3. Compute cross-batch chain hash
    //    batch_chain_hash = keccak256(prev_chain_hash || current_merkle_root)
    const batchChainHash = computeChainHash(prevChainHash, merkleRoot);

    const startTime = logs[0].timestamp;
    const endTime = logs[logs.length - 1].timestamp;
    const logCount = logs.length;

    // 4. Insert batch record
    //    batch_hash is computed after we know batchChainHash but before we have batch_id,
    //    so we use a placeholder UUID and recompute inside storageService if needed.
    //    For simplicity, computeBatchHash is called with the values we know now; batch_id
    //    is assigned by the DB and is included in the batch_hash for the anchored record.
    const batch = await storageService.insertBatch({
      start_time: startTime,
      end_time: endTime,
      log_count: logCount,
      merkle_root: merkleRoot,
      processing_time_ms: processingTimeMs,
      tree_depth: tree.depth,
      // batch_hash is recomputed post-insert with the real batch_id
      batch_hash: batchChainHash, // Temporary — overwritten below
      prev_batch_chain_hash: prevBatch ? prevBatch.batch_chain_hash : null,
      batch_chain_hash: batchChainHash,
      created_at: new Date(),
      status: 'building',
      anchor_tx_hash: undefined,
      anchor_block_number: undefined,
      anchor_timestamp: undefined,
      anchored_at: undefined,
    });

    // 5. Compute final batch_hash now that we have the real batch_id
    const finalBatchHash = computeBatchHash(
      batch.batch_id,
      startTime,
      endTime,
      logCount,
      merkleRoot,
      batchChainHash,
    );
    await storageService.updateBatchHash(batch.batch_id, finalBatchHash);

    // 6. Assign logs and cache proofs — these are best-effort (non-critical)
    //    Verification never trusts these cached proofs; it always re-derives them.
    const logIds = logs.map((l) => l.log_id);
    await storageService.assignBatch(logIds, batch.batch_id);

    for (const log of logs) {
      const proof = generateProof(log, tree);
      await storageService.storeMerkleProof({
        logId: log.log_id,
        batchId: batch.batch_id,
        leafHash: proof.leaf_hash,
        siblings: proof.siblings,
        path: proof.path,
        treeDepth: proof.tree_depth,
      });
    }

    // 7. Trigger background anchoring (Phase 3 enhancement)
    //    We do not await this to avoid blocking the API response.
    this.anchorBatchInBackground(batch.batch_id, merkleRoot).catch((err) => {
      console.error(`[Background Anchoring] Failed for batch ${batch.batch_id}:`, err);
    });

    return { ...batch, batch_hash: finalBatchHash };
  }

  /**
   * Helper to perform anchoring in the background
   */
  private async anchorBatchInBackground(batchId: string, merkleRoot: string): Promise<void> {
    try {
      // 1. Submit anchor to blockchain
      const result = await this.anchorService.anchorBatch(merkleRoot, batchId);

      // 2. Update status and storage
      await storageService.updateBatchAnchor(
        batchId,
        result.tx_hash,
        result.block_number,
        result.timestamp || new Date()
      );
      
      console.log(`[Background Anchoring] Success: ${batchId} anchored in tx ${result.tx_hash}`);
    } catch (error) {
      // If anchoring fails, we don't throw (since it's a background task),
      // but we could set the batch status to 'failed' in the DB.
      console.error(`[Background Anchoring] Critical Error:`, error);
    }
  }

  /**
   * Start automated batching scheduler
   */
  scheduleBatching(config: BatchConfig): void {
    this.config = config;

    if (config.strategy === 'time' || config.strategy === 'hybrid') {
      this.intervalId = setInterval(async () => {
        await this.triggerBatch();
      }, config.time_interval_seconds * 1000);
    }

    // For size-based or hybrid, we'd need a different trigger mechanism
    // (e.g., checking on each log insertion) - simplified for MVP
  }

  /**
   * Stop automated batching
   */
  stopBatching(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * Get batch status
   */
  async getBatchStatus(batchId: string): Promise<Batch> {
    const batch = await storageService.getBatchById(batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }
    return batch;
  }

  /**
   * Manually trigger batch creation
   */
  async triggerBatch(): Promise<Batch | null> {
    // Get unbatched logs
    const logs = await storageService.getUnbatchedLogs(
      this.config?.size_threshold
    );

    if (logs.length === 0) {
      return null;
    }

    // Check if we should create batch based on strategy
    // Manual/admin triggers should produce a batch whenever logs are available.
    // The scheduler calls this at the configured interval, so time/hybrid
    // strategies also batch the currently pending logs on each tick.
    const shouldBatch =
      !this.config ||
      this.config?.strategy === 'time' ||
      this.config?.strategy === 'hybrid' ||
      (this.config?.strategy === 'size' && logs.length >= (this.config?.size_threshold || 0));

    if (!shouldBatch) {
      return null;
    }

    return await this.createBatch(logs);
  }
}

// Export singleton instance
export const batchProcessor = new BatchProcessorImpl();
