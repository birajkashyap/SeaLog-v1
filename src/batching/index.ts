/**
 * Batching Module
 * 
 * Responsibilities:
 * - Group logs into batches using configurable triggers
 * - Create batch metadata
 * - Coordinate Merkle tree generation
 * - Trigger Ethereum anchoring
 */

import { LogEntry } from '../ingestion';

export interface Batch {
  batch_id: string;

  /**
   * Monotonic integer sequence. Gaps in batch_number across the full set
   * indicate a deleted batch. Used by verifyBatchChain() for gap detection.
   */
  batch_number: number;

  start_time: Date;
  end_time: Date;
  log_count: number;
  merkle_root: string;
  processing_time_ms: number;
  tree_depth: number;

  /**
   * Full batch commitment: keccak256(batch_id || start || end || log_count || merkle_root || batch_chain_hash)
   */
  batch_hash: string;

  /**
   * Chain link from previous batch. NULL means this is the genesis batch.
   * "legacy" means this batch was created before chain tracking was activated.
   * Computed as: keccak256(prev_batch_chain_hash || merkle_root)
   */
  prev_batch_chain_hash: string | null;
  batch_chain_hash: string;

  anchor_tx_hash?: string;
  anchor_block_number?: number;
  anchor_timestamp?: Date;
  created_at: Date;
  anchored_at?: Date;
  status: 'pending' | 'building' | 'anchoring' | 'anchored' | 'failed';
}

export interface BatchConfig {
  time_interval_seconds: number;  // e.g., 300 for 5 minutes
  size_threshold: number;          // e.g., 10000
  strategy: 'time' | 'size' | 'hybrid';
}

export interface BatchProcessor {
  /**
   * Create batch from logs
   * INVARIANT: Logs must be ordered by sequence_number
   * INVARIANT: Batch contents are immutable once created
   */
  createBatch(logs: LogEntry[]): Promise<Batch>;
  
  /**
   * Start automated batching scheduler
   */
  scheduleBatching(config: BatchConfig): void;
  
  /**
   * Stop automated batching
   */
  stopBatching(): void;
  
  /**
   * Get batch status
   */
  getBatchStatus(batchId: string): Promise<Batch>;
  
  /**
   * Manually trigger batch creation (for testing/admin)
   */
  triggerBatch(): Promise<Batch | null>;
}
