# Pre-Deployment Sanity Check

## ✅ Check 1: computeInternalHash Usage

**Requirement**: Verify `computeInternalHash(left, right)` is used everywhere consistently

**Locations Found** (16 total):
- merkle/implementation.ts (8 occurrences)
  - Line 59: Function definition
  - Line 88: Pair exists case
  - Line 94: Odd node case `computeInternalHash(node, node)` ✅
  - Line 154: generateProof pair exists
  - Line 156: generateProof odd node ✅
  - Line 192: verifyProof left position
  - Line 195: verifyProof right position
  
- merkle/index.ts (1 occurrence)
  - Line 48: Type definition
  
- verification.concrete.test.ts (7 occurrences)
  - All test cases use the same function
  
**Result**: ✅ PASS - All usages consistent

---

## ✅ Check 2: Odd-Node Logic

**Requirement**: Confirm odd-node logic is ONLY `H(x || x)`

**Code Review**:
```typescript
// Line 89-94 in merkle/implementation.ts
} else {
  // ODD NODE: Duplicate and hash (Bitcoin-style)
  // parent = keccak256(node || node)
  // Note: The resulting hash will DIFFER from the node itself
  const node = currentLevel[i];
  nextLevel.push(computeInternalHash(node, node));
}
```

```typescript
// Line 156 in generateProof (same file)
nextLevel.push(computeInternalHash(currentLevel[i], currentLevel[i]));
```

**Result**: ✅ PASS - Odd nodes are duplicated and hashed, never promoted unchanged

---

## ✅ Check 3: No Test Helpers Overriding Merkle Behavior

**Files Checked**:
- `src/__tests__/integrity.test.ts`
- `src/__tests__/integration.test.ts`
- `src/__tests__/verification.concrete.test.ts`

**Imports**:
```typescript
import { computeLeafHash, buildTree, generateProof, verifyProof, computeInternalHash } 
from '../merkle/implementation';
```

**Result**: ✅ PASS - Tests import actual implementation, no mocks or overrides

---

## 🟢 PRE-DEPLOYMENT SANITY: ALL CHECKS PASSED

Ready to proceed with Sepolia deployment.

---

## Next Steps

1. ✅ Ensure Sepolia ETH in wallet
2. ✅ Configure `.env` with RPC URL and private key
3. ✅ Run deployment script
4. ✅ Record all deployment details
5. ✅ Verify contract on Etherscan
6. ✅ Anchor test batch
7. ✅ Offline verification test

