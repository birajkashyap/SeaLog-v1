/**
 * Shared Types Module
 * 
 * Common types used across modules
 */

/**
 * Standard hash type
 * Format: 0x-prefixed lowercase hexadecimal (66 chars)
 */
export type Hash = string;

/**
 * UUID type
 */
export type UUID = string;

/**
 * ISO 8601 timestamp string
 */
export type ISO8601 = string;

/**
 * Log levels
 */
export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

/**
 * Batch status
 */
export type BatchStatus = 'pending' | 'building' | 'anchoring' | 'anchored' | 'failed';

/**
 * Network types
 */
export type Network = 'sepolia' | 'mainnet' | 'arbitrum' | 'optimism' | 'polygon';

/**
 * Error types for SeaLog system
 */
export class SeaLogError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'SeaLogError';
  }
}

export class ValidationError extends SeaLogError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class IntegrityError extends SeaLogError {
  constructor(message: string, details?: any) {
    super(message, 'INTEGRITY_ERROR', details);
    this.name = 'IntegrityError';
  }
}

export class BlockchainError extends SeaLogError {
  constructor(message: string, details?: any) {
    super(message, 'BLOCKCHAIN_ERROR', details);
    this.name = 'BlockchainError';
  }
}
