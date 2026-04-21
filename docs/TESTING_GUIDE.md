# SeaLog Testing Guide

## Test Phases

This document outlines the comprehensive testing strategy for SeaLog's tamper-evident logging system.

---

## Phase 1: Determinism & Integrity Tests (LOCAL)

### Test 1: Deterministic Merkle Root ✅ Implemented

**Objective**: Prove ordering and hashing are stable

**Test Location**: `src/__tests__/integrity.test.ts`

**What it validates**:
- Same logs → same Merkle root
- Sequence number determines tree order (not arrival time)
- Proofs differ by position but all validate

**How to run**:
```bash
npm test -- integrity.test.ts
```

**Expected outcome**:
- ✅ Identical roots for same log set
- ✅ Different arrival order doesn't affect root
- ✅ Proofs validate correctly

---

### Test 2: Append-Only Enforcement ✅ Implemented

**Objective**: Prove DB tampering is detectable

**Test Location**: `src/__tests__/integrity.test.ts`

**What it validates**:
- Triggers block UPDATE/DELETE operations
- Tampering breaks Merkle proof verification
- Content changes are cryptographically detectable

**Manual test** (requires database access):
```bash
# 1. Insert test logs and create batch
npm run dev &
curl -X POST http://localhost:3000/api/v1/logs/ingest \
  -H "Content-Type: application/json" \
  -d '{"source_service":"test","log_level":"INFO","message":"test"}'

# 2. Try to update (should fail)
docker exec -it sealog_postgres psql -U sealog_user -d sealog \
  -c "UPDATE logs SET message = 'tampered' WHERE log_id = '<log_id>';"

# Expected: ERROR: Logs are append-only. Updates and deletes are forbidden.
```

**Expected outcome**:
- ✅ Trigger blocks mutation
- ✅ If bypassed (superuser), verification fails
- ✅ Merkle proof detects content changes

---

### Test 3: Timestamp Manipulation Detection ✅ Implemented

**Objective**: Prove dual timestamps matter

**Test Location**: `src/__tests__/integrity.test.ts`

**What it validates**:
- Leaf hash includes both event + ingestion timestamps
- Backdated event times are preserved but detectable
- Changing either timestamp changes the hash

**How to run**:
```bash
npm test -- --testNamePattern="Timestamp"
```

**Expected outcome**:
- ✅ Event time preserved (can be backdated)
- ✅ Ingestion time anchors reality
- ✅ Both timestamps affect leaf hash

---

## Phase 1.5: Research Enhancements (LOCAL)

### Test 4: Cross-Batch Cryptographic Hash Chaining ✅ Implemented

**Objective**: Prove batch sequence cannot be altered

**Test Location**: `src/__tests__/chain.test.ts`

**What it validates**:
- Genesis hash is deterministic
- Hash chaining detects gaps (deleted batches)
- Hash chaining detects tampered chain links

**Expected outcome**:
- ✅ Missing batches are cryptographically detected
- ✅ Broken chain links correctly invalidate the chain

### Test 5: Zero-Trust Verification ✅ Implemented

**Objective**: Prove proofs are not blindly trusted from DB

**Test Location**: `src/__tests__/chain.test.ts`

**What it validates**:
- Verification re-derives proof from raw logs
- Tampered cached proofs don't affect verification outcome

**Expected outcome**:
- ✅ Zero-trust proof source validation succeeds

## Phase 2: Blockchain Anchoring Tests (SEPOLIA)

### Test 4: Anchor Correctness ⏸️ Requires Deployment

**Objective**: Prove blockchain is source of truth

**Prerequisites**:
1. Deploy smart contract to Sepolia
2. Fund wallet with Sepolia ETH
3. Update `.env` with contract address

**Deployment steps**:
```bash
# Get Sepolia ETH from faucet
# https://sepoliafaucet.com/

# Deploy contract
npx hardhat run contracts/scripts/deploy.js --network sepolia

# Update .env
echo "CONTRACT_ADDRESS=<deployed_address>" >> .env
```

**Test steps**:
1. Ingest logs and create batch
2. Anchor batch to Sepolia
3. Fetch Merkle root from:
   - PostgreSQL database
   - Smart contract
   - Verification service
4. Compare all three

**Verification**:
```bash
# View on Etherscan
https://sepolia.etherscan.io/address/<CONTRACT_ADDRESS>
```

**Expected outcome**:
- ✅ All three roots match byte-for-byte
- ✅ Block timestamp ≥ batch end time
- ✅ Transaction confirmed on Sepolia

---

### Test 5: Anchor Immutability ⏸️ Requires Deployment

**Objective**: Prove you can't rewrite history

**Test steps**:
1. Anchor a batch
2. Try anchoring same root again
3. Try anchoring different root with same batch ID

**Expected outcome**:
- ✅ Contract rejects duplicate roots
- ✅ Database uniqueness constraint holds
- ✅ Blockchain state is immutable

---

## Phase 3: Empirical Benchmarking & Load Testing (NEW)

### Test 6: O(log N) Space Complexity & Throughput Evaluation ✅ Implemented

**Objective**: Prove the system holds its integrity without crashing or bloating during high-volume bursts.

**Test Location**: `benchmarks/research_benchmark.ts` and `benchmarks/generate_graphs.ts`

**What it validates**:
- Ingestion throughput at scaled volumes (N=10, 50, 100, 500)
- End-to-End latency verification per batch
- Exact Merkle Proof byte sizing to validate `O(log N)` complexity.

**How to run**:
```bash
# Run benchmarks directly against Local DB
npx ts-node benchmarks/research_benchmark.ts

# Generate high-res Python/ChartJS graphs
npx ts-node benchmarks/generate_graphs.ts
```

**Expected outcome**:
- ✅ Throughput exceeds 4,000 logs/sec at N=500
- ✅ Proof Size increases extremely slowly (logarithmically), e.g., 128 bytes → 288 bytes.
- ✅ Outputs a pristine 13-column raw `.csv` and visual `.png` files for direct academic publication.

---

## Phase 3: Independent Verification (CRITICAL)

### Test 6: Offline Auditor Verification ✅ Partially Implemented

**Objective**: Zero trust in SeaLog backend

**This is the ultimate test**. If this passes, the system is provably tamper-evident.

**Test steps**:

1. **Generate audit bundle**:
```bash
curl http://localhost:3000/api/v1/audit/<log_id> > audit_bundle.json
```

2. **Shut down SeaLog completely**:
```bash
docker-compose down
npm run dev # kill server
```

3. **On fresh machine** (or new terminal):
```javascript
// standalone_verify.js
const { keccak256 } = require('@noble/hashes/sha3');
const { ethers } = require('ethers');
const bundle = require('./audit_bundle.json');

// 1. Recompute leaf hash
const log = bundle.log_entry;
const canonicalData = [
  log.log_id,
  log.timestamp,
  log.ingested_at,
  log.sequence_number.toString(),
  log.source_service,
  log.log_level,
  log.message,
  JSON.stringify(log.metadata || {})
].join('||');

const leafHash = '0x' + Buffer.from(keccak256(Buffer.from(canonicalData))).toString('hex');

// 2. Verify Merkle proof
let currentHash = leafHash;
for (let i = 0; i < bundle.merkle_proof.siblings.length; i++) {
  const sibling = bundle.merkle_proof.siblings[i];
  const position = bundle.merkle_proof.path[i];
  
  const combined = position === 'left' 
    ? currentHash + sibling.slice(2)
    : sibling + currentHash.slice(2);
  
  currentHash = '0x' + Buffer.from(keccak256(Buffer.from(combined, 'hex'))).toString('hex');
}

console.log('Computed root:', currentHash);
console.log('Batch root:', bundle.batch.merkle_root);
console.log('Match:', currentHash === bundle.batch.merkle_root);

// 3. Query Sepolia directly
const provider = new ethers.JsonRpcProvider('https://sepolia.infura.io/v3/YOUR_KEY');
const contract = new ethers.Contract(
  bundle.blockchain_anchor.contract_address,
  ['function verifyAnchor(bytes32) view returns (bool, uint256, uint256, bytes32)'],
  provider
);

const result = await contract.verifyAnchor(bundle.batch.merkle_root);
console.log('On-chain verification:', result[0]); // true/false
```

**Expected outcome**:
- ✅ Verification succeeds without SeaLog
- ✅ Backend is unnecessary for trust
- ✅ Auditor can reproduce proof independently

---

## Running All Tests

```bash
# Unit tests
npm test

# Integration tests (requires database)
npm run test:integration

# Coverage report
npm test:coverage
```

---

## Log Retention Policy

**Current MVP Policy**: Full retention in PostgreSQL

See: [docs/LOG_RETENTION_POLICY.md](./LOG_RETENTION_POLICY.md)

---

## Success Criteria

The system passes verification if:

1. ✅ Deterministic Merkle roots (Test 1)
2. ✅ Append-only enforcement works (Test 2)
3. ✅ Timestamp manipulation is detectable via Next.js Visual UI `timestamp_skew` (Test 3)
4. ✅ Cross-batch modifications are detectable via missing roots / chains (Test 4)
5. ✅ Zero-trust verification implicitly ignores tampered caches and returns `proof_source: DERIVED` (Test 5)
6. ✅ System scales under high-volume throughput loads and proves O(log N) latency (Test 6)
7. ⏸️ Blockchain anchoring is correct
8. ⏸️ Blockchain is immutable
9. ⏸️ **Independent verification works**

**Most Critical**: Tests 4, 5, and 8 prove the entire system's security model.
