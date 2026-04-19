/**
 * Log Ingestion Service Implementation
 * 
 * Responsibilities:
 * - Accept logs via API
 * - Validate schema
 * - Assign server timestamp (ingested_at)
 * - Persist to append-only database
 */

import { z } from 'zod';
import type { IngestRequest, IngestResponse, LogIngestionService } from './index';
import { storageService } from '../storage/implementation';
import { ValidationError } from '../types';

// Zod schema for validation
const IngestRequestSchema = z.object({
  source_service: z.string().min(1).max(255),
  log_level: z.enum(['ERROR', 'WARN', 'INFO', 'DEBUG']),
  message: z.string().min(1),
  metadata: z.record(z.any()).optional(),
  timestamp: z.string().datetime().optional(), // ISO 8601
});

export class LogIngestionServiceImpl implements LogIngestionService {
  /**
   * Ingest a log entry
   * Server assigns ingested_at timestamp automatically
   */
  async ingest(request: IngestRequest): Promise<IngestResponse> {
    // Validate request
    if (!this.validate(request)) {
      throw new ValidationError('Invalid log request', request);
    }

    // Insert into database
    // Server will automatically assign:
    // - ingested_at (trusted server time)
    // - sequence_number (global monotonic)
    const log = await storageService.insertLog(this.toLogInsert(request));

    return this.toIngestResponse(log);
  }

  /**
   * Ingest a batch atomically.
   *
   * The request order is preserved for insert operations; PostgreSQL assigns
   * the authoritative sequence_number for each row.
   */
  async ingestBatch(requests: IngestRequest[]): Promise<IngestResponse[]> {
    if (requests.length === 0) {
      throw new ValidationError('Batch must contain at least one log', { logs: requests });
    }

    for (const [index, request] of requests.entries()) {
      if (!this.validate(request)) {
        throw new ValidationError(`Invalid log request at index ${index}`, request);
      }
    }

    const logs = await storageService.insertLogs(
      requests.map((request) => this.toLogInsert(request)),
    );

    return logs.map(this.toIngestResponse);
  }

  /**
   * Validate log request using Zod
   */
  validate(request: IngestRequest): boolean {
    try {
      IngestRequestSchema.parse(request);
      return true;
    } catch (error) {
      return false;
    }
  }

  private toLogInsert(request: IngestRequest) {
    const eventTimestamp = request.timestamp
      ? new Date(request.timestamp)
      : new Date();

    return {
      source_service: request.source_service,
      log_level: request.log_level,
      message: request.message,
      metadata: request.metadata,
      timestamp: eventTimestamp,
      ingested_at: new Date(), // Overridden by DB default
    };
  }

  private toIngestResponse(log: Awaited<ReturnType<typeof storageService.insertLog>>): IngestResponse {
    return {
      log_id: log.log_id,
      sequence_number: log.sequence_number,
      acknowledged_at: log.ingested_at.toISOString(),
      batch_status: log.batch_id ? 'batched' : 'pending',
    };
  }
}

// Export singleton instance
export const logIngestionService = new LogIngestionServiceImpl();
