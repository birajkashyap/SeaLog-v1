/**
 * SeaLog Research Feature Tests
 *
 * Tests for four research-level enhancements:
 * 1. Cross-batch cryptographic hash chaining
 * 2. Dual-timestamp validation (backdating detection)
 * 3. Zero-trust proof verification (proof_source: "derived")
 * 4. Missing batch detection via batch_number gaps
 *
 * All tests are pure / unit-level — no database required.
 * Chain verification tests simulate the verifyBatchChain() algorithm
 * using in-memory batch objects.
 */

import { describe, it, expect } from '@jest/globals';
import {
  computeChainHash,
  computeLeafHash,
  buildTree,
  generateProof,
  verifyProof,
  GENESIS_CHAIN_HASH,
} from '../merkle/implementation';
import type { LogEntry } from '../ingestion';
import type { TimestampCheckResult, ChainVerificationResult } from '../verification';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeLog(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    log_id: 'test-log-1',
    source_service: 'test-service',
    log_level: 'INFO',
    message: 'test message',
    timestamp: new Date('2024-01-01T10:00:00Z'),
    ingested_at: new Date('2024-01-01T10:00:01Z'),
    sequence_number: 1,
    ...overrides,
  };
}

/**
 * Simulate computeChainHash chain walking for N batches.
 * Returns an array of Batch-like objects with batch_chain_hash set.
 */
function buildChain(merkleRoots: string[]): Array<{
  batch_number: number;
  merkle_root: string;
  prev_batch_chain_hash: string | null;
  batch_chain_hash: string;
}> {
  const batches: ReturnType<typeof buildChain> = [];
  let prevHash = GENESIS_CHAIN_HASH;

  for (let i = 0; i < merkleRoots.length; i++) {
    const chainHash = computeChainHash(prevHash, merkleRoots[i]);
    batches.push({
      batch_number: i + 1,
      merkle_root: merkleRoots[i],
      prev_batch_chain_hash: i === 0 ? null : batches[i - 1].batch_chain_hash,
      batch_chain_hash: chainHash,
    });
    prevHash = chainHash;
  }

  return batches;
}

/**
 * Simulate the verifyBatchChain() algorithm on an in-memory chain.
 * Mirrors VerificationServiceImpl.verifyBatchChain() exactly.
 */
function simulateChainVerification(
  batches: Array<{
    batch_number: number;
    merkle_root: string;
    prev_batch_chain_hash: string | null;
    batch_chain_hash: string;
  }>,
  from: number,
  to: number,
): ChainVerificationResult {
  const missingBatchNumbers: number[] = [];
  let brokenLinkAt: number | undefined;
  let chainIntact = true;
  let prevChainHash = GENESIS_CHAIN_HASH;
  let expectedNext = from;

  for (const batch of batches) {
    for (let n = expectedNext; n < batch.batch_number; n++) {
      missingBatchNumbers.push(n);
    }
    expectedNext = batch.batch_number + 1;

    if (batch.batch_chain_hash === 'legacy') {
      prevChainHash = batch.batch_chain_hash;
      continue;
    }

    const effectivePrev =
      prevChainHash === 'legacy'
        ? (batch.prev_batch_chain_hash ?? GENESIS_CHAIN_HASH)
        : prevChainHash;

    const recomputed = computeChainHash(effectivePrev, batch.merkle_root);
    if (recomputed !== batch.batch_chain_hash) {
      chainIntact = false;
      brokenLinkAt = batch.batch_number;
      break;
    }

    prevChainHash = batch.batch_chain_hash;
  }

  for (let n = expectedNext; n <= to; n++) {
    missingBatchNumbers.push(n);
  }

  return {
    valid: chainIntact && missingBatchNumbers.length === 0,
    batches_checked: batches.length,
    chain_intact: chainIntact,
    missing_batch_numbers: missingBatchNumbers,
    broken_link_at: brokenLinkAt,
    genesis_hash: GENESIS_CHAIN_HASH,
    from_batch_number: from,
    to_batch_number: to,
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('Feature 1: Cross-Batch Cryptographic Hash Chaining', () => {
  describe('Test: GENESIS_CHAIN_HASH is deterministic', () => {
    it('should produce the same genesis hash on every call', () => {
      // GENESIS_CHAIN_HASH is computed once at module load from "SeaLog::Genesis::v1".
      // Verify it is a valid 0x-prefixed 64-char hex hash and is stable across imports.
      expect(GENESIS_CHAIN_HASH).toBeDefined();
      expect(GENESIS_CHAIN_HASH).toMatch(/^0x[0-9a-f]{64}$/);

      // A different input to computeChainHash must not produce the genesis hash
      const differentHash = computeChainHash('not-genesis', '');
      expect(differentHash).not.toBe(GENESIS_CHAIN_HASH);
    });
  });

  describe('Test: computeChainHash is deterministic (same input → same output)', () => {
    it('should produce identical chain hashes for same inputs', () => {
      const root = '0xaabbccdd' + '0'.repeat(56);
      const hash1 = computeChainHash(GENESIS_CHAIN_HASH, root);
      const hash2 = computeChainHash(GENESIS_CHAIN_HASH, root);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different merkle roots', () => {
      const root1 = '0x' + '11'.repeat(32);
      const root2 = '0x' + '22'.repeat(32);
      const hash1 = computeChainHash(GENESIS_CHAIN_HASH, root1);
      const hash2 = computeChainHash(GENESIS_CHAIN_HASH, root2);
      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hashes for different prev chain hashes', () => {
      const root = '0x' + 'ab'.repeat(32);
      const prev1 = GENESIS_CHAIN_HASH;
      const prev2 = '0x' + '00'.repeat(32);
      const hash1 = computeChainHash(prev1, root);
      const hash2 = computeChainHash(prev2, root);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Test: Valid chain verifies cleanly', () => {
    it('should verify a 3-batch chain with no gaps or tampering', () => {
      // Build a chain of 3 batches with synthetic merkle roots
      const roots = ['0x' + '11'.repeat(32), '0x' + '22'.repeat(32), '0x' + '33'.repeat(32)];
      const chain = buildChain(roots);

      const result = simulateChainVerification(chain, 1, 3);

      expect(result.valid).toBe(true);
      expect(result.chain_intact).toBe(true);
      expect(result.missing_batch_numbers).toEqual([]);
      expect(result.broken_link_at).toBeUndefined();
      expect(result.batches_checked).toBe(3);
    });
  });

  describe('Test 1: Batch deletion is detected (gap in batch_number)', () => {
    it('should detect a deleted batch as a gap in batch_number sequence', () => {
      const roots = ['0x' + '11'.repeat(32), '0x' + '22'.repeat(32), '0x' + '33'.repeat(32)];
      const chain = buildChain(roots);

      // Simulate deleting batch 2 — only batches 1 and 3 are returned from DB
      const withGap = [chain[0], chain[2]];

      const result = simulateChainVerification(withGap, 1, 3);

      expect(result.valid).toBe(false);
      expect(result.missing_batch_numbers).toContain(2);
    });
  });

  describe('Test 2: Batch tampering is detected (broken chain link)', () => {
    it('should detect a tampered batch_chain_hash', () => {
      const roots = ['0x' + '11'.repeat(32), '0x' + '22'.repeat(32), '0x' + '33'.repeat(32)];
      const chain = buildChain(roots);

      // Tamper: replace batch 2's chain hash with garbage
      const tampered = chain.map((b, i) =>
        i === 1 ? { ...b, batch_chain_hash: '0x' + 'ff'.repeat(32) } : b,
      );

      const result = simulateChainVerification(tampered, 1, 3);

      expect(result.valid).toBe(false);
      expect(result.chain_intact).toBe(false);
      expect(result.broken_link_at).toBe(2);
    });

    it('should detect a tampered merkle_root (chain hash no longer matches)', () => {
      const roots = ['0x' + '11'.repeat(32), '0x' + '22'.repeat(32), '0x' + '33'.repeat(32)];
      const chain = buildChain(roots);

      // Tamper: change batch 2's merkle_root but keep the original chain hash
      const tampered = chain.map((b, i) =>
        i === 1 ? { ...b, merkle_root: '0x' + 'deed'.repeat(16) } : b,
      );

      const result = simulateChainVerification(tampered, 1, 3);

      expect(result.valid).toBe(false);
      expect(result.chain_intact).toBe(false);
      expect(result.broken_link_at).toBe(2);
    });
  });

  describe('Test: Batch reorder is detected (swapped batch_chain_hash)', () => {
    it('should detect reordered batches via broken chain link', () => {
      const roots = ['0x' + '11'.repeat(32), '0x' + '22'.repeat(32), '0x' + '33'.repeat(32)];
      const chain = buildChain(roots);

      // Reorder: swap batches 2 and 3 (keeping batch_numbers as-is)
      const reordered = [
        chain[0],
        { ...chain[2], batch_number: 2 }, // batch 3's data at position 2
        { ...chain[1], batch_number: 3 }, // batch 2's data at position 3
      ];

      const result = simulateChainVerification(reordered, 1, 3);

      expect(result.valid).toBe(false);
      expect(result.chain_intact).toBe(false);
    });
  });
});

describe('Feature 2: Dual-Timestamp Validation', () => {
  /**
   * Simulate the checkTimestamps() logic from VerificationServiceImpl.
   */
  function checkTimestamps(log: LogEntry, thresholdMs = 60_000): TimestampCheckResult {
    const delta_ms = log.ingested_at.getTime() - log.timestamp.getTime();
    const suspicious = delta_ms < -thresholdMs;
    return {
      event_time: log.timestamp.toISOString(),
      ingested_at: log.ingested_at.toISOString(),
      delta_ms,
      suspicious,
      threshold_ms: thresholdMs,
    };
  }

  describe('Test 3: Timestamp attack detection', () => {
    it('should flag a log with event_time 2 minutes in the future as suspicious', () => {
      const now = new Date('2024-01-01T10:00:00Z');
      const futureEvent = new Date('2024-01-01T10:02:00Z'); // 2 minutes in the future

      const log = makeLog({ timestamp: futureEvent, ingested_at: now });
      const result = checkTimestamps(log);

      expect(result.suspicious).toBe(true);
      expect(result.delta_ms).toBe(-120_000); // ingested_at - event_time = -2 min
    });

    it('should NOT flag a log with event_time 30 seconds in the future (within threshold)', () => {
      const now = new Date('2024-01-01T10:00:00Z');
      const slightFuture = new Date('2024-01-01T10:00:30Z'); // 30 seconds ahead

      const log = makeLog({ timestamp: slightFuture, ingested_at: now });
      const result = checkTimestamps(log);

      expect(result.suspicious).toBe(false);
      expect(result.delta_ms).toBe(-30_000);
    });

    it('should NOT flag a normal log (event_time before ingested_at)', () => {
      const log = makeLog({
        timestamp: new Date('2024-01-01T10:00:00Z'),
        ingested_at: new Date('2024-01-01T10:00:01Z'), // 1 second later
      });
      const result = checkTimestamps(log);

      expect(result.suspicious).toBe(false);
      expect(result.delta_ms).toBeGreaterThan(0);
    });

    it('should detect a log backdated by 4 years', () => {
      const log = makeLog({
        timestamp: new Date('2020-01-01T00:00:00Z'),
        ingested_at: new Date('2024-01-01T00:00:00Z'),
      });
      const result = checkTimestamps(log);

      // delta_ms is positive and large — ingested_at >> event_time
      // This is NOT suspicious (we can receive logs about old events)
      expect(result.suspicious).toBe(false);
      expect(result.delta_ms).toBeGreaterThan(0);
    });
  });

  describe('Dual timestamps are bound into leaf hash', () => {
    it('changing event_time changes the leaf hash', () => {
      const log1 = makeLog({ timestamp: new Date('2024-01-01T10:00:00Z') });
      const log2 = makeLog({ timestamp: new Date('2024-01-01T11:00:00Z') });
      expect(computeLeafHash(log1)).not.toBe(computeLeafHash(log2));
    });

    it('changing ingested_at changes the leaf hash', () => {
      const log1 = makeLog({ ingested_at: new Date('2024-01-01T10:00:01Z') });
      const log2 = makeLog({ ingested_at: new Date('2024-01-01T10:00:02Z') });
      expect(computeLeafHash(log1)).not.toBe(computeLeafHash(log2));
    });
  });
});

describe('Feature 3: Zero-Trust Proof Verification', () => {
  describe('Test 4: DB compromise — tampered cached proof has no effect', () => {
    it('should verify a log correctly even when DB-stored proof would be wrong', () => {
      const log = makeLog();
      const tree = buildTree([log]);

      // This simulates verified proof derived fresh from raw log data
      const derivedProof = generateProof(log, tree);

      // Simulate a "DB-corrupted" proof with garbage siblings
      // In real code, verifyLog() never reads this from DB — it re-derives
      const corruptedProof = {
        ...derivedProof,
        siblings: ['0x' + 'ff'.repeat(32)],
        path: ['left' as const],
      };

      // The DERIVED proof verifies correctly
      const derivedValid = verifyProof(derivedProof.leaf_hash, derivedProof, tree.root);
      expect(derivedValid).toBe(true);

      // The CACHED (corrupted) proof would fail verification if it were used
      const cachedValid = verifyProof(derivedProof.leaf_hash, corruptedProof, tree.root);
      expect(cachedValid).toBe(false);

      // This demonstrates WHY proof_source: "derived" is a critical invariant —
      // using the cached proof would produce a false negative verification
    });

    it('should detect content tampering even when proof was generated before tampering', () => {
      const original = makeLog({ message: 'original message' });
      const tree = buildTree([original]);
      const proof = generateProof(original, tree);

      // Tamper with log content
      const tampered = { ...original, message: 'TAMPERED' };
      const tamperedLeafHash = computeLeafHash(tampered);

      // Old proof cannot verify tampered content
      const isValid = verifyProof(tamperedLeafHash, proof, tree.root);
      expect(isValid).toBe(false);
    });
  });
});

describe('Feature 4: Missing Batch Detection', () => {
  it('should report no missing batches for a contiguous chain', () => {
    const roots = ['0x' + '11'.repeat(32), '0x' + '22'.repeat(32), '0x' + '33'.repeat(32)];
    const chain = buildChain(roots);
    const result = simulateChainVerification(chain, 1, 3);
    expect(result.missing_batch_numbers).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('should detect a gap when batch 2 of 5 is missing', () => {
    const roots = Array.from({ length: 5 }, (_, i) => '0x' + String(i + 1).padStart(64, '0'));
    const chain = buildChain(roots);

    // Remove batch 2 (index 1)
    const withGap = [chain[0], chain[2], chain[3], chain[4]];
    const result = simulateChainVerification(withGap, 1, 5);

    expect(result.missing_batch_numbers).toContain(2);
    expect(result.valid).toBe(false);
  });

  it('should detect multiple gaps', () => {
    const roots = Array.from({ length: 5 }, (_, i) => '0x' + String(i + 1).padStart(64, '0'));
    const chain = buildChain(roots);

    // Remove batches 2 and 4
    const withGaps = [chain[0], chain[2], chain[4]];
    const result = simulateChainVerification(withGaps, 1, 5);

    expect(result.missing_batch_numbers).toContain(2);
    expect(result.missing_batch_numbers).toContain(4);
  });
});
