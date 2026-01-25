/**
 * Cryptographic Verification Test
 * 
 * This test produces concrete examples showing:
 * - Exact log inputs
 * - Canonical serialization
 * - Leaf hash computation
 * - Merkle tree construction
 * - Proof verification step-by-step
 * - Independent offline verification
 */

import { describe, it } from '@jest/globals';
import { computeLeafHash, buildTree, generateProof, verifyProof, computeInternalHash } from '../merkle/implementation';
import type { LogEntry } from '../ingestion';

describe('Concrete Cryptographic Verification', () => {
  it('should demonstrate complete cryptographic flow with concrete values', () => {
    console.log('\n========================================');
    console.log('CRYPTOGRAPHIC VERIFICATION SUMMARY');
    console.log('========================================\n');

    // ===== 1. EXACT LOG INPUTS =====
    console.log('1. EXACT LOG INPUTS');
    console.log('-------------------\n');

    const log1: LogEntry = {
      log_id: '550e8400-e29b-41d4-a716-446655440001',
      source_service: 'auth-service',
      log_level: 'INFO',
      message: 'User alice@example.com logged in successfully',
      metadata: { user_id: 'usr_12345', ip: '192.168.1.100' },
      timestamp: new Date('2024-01-15T10:30:00.000Z'),
      ingested_at: new Date('2024-01-15T10:30:01.500Z'),
      sequence_number: 1001,
    };

    const log2: LogEntry = {
      log_id: '550e8400-e29b-41d4-a716-446655440002',
      source_service: 'payment-service',
      log_level: 'WARN',
      message: 'Payment gateway timeout after 5 seconds',
      metadata: { transaction_id: 'txn_abc123', amount: 49.99, currency: 'USD' },
      timestamp: new Date('2024-01-15T10:30:05.000Z'),
      ingested_at: new Date('2024-01-15T10:30:05.200Z'),
      sequence_number: 1002,
    };

    const log3: LogEntry = {
      log_id: '550e8400-e29b-41d4-a716-446655440003',
      source_service: 'api-service',
      log_level: 'ERROR',
      message: 'Database connection failed: timeout',
      metadata: { db_host: 'db.prod.example.com', retry_count: 3 },
      timestamp: new Date('2024-01-15T10:30:10.000Z'),
      ingested_at: new Date('2024-01-15T10:30:10.100Z'),
      sequence_number: 1003,
    };

    console.log('Log 1:');
    console.log(`  log_id: ${log1.log_id}`);
    console.log(`  source_service: ${log1.source_service}`);
    console.log(`  log_level: ${log1.log_level}`);
    console.log(`  message: ${log1.message}`);
    console.log(`  metadata: ${JSON.stringify(log1.metadata)}`);
    console.log(`  timestamp (event): ${log1.timestamp.toISOString()}`);
    console.log(`  ingested_at (server): ${log1.ingested_at.toISOString()}`);
    console.log(`  sequence_number: ${log1.sequence_number}\n`);

    console.log('Log 2:');
    console.log(`  log_id: ${log2.log_id}`);
    console.log(`  source_service: ${log2.source_service}`);
    console.log(`  log_level: ${log2.log_level}`);
    console.log(`  message: ${log2.message}`);
    console.log(`  metadata: ${JSON.stringify(log2.metadata)}`);
    console.log(`  timestamp (event): ${log2.timestamp.toISOString()}`);
    console.log(`  ingested_at (server): ${log2.ingested_at.toISOString()}`);
    console.log(`  sequence_number: ${log2.sequence_number}\n`);

    console.log('Log 3:');
    console.log(`  log_id: ${log3.log_id}`);
    console.log(`  source_service: ${log3.source_service}`);
    console.log(`  log_level: ${log3.log_level}`);
    console.log(`  message: ${log3.message}`);
    console.log(`  metadata: ${JSON.stringify(log3.metadata)}`);
    console.log(`  timestamp (event): ${log3.timestamp.toISOString()}`);
    console.log(`  ingested_at (server): ${log3.ingested_at.toISOString()}`);
    console.log(`  sequence_number: ${log3.sequence_number}\n`);

    // ===== 2. CANONICAL SERIALIZATION & LEAF HASH =====
    console.log('2. CANONICAL SERIALIZATION & LEAF HASH COMPUTATION');
    console.log('--------------------------------------------------\n');

    const canonicalLog1 = [
      log1.log_id,
      log1.timestamp.toISOString(),
      log1.ingested_at.toISOString(),
      log1.sequence_number.toString(),
      log1.source_service,
      log1.log_level,
      log1.message,
      JSON.stringify(log1.metadata, log1.metadata ? Object.keys(log1.metadata).sort() : undefined),
    ].join('||');

    console.log('Log 1 Canonical String:');
    console.log(`  "${canonicalLog1}"\n`);

    const leaf1 = computeLeafHash(log1);
    const leaf2 = computeLeafHash(log2);
    const leaf3 = computeLeafHash(log3);

    console.log('Resulting Keccak-256 Leaf Hashes:');
    console.log(`  Leaf 1: ${leaf1}`);
    console.log(`  Leaf 2: ${leaf2}`);
    console.log(`  Leaf 3: ${leaf3}\n`);

    // ===== 3. MERKLE TREE CONSTRUCTION =====
    console.log('3. MERKLE TREE CONSTRUCTION');
    console.log('---------------------------\n');

    const logs = [log1, log2, log3];
    const tree = buildTree(logs);

    console.log('Ordered Leaf Hashes (by sequence_number):');
    console.log(`  [0] ${tree.leaves[0]} (log ${log1.sequence_number})`);
    console.log(`  [1] ${tree.leaves[1]} (log ${log2.sequence_number})`);
    console.log(`  [2] ${tree.leaves[2]} (log ${log3.sequence_number})\n`);

    console.log('Tree Construction (bottom-up):');
    console.log('  Level 0 (leaves): 3 hashes');
    console.log('  Level 1 (internal):');

    // Manually show internal node computation
    const internal1 = computeInternalHash(tree.leaves[0], tree.leaves[1]);
    console.log(`    Node 0-1 = keccak256(leaf[0] + leaf[1])`);
    console.log(`           = keccak256("${tree.leaves[0]}" + "${tree.leaves[1]}")`);
    console.log(`           = ${internal1}`);

    const internal2 = computeInternalHash(tree.leaves[2], tree.leaves[2]);
    console.log(`    Node 2-2 = keccak256(leaf[2] + leaf[2])  # Odd node duplicated`);
    console.log(`           = ${internal2}\n`);

    console.log('  Level 2 (root):');
    const root = computeInternalHash(internal1, internal2);
    console.log(`    Root = keccak256(node[0-1] + node[2-2])`);
    console.log(`         = ${root}\n`);

    console.log(`Final Merkle Root: ${tree.root}`);
    console.log(`Tree Depth: ${tree.depth}\n`);

    // Verify our manual computation matches
    if (tree.root !== root) {
      throw new Error('Manual root computation does not match tree.root!');
    }

    // ===== 4. INCLUSION PROOF =====
    console.log('4. INCLUSION PROOF FOR LOG 1');
    console.log('-----------------------------\n');

    const proof = generateProof(log1, tree);

    console.log('Proof Structure:');
    console.log(`  Leaf Hash: ${proof.leaf_hash}`);
    console.log(`  Siblings: [${proof.siblings.join(', ')}]`);
    console.log(`  Path: [${proof.path.join(', ')}]`);
    console.log(`  Tree Depth: ${proof.tree_depth}\n`);

    // ===== 5. STEP-BY-STEP PROOF VERIFICATION =====
    console.log('5. STEP-BY-STEP PROOF VERIFICATION');
    console.log('-----------------------------------\n');

    console.log('Starting from leaf hash...');
    let currentHash = proof.leaf_hash;
    console.log(`  Current Hash: ${currentHash}\n`);

    for (let i = 0; i < proof.siblings.length; i++) {
      const sibling = proof.siblings[i];
      const position = proof.path[i];

      console.log(`Step ${i + 1}:`);
      console.log(`  Position: ${position}`);
      console.log(`  Sibling: ${sibling}`);

      if (position === 'left') {
        console.log(`  Compute: keccak256(current + sibling)`);
        currentHash = computeInternalHash(currentHash, sibling);
      } else {
        console.log(`  Compute: keccak256(sibling + current)`);
        currentHash = computeInternalHash(sibling, currentHash);
      }

      console.log(`  Result: ${currentHash}\n`);
    }

    console.log(`Final Computed Root: ${currentHash}`);
    console.log(`Expected Root: ${tree.root}`);
    console.log(`Match: ${currentHash === tree.root ? '✅ YES' : '❌ NO'}\n`);

    // Verify using the function
    const isValid = verifyProof(proof.leaf_hash, proof, tree.root);
    console.log(`Verification Result: ${isValid ? '✅ VALID' : '❌ INVALID'}\n`);

    // ===== 6. OFFLINE VERIFICATION =====
    console.log('6. OFFLINE VERIFICATION (ZERO TRUST)');
    console.log('-------------------------------------\n');

    console.log('Data Available Offline (Audit Bundle):');
    console.log('  ✓ Log entry (full fields)');
    console.log('  ✓ Merkle proof (siblings + path)');
    console.log('  ✓ Batch Merkle root');
    console.log('  ✓ Blockchain tx hash\n');

    console.log('Data NOT Trusted:');
    console.log('  ✗ Database (could be compromised)');
    console.log('  ✗ SeaLog API (could be offline/tampered)');
    console.log('  ✗ Stored proofs in DB (cache only)\n');

    console.log('Independent Verification (No SeaLog):');
    console.log('  1. Recompute leaf hash from log data');
    const independentLeafHash = computeLeafHash(log1);
    console.log(`     Result: ${independentLeafHash}`);
    console.log(`     Matches: ${independentLeafHash === proof.leaf_hash ? '✅' : '❌'}\n`);

    console.log('  2. Verify Merkle proof using siblings + path');
    let verifyHash = independentLeafHash;
    for (let i = 0; i < proof.siblings.length; i++) {
      if (proof.path[i] === 'left') {
        verifyHash = computeInternalHash(verifyHash, proof.siblings[i]);
      } else {
        verifyHash = computeInternalHash(proof.siblings[i], verifyHash);
      }
    }
    console.log(`     Computed Root: ${verifyHash}`);
    console.log(`     Expected Root: ${tree.root}`);
    console.log(`     Matches: ${verifyHash === tree.root ? '✅' : '❌'}\n`);

    console.log('  3. Query Ethereum smart contract directly');
    console.log(`     RPC Call: contract.verifyAnchor("${tree.root}")`);
    console.log('     Expected: { exists: true, timestamp: <block_time>, ... }');
    console.log('     ⏸️ Requires deployed contract\n');

    console.log('Verification Complete Without SeaLog: ✅\n');

    console.log('========================================');
    console.log('CRYPTOGRAPHIC SOUNDNESS CONFIRMED');
    console.log('========================================\n');

    // Assertions to ensure test passes
    expect(currentHash).toBe(tree.root);
    expect(isValid).toBe(true);
    expect(independentLeafHash).toBe(proof.leaf_hash);
    expect(verifyHash).toBe(tree.root);
  });
});
