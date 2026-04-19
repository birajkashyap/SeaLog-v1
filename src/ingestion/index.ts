/**
 * Ingestion Module
 * 
 * Responsibilities:
 * - Accept logs via REST API
 * - Validate log schema and format
 * - Assign deterministic ordering (server timestamp + sequence number)
 * - Persist to append-only database
 * - Reject any update/delete operations
 */

export interface LogEntry {
  log_id: string;
  source_service: string;
  log_level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  message: string;
  metadata?: Record<string, any>;
  
  // Dual timestamp model
  timestamp: Date;      // Event time (client-supplied, untrusted)
  ingested_at: Date;    // Ingestion time (server-assigned, trusted)
  
  // Global monotonic sequence (total order across all sources)
  sequence_number: number;
  
  batch_id?: string;
}

export interface IngestRequest {
  source_service: string;
  log_level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  message: string;
  metadata?: Record<string, any>;
  timestamp?: string; // ISO 8601, optional
}

export interface IngestResponse {
  log_id: string;
  sequence_number: number;
  acknowledged_at: string;
  batch_status: 'pending' | 'batched';
}

export interface LogIngestionService {
  /**
   * Ingest a single log entry
   * INVARIANT: Must assign ingested_at on server side
   * INVARIANT: Must use global sequence_number
   */
  ingest(request: IngestRequest): Promise<IngestResponse>;

  /**
   * Ingest multiple log entries atomically.
   */
  ingestBatch(requests: IngestRequest[]): Promise<IngestResponse[]>;
  
  /**
   * Validate log schema
   */
  validate(request: IngestRequest): boolean;
}
