import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/**
 * Frontend Merkle Tree utility
 * Re-implements core hashing logic to allow browser-side tree visualization.
 */

function keccak256(data: string | Uint8Array): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return '0x' + bytesToHex(keccak_256(bytes)).toLowerCase();
}

/**
 * Standard SeaLog Leaf Hash implementation: H(log_id || sequence_number || message)
 */
export function computeLeafHash(log: any): string {
  const data = `${log.log_id}${log.sequence_number}${log.message}`;
  return keccak256(data);
}

/**
 * Compute parent hash from two children
 */
function computeNodeHash(left: string, right: string): string {
  // Simple concatenation for SeaLog v1
  return keccak256(left + right);
}

/**
 * Build the full tree structure and return all levels.
 * Level 0 = Leaves
 * Last level = [Root]
 */
export function getTreeLevels(logs: any[]): string[][] {
  if (logs.length === 0) return [];

  // Level 0: Leaves
  const leaves = logs.map((log) => computeLeafHash(log));
  const levels: string[][] = [leaves];

  let currentLevel = leaves;

  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];
    
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      // If odd number, duplicate the last node to maintain binary structure
      const right = currentLevel[i + 1] ?? left;
      nextLevel.push(computeNodeHash(left, right));
    }
    
    levels.push(nextLevel);
    currentLevel = nextLevel;
  }

  return levels;
}
