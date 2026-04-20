export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

export interface IngestRequest {
  source_service: string;
  log_level: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
}

export interface IngestResponse {
  log_id: string;
  sequence_number: number;
  acknowledged_at: string;
  batch_status: 'pending' | 'batched';
}

export interface LogEntry {
  log_id: string;
  source_service: string;
  log_level: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
  ingested_at: string;
  sequence_number: number;
  batch_id?: string;
}

export interface Batch {
  batch_id: string;
  batch_number: number;
  start_time: string;
  end_time: string;
  log_count: number;
  merkle_root: string;
  processing_time_ms: number;
  tree_depth: number;
  batch_hash: string;
  prev_batch_chain_hash: string | null;
  batch_chain_hash: string;
  anchor_tx_hash?: string | null;
  anchor_block_number?: number;
  anchor_timestamp?: string | null;
  created_at: string;
  anchored_at?: string | null;
  status: 'pending' | 'building' | 'anchoring' | 'anchored' | 'failed';
}

export interface BatchTriggerResponse {
  message?: string;
  batch_id?: string;
  log_count?: number;
  processing_time_ms?: number;
  tree_depth?: number;
}

export interface AnchorStatus {
  is_anchored: boolean;
  merkle_root: string;
  timestamp?: number;
  block_number?: number;
  batch_id?: string;
}

export interface BatchVerificationResult {
  valid: boolean;
  batch: Batch;
  merkle_root: string;
  recomputed_root: string;
  root_match: boolean;
  integrity_score: number;
  processing_time_ms: number;
  number_of_logs: number;
  tree_depth: number;
  log_count_verified: number;
  consistency_check: {
    root_matches: boolean;
    log_count_matches: boolean;
    batch_chain_valid: boolean;
  };
  blockchain_anchor: AnchorStatus;
  verification_url: string;
}

export interface MerkleProof {
  proof_id?: string;
  log_id: string;
  batch_id: string;
  leaf_hash: string;
  siblings: string[];
  path: ('left' | 'right')[];
  tree_depth: number;
}

export interface VerificationResult {
  valid: boolean;
  log_entry: LogEntry;
  batch: {
    batch_id: string;
    batch_number: number;
    merkle_root: string;
    log_count: number;
    batch_chain_hash: string;
    prev_batch_chain_hash: string | null;
  };
  merkle_proof: MerkleProof;
  blockchain_anchor?: {
    tx_hash: string;
    block_number: number;
    timestamp: string;
    confirmations: number;
    explorer_url: string;
  };
  verification_steps: {
    merkle_proof_valid: boolean;
    proof_source: 'derived' | 'cached';
    root_on_chain: boolean;
    content_matches: boolean;
    timestamp_check: {
      event_time: string;
      ingested_at: string;
      delta_ms: number;
      suspicious: boolean;
      threshold_ms: number;
    };
    chain_valid: boolean;
    novelty: {
      integrity_score: number;
      timestamp_skew: 'LOW' | 'MEDIUM' | 'HIGH';
      root_match: boolean;
      proof_source: 'DERIVED';
    };
  };
}

export interface HealthResponse {
  status: string;
  version: string;
  service: string;
}

export interface TimestampCheckResult {
  event_time: string;
  ingested_at: string;
  delta_ms: number;
  suspicious: boolean;
  threshold_ms: number;
}

export interface NoveltyMetrics {
  integrity_score: number;
  timestamp_skew: 'LOW' | 'MEDIUM' | 'HIGH';
  root_match: boolean;
  proof_source: 'DERIVED';
}

export interface ChainVerificationResult {
  valid: boolean;
  batches_checked: number;
  chain_intact: boolean;
  missing_batch_numbers: number[];
  broken_link_at?: number;
  genesis_hash: string;
  from_batch_number: number;
  to_batch_number: number;
}

export interface AuditEvidence {
  version: string;
  generated_at: string;
  verification_type: 'log' | 'batch';
  log_entry?: LogEntry;
  batch: Batch;
  merkle_proof?: MerkleProof;
  blockchain_anchor?: {
    network: string;
    contract_address: string;
    tx_hash: string;
    block_number: number;
    timestamp: string;
    explorer_url: string;
  };
  verification_result: {
    merkle_proof_valid: boolean;
    root_anchored: boolean;
    content_integrity: boolean;
    overall_status: 'VALID' | 'INVALID' | 'PARTIAL';
  };
  reproducibility_guide: {
    instructions: string;
    smart_contract_abi: any;
    verification_script: string;
  };
}
