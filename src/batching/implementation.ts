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
import { buildTree, computeBatchHash } from '../merkle/implementation';
import { generateProof } from '../merkle/implementation';

export class BatchProcessorImpl implements BatchProcessor {
  private intervalId?: NodeJS.Timeout;
  private config?: BatchConfig;

  /**
   * Create batch from logs
   * INVARIANT: Logs must be ordered by sequence_number
   */
  async createBatch(logs: LogEntry[]): Promise<Batch> {
    if (logs.length === 0) {
      throw new Error('Cannot create batch from empty logs');
    }

    // Build Merkle tree
    const tree = buildTree(logs);
    
    const startTime = logs[0].timestamp;
    const endTime = logs[logs.length - 1].timestamp;
    const logCount = logs.length;
    const merkleRoot = tree.root;

    // Create batch in database
    const batch = await storageService.insertBatch({
      start_time: startTime,
      end_time: endTime,
      log_count: logCount,
      merkle_root: merkleRoot,
      batch_hash: undefined, // Optional for MVP
      created_at: new Date(),
      status: 'building',
    });

    // Assign logs to this batch
    const logIds = logs.map((l) => l.log_id);
    await storageService.assignBatch(logIds, batch.batch_id);

    // Generate and store Merkle proofs (cache only)
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

    return batch;
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
    const shouldBatch =
      this.config?.strategy === 'time' ||
      (this.config?.strategy === 'hybrid' && logs.length >= (this.config?.size_threshold || 0)) ||
      (this.config?.strategy === 'size' && logs.length >= (this.config?.size_threshold || 0));

    if (!shouldBatch) {
      return null;
    }

    return await this.createBatch(logs);
  }
}

// Export singleton instance
export const batchProcessor = new BatchProcessorImpl();
