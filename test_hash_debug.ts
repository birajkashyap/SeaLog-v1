import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex } from '@noble/hashes/utils';

function keccak256(data: string): string {
  const bytes = new TextEncoder().encode(data);
  const hash = keccak_256(bytes);
  return '0x' + bytesToHex(hash);
}

const leaf1 = '0xe1286c3391b4102742d9d79c9a789f493b2bf6f3a0787e212c2acc65b8a4367c';
const leaf2 = '0xeb93a9b6effb246ce2e6f54a66cf9faff8297eca414c2b3059e7abb4ae22f498';
const leaf3 = '0xdf059626649268ecef594cd03620221a2ba48e714c483254e049f024d3b95816';

console.log('Level 0 (leaves):');
console.log('  leaf1:', leaf1);
console.log('  leaf2:', leaf2);
console.log('  leaf3:', leaf3);
console.log();

console.log('Level 1 (internal nodes):');
const internal1 = keccak256(leaf1 + leaf2);
console.log('  internal1 = keccak256(leaf1 + leaf2)');
console.log('           =', internal1);

const internal2 = keccak256(leaf3 + leaf3);
console.log('  internal2 = keccak256(leaf3 + leaf3)  # Odd node duplicated');
console.log('           =', internal2);
console.log();

console.log('Level 2 (root):');
const root = keccak256(internal1 + internal2);
console.log('  root = keccak256(internal1 + internal2)');
console.log('      =', root);
