/**
 * Storage Service Implementation
 * 
 * Responsibilities:
 * - Manage Prisma client connection
 * - Enforce append-only constraints
 * - Provide read access to logs and batches
 * - NEVER allow direct UPDATE or DELETE (triggers will prevent)
 */

import { PrismaClient } from '@prisma/client';
import type { LogEntry } from '../ingestion';
import type { Batch } from '../batching';
import type { StorageService, DatabaseConfig } from './index';

export class PrismaStorageService implements StorageService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  }

  /**
   * Insert a log entry (append-only)
   * Server assigns ingested_at automatically
   */
  async insertLog(
    log: Omit<LogEntry, 'log_id' | 'sequence_number'>
  ): Promise<LogEntry> {
    const created = await this.prisma.log.create({
      data: {
        sourceService: log.source_service,
        logLevel: log.log_level,
        message: log.message,
        metadata: log.metadata || {},
        timestamp: log.timestamp,
        // ingested_at is set by database default (NOW())
        // sequence_number is auto-incremented by database
      },
    });

    return this.mapToLogEntry(created);
  }

  /**
   * Get log by ID
   */
  async getLogById(logId: string): Promise<LogEntry | null> {
    const log = await this.prisma.log.findUnique({
      where: { id: logId },
    });

    return log ? this.mapToLogEntry(log) : null;
  }

  /**
   * Get unbatched logs ordered by sequence number
   * CRITICAL: Must return in sequence order for deterministic tree building
   */
  async getUnbatchedLogs(limit?: number): Promise<LogEntry[]> {
    const logs = await this.prisma.log.findMany({
      where: { batchId: null },
      orderBy: { sequenceNumber: 'asc' }, // INVARIANT: deterministic ordering
      take: limit,
    });

    return logs.map(this.mapToLogEntry);
  }

  /**
   * Update logs with batch_id
   * This is the ONLY allowed "update" - assigning logs to a batch
   */
  async assignBatch(logIds: string[], batchId: string): Promise<void> {
    await this.prisma.log.updateMany({
      where: { id: { in: logIds } },
      data: { batchId },
    });
  }

  /**
   * Insert batch metadata
   */
  async insertBatch(batch: Omit<Batch, 'batch_id'>): Promise<Batch> {
    const created = await this.prisma.batch.create({
      data: {
        startTime: batch.start_time,
        endTime: batch.end_time,
        logCount: batch.log_count,
        merkleRoot: batch.merkle_root,
        batchHash: batch.batch_hash,
        status: batch.status,
      },
    });

    return this.mapToBatch(created);
  }

  /**
   * Update batch with anchor info
   */
  async updateBatchAnchor(
    batchId: string,
    txHash: string,
    blockNumber: number,
    timestamp: Date
  ): Promise<void> {
    await this.prisma.batch.update({
      where: { id: batchId },
      data: {
        anchorTxHash: txHash,
        anchorBlockNumber: BigInt(blockNumber),
        anchorTimestamp: timestamp,
        anchoredAt: new Date(),
        status: 'anchored',
      },
    });
  }

  /**
   * Get batch by ID
   */
  async getBatchById(batchId: string): Promise<Batch | null> {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
    });

    return batch ? this.mapToBatch(batch) : null;
  }

  /**
   * Get logs by batch ID
   */
  async getLogsByBatchId(batchId: string): Promise<LogEntry[]> {
    const logs = await this.prisma.log.findMany({
      where: { batchId },
      orderBy: { sequenceNumber: 'asc' },
    });

    return logs.map(this.mapToLogEntry);
  }

  /**
   * Store Merkle proof (cache only - not trusted for verification)
   */
  async storeMerkleProof(proof: {
    logId: string;
    batchId: string;
    leafHash: string;
    siblings: string[];
    path: ('left' | 'right')[];
    treeDepth: number;
  }): Promise<void> {
    await this.prisma.merkleProof.create({
      data: {
        logId: proof.logId,
        batchId: proof.batchId,
        leafHash: proof.leafHash,
        siblings: proof.siblings,
        path: proof.path,
        treeDepth: proof.treeDepth,
      },
    });
  }

  /**
   * Get Merkle proof by log ID (from cache)
   * WARNING: Never trust this for security - proofs must be derived
   */
  async getMerkleProof(logId: string) {
    return await this.prisma.merkleProof.findUnique({
      where: { logId },
    });
  }

  /**
   * Close database connection
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }

  /**
   * Map Prisma Log to LogEntry
   */
  private mapToLogEntry(log: any): LogEntry {
    return {
      log_id: log.id,
      source_service: log.sourceService,
      log_level: log.logLevel as 'ERROR' | 'WARN' | 'INFO' | 'DEBUG',
      message: log.message,
      metadata: log.metadata,
      timestamp: log.timestamp,
      ingested_at: log.ingestedAt,
      sequence_number: Number(log.sequenceNumber),
      batch_id: log.batchId,
    };
  }

  /**
   * Map Prisma Batch to Batch
   */
  private mapToBatch(batch: any): Batch {
    return {
      batch_id: batch.id,
      start_time: batch.startTime,
      end_time: batch.endTime,
      log_count: batch.logCount,
      merkle_root: batch.merkleRoot,
      batch_hash: batch.batchHash,
      anchor_tx_hash: batch.anchorTxHash,
      anchor_block_number: batch.anchorBlockNumber ? Number(batch.anchorBlockNumber) : undefined,
      anchor_timestamp: batch.anchorTimestamp,
      created_at: batch.createdAt,
      anchored_at: batch.anchoredAt,
      status: batch.status as 'pending' | 'building' | 'anchoring' | 'anchored' | 'failed',
    };
  }
}

// Export singleton instance
export const storageService = new PrismaStorageService();
