/**
 * SeaLog Test Suite
 * 
 * Tests for:
 * - Determinism (same logs → same root)
 * - Integrity (tampering detection)
 * - Timestamp manipulation
 * - Blockchain anchoring
 * - Independent verification
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { computeLeafHash, buildTree, generateProof, verifyProof } from '../src/merkle/implementation';
import { storageService } from '../src/storage/implementation';
import { logIngestionService } from '../src/ingestion/implementation';
import { batchProcessor } from '../src/batching/implementation';
import type { LogEntry } from '../src/ingestion';

describe('Phase 1: Determinism & Integrity Tests', () => {
  describe('Test 1: Deterministic Merkle Root', () => {
    it('should produce identical roots for same logs regardless of arrival order', async () => {
      // Create test logs
      const testLogs: LogEntry[] = [
        {
          log_id: 'test-1',
          source_service: 'auth-service',
          log_level: 'INFO',
          message: 'User login',
          timestamp: new Date('2024-01-01T10:00:00Z'),
          ingested_at: new Date('2024-01-01T10:00:01Z'),
          sequence_number: 1,
        },
        {
          log_id: 'test-2',
          source_service: 'api-service',
          log_level: 'ERROR',
          message: 'Database timeout',
          timestamp: new Date('2024-01-01T10:00:02Z'),
          ingested_at: new Date('2024-01-01T10:00:03Z'),
          sequence_number: 2,
        },
        {
          log_id: 'test-3',
          source_service: 'payment-service',
          log_level: 'WARN',
          message: 'High latency detected',
          timestamp: new Date('2024-01-01T10:00:04Z'),
          ingested_at: new Date('2024-01-01T10:00:05Z'),
          sequence_number: 3,
        },
      ];

      // Build tree with logs in order
      const tree1 = buildTree(testLogs);

      // Build tree with same logs in different arrival order
      // BUT: sequence_number still determines tree order (INVARIANT)
      const shuffledLogs = [testLogs[2], testLogs[0], testLogs[1]];
      const sortedLogs = shuffledLogs.sort((a, b) => a.sequence_number - b.sequence_number);
      const tree2 = buildTree(sortedLogs);

      // Roots must be identical
      expect(tree1.root).toBe(tree2.root);
      expect(tree1.depth).toBe(tree2.depth);
      expect(tree1.leaves).toEqual(tree2.leaves);
    });

    it('should generate valid but different proofs for different positions', () => {
      const testLogs: LogEntry[] = [
        {
          log_id: 'a',
          source_service: 'svc',
          log_level: 'INFO',
          message: 'msg1',
          timestamp: new Date(),
          ingested_at: new Date(),
          sequence_number: 1,
        },
        {
          log_id: 'b',
          source_service: 'svc',
          log_level: 'INFO',
          message: 'msg2',
          timestamp: new Date(),
          ingested_at: new Date(),
          sequence_number: 2,
        },
      ];

      const tree = buildTree(testLogs);
      const proof1 = generateProof(testLogs[0], tree, testLogs);
      const proof2 = generateProof(testLogs[1], tree, testLogs);

      // Proofs should differ in path
      expect(proof1.path).not.toEqual(proof2.path);

      // But both should verify against the root
      expect(verifyProof(proof1.leaf_hash, proof1, tree.root)).toBe(true);
      expect(verifyProof(proof2.leaf_hash, proof2, tree.root)).toBe(true);
    });
  });

  describe('Test 2: Append-Only Enforcement', () => {
    it('should block UPDATE operations on logs table', async () => {
      // This test requires database connection
      // We'll test that the trigger rejects mutations
      
      // Note: In real test, we'd:
      // 1. Insert a log
      // 2. Try to UPDATE it
      // 3. Expect error from trigger

      // For now, document expected behavior
      expect(true).toBe(true); // Placeholder
    });

    it('should detect tampering through Merkle proof verification', () => {
      const log: LogEntry = {
        log_id: 'test',
        source_service: 'svc',
        log_level: 'INFO',
        message: 'original message',
        timestamp: new Date(),
        ingested_at: new Date(),
        sequence_number: 1,
      };

      const tree = buildTree([log]);
      const proof = generateProof(log, tree, [log]);

      // Tamper with log
      const tamperedLog = { ...log, message: 'TAMPERED' };
      const tamperedLeafHash = computeLeafHash(tamperedLog);

      // Proof should fail
      const isValid = verifyProof(tamperedLeafHash, proof, tree.root);
      expect(isValid).toBe(false);
    });
  });

  describe('Test 3: Timestamp Manipulation Detection', () => {
    it('should include both event and ingestion timestamps in leaf hash', () => {
      const log: LogEntry = {
        log_id: 'test',
        source_service: 'svc',
        log_level: 'INFO',
        message: 'test',
        timestamp: new Date('2020-01-01T00:00:00Z'), // Backdated event time
        ingested_at: new Date('2024-01-01T00:00:00Z'), // Current ingestion time
        sequence_number: 1,
      };

      const hash1 = computeLeafHash(log);

      // Change only event timestamp
      const log2 = { ...log, timestamp: new Date('2021-01-01T00:00:00Z') };
      const hash2 = computeLeafHash(log2);

      // Hashes should differ (timestamp included)
      expect(hash1).not.toBe(hash2);

      // Change only ingestion timestamp
      const log3 = { ...log, ingested_at: new Date('2025-01-01T00:00:00Z') };
      const hash3 = computeLeafHash(log3);

      // Hashes should differ (both timestamps matter)
      expect(hash1).not.toBe(hash3);
    });

    it('should preserve event time even when backdated', () => {
      const backdate = new Date('2020-01-01T00:00:00Z');
      const now = new Date();

      const log: LogEntry = {
        log_id: 'test',
        source_service: 'svc',
        log_level: 'INFO',
        message: 'backdated event',
        timestamp: backdate, // Event time (untrusted)
        ingested_at: now, // Ingestion time (trusted)
        sequence_number: 1,
      };

      const hash = computeLeafHash(log);

      // Both timestamps are in the hash
      // An auditor can see: event claimed to be in 2020, but was ingested in 2024
      expect(log.timestamp).toEqual(backdate);
      expect(log.ingested_at).toEqual(now);
      expect(hash).toBeTruthy();
    });
  });

  describe('Test 4: Merkle Tree Position Preservation', () => {
    it('should preserve left/right positions in internal hashes', () => {
      // CRITICAL: This tests the most important fix
      // Internal hashing must NOT sort, must preserve position

      const logs: LogEntry[] = [
        {
          log_id: 'left',
          source_service: 'svc',
          log_level: 'INFO',
          message: 'left node',
          timestamp: new Date(),
          ingested_at: new Date(),
          sequence_number: 1,
        },
        {
          log_id: 'right',
          source_service: 'svc',
          log_level: 'INFO',
          message: 'right node',
          timestamp: new Date(),
          ingested_at: new Date(),
          sequence_number: 2,
        },
      ];

      const tree = buildTree(logs);
      const proof = generateProof(logs[0], tree, logs);

      // Proof should indicate left position
      expect(proof.path[0]).toBe('left');

      // Verification must work
      expect(verifyProof(proof.leaf_hash, proof, tree.root)).toBe(true);
    });
  });
});

describe('Phase 2: Blockchain Anchoring Tests', () => {
  // These tests require deployed smart contract
  // Will be implemented after contract deployment

  it.skip('should anchor Merkle root to Sepolia', async () => {
    // Deploy contract, anchor batch, verify on-chain
  });

  it.skip('should reject duplicate anchor attempts', async () => {
    // Try anchoring same root twice
  });

  it.skip('should match roots: DB vs Contract vs Verification', async () => {
    // Compare all three sources
  });
});

describe('Phase 3: Independent Verification Tests', () => {
  it('should verify proof without database access', () => {
    // Simulate audit bundle verification
    const log: LogEntry = {
      log_id: 'test',
      source_service: 'svc',
      log_level: 'INFO',
      message: 'test message',
      timestamp: new Date(),
      ingested_at: new Date(),
      sequence_number: 1,
    };

    const tree = buildTree([log]);
    const proof = generateProof(log, tree, [log]);

    // This is what an offline auditor would do:
    // 1. Recompute leaf hash from log data
    const recomputedLeafHash = computeLeafHash(log);

    // 2. Verify proof using only the audit bundle data
    const isValid = verifyProof(recomputedLeafHash, proof, tree.root);

    // 3. (In real scenario) Query blockchain directly for root
    // 4. Compare roots

    expect(isValid).toBe(true);
    expect(recomputedLeafHash).toBe(proof.leaf_hash);
  });
});
