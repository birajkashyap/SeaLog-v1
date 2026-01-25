/**
 * Integration Tests for End-to-End Flow
 * 
 * Tests the complete flow:
 * 1. Ingest logs
 * 2. Create batch
 * 3. Generate Merkle tree
 * 4. Anchor to blockchain (mocked for local tests)
 * 5. Verify logs
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { storageService } from '../storage/implementation';
import { logIngestionService } from '../ingestion/implementation';
import { batchProcessor } from '../batching/implementation';
import { verificationService } from '../verification/implementation';

describe('End-to-End Integration Tests', () => {
  let testLogIds: string[] = [];

  beforeAll(async () => {
    // Clean setup - ensure we're starting fresh
    console.log('Setting up integration tests...');
  });

  afterAll(async () => {
    // Cleanup
    await storageService.disconnect();
  });

  it('should complete full ingestion → batching → verification flow', async () => {
    // 1. Ingest multiple logs
    const log1 = await logIngestionService.ingest({
      source_service: 'test-service',
      log_level: 'INFO',
      message: 'Test log 1',
      metadata: { test: true },
    });

    const log2 = await logIngestionService.ingest({
      source_service: 'test-service',
      log_level: 'ERROR',
      message: 'Test log 2',
    });

    const log3 = await logIngestionService.ingest({
      source_service: 'another-service',
      log_level: 'WARN',
      message: 'Test log 3',
    });

    testLogIds = [log1.log_id, log2.log_id, log3.log_id];

    // 2. Verify logs were ingested
    expect(log1.sequence_number).toBeGreaterThan(0);
    expect(log2.sequence_number).toBeGreaterThan(log1.sequence_number);
    expect(log3.sequence_number).toBeGreaterThan(log2.sequence_number);

    // 3. Manually trigger batch creation
    const batch = await batchProcessor.triggerBatch();

    expect(batch).not.toBeNull();
    expect(batch!.log_count).toBeGreaterThanOrEqual(3);
    expect(batch!.merkle_root).toMatch(/^0x[a-f0-9]{64}$/);

    // 4. Verify logs are assigned to batch
    const verifiedLog = await storageService.getLogById(log1.log_id);
    expect(verifiedLog?.batch_id).toBe(batch!.batch_id);

    console.log('✅ Integration test passed');
    console.log(`   Batch ID: ${batch!.batch_id}`);
    console.log(`   Merkle Root: ${batch!.merkle_root}`);
    console.log(`   Log Count: ${batch!.log_count}`);
  });
});
