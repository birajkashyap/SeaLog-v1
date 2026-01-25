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
  start_time: Date;
  end_time: Date;
  log_count: number;
  merkle_root: string;
  batch_hash?: string;
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
