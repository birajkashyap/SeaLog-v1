/**
 * Storage Module
 * 
 * Responsibilities:
 * - Manage database connection and queries
 * - Enforce append-only constraints
 * - Provide read access to logs and batches
 * - Never allow UPDATE or DELETE operations
 */

import { LogEntry } from '../ingestion';
import { Batch } from '../batching';

export interface StorageService {
  /**
   * Insert a log entry (append-only)
   * INVARIANT: No UPDATE or DELETE allowed
   */
  insertLog(log: Omit<LogEntry, 'log_id' | 'sequence_number'>): Promise<LogEntry>;
  
  /**
   * Get log by ID
   */
  getLogById(logId: string): Promise<LogEntry | null>;
  
  /**
   * Get unbatched logs ordered by sequence number
   * INVARIANT: Must return logs in sequence_number order for deterministic tree building
   */
  getUnbatchedLogs(limit?: number): Promise<LogEntry[]>;
  
  /**
   * Update logs with batch_id
   * This is the ONLY allowed "update" - assigning a batch
   */
  assignBatch(logIds: string[], batchId: string): Promise<void>;
  
  /**
   * Insert batch metadata
   */
  insertBatch(batch: Omit<Batch, 'batch_id'>): Promise<Batch>;
  
  /**
   * Update batch with anchor info
   * This is the ONLY allowed batch update - adding blockchain anchor
   */
  updateBatchAnchor(
    batchId: string,
    txHash: string,
    blockNumber: number,
    timestamp: Date
  ): Promise<void>;
  
  /**
   * Get batch by ID
   */
  getBatchById(batchId: string): Promise<Batch | null>;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  
  // SSL configuration for production
  ssl?: boolean;
}
