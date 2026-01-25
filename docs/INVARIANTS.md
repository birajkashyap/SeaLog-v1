# SeaLog System Invariants

> [!CAUTION]
> **DO NOT VIOLATE THESE INVARIANTS**
> 
> This document defines the immutable design principles of SeaLog. These are not negotiable. Any implementation, optimization, or feature must preserve these invariants. Violation of any of these means the system is broken.

---

## Core Invariants

### 1. Append-Only Logs (No Mutation Ever)

**Principle**: Once a log entry is written to the database, it can **never** be updated or deleted.

**Enforcement Mechanisms**:
- PostgreSQL triggers raise exceptions on UPDATE/DELETE attempts
- Application user has no UPDATE, DELETE, or TRUNCATE permissions
- Table owner is separate from application role

**What This Means**:
- No soft deletes
- No "corrections" to historical logs
- No retroactive edits under any circumstances
- TRUNCATE is forbidden

**Why It Matters**: This is the foundation of tamper-evidence. If logs can be mutated, the entire system is worthless.

---

### 2. Global Sequence Defines Total Order

**Principle**: The `sequence_number` field (PostgreSQL BIGSERIAL) provides a **global total ordering** across all log sources and services.

**What This Means**:
- Sequence numbers are globally monotonic
- Two logs cannot have the same sequence number
- Sequence order determines Merkle tree order
- Ordering is deterministic and reproducible

**Why It Matters**: Auditors must be able to reconstruct the exact same Merkle tree from the same set of logs. Without deterministic ordering, this is impossible.

---

### 3. Dual Timestamps Included in Leaf Hash

**Principle**: Every log entry has two timestamps, and **both** are included in the cryptographic commitment:

1. **`timestamp`** (event time): Client-supplied, untrusted, can be backdated
2. **`ingested_at`** (ingestion time): Server-assigned, trusted, immutable

**Leaf Hash Formula**:
```
leaf_hash = Keccak256(
  log_id ||
  timestamp ||          // Event time (untrusted)
  ingested_at ||        // Ingestion time (trusted)
  sequence_number ||
  source_service ||
  log_level ||
  message ||
  metadata_hash
)
```

**Why It Matters**: Protects against temporal manipulation attacks. An attacker cannot backdate logs without detection because `ingested_at` is always current and immutable.

---

### 4. Merkle Internal Hash = Keccak(left || right)

**Principle**: When computing internal node hashes in the Merkle tree, the left and right child hashes **must not be sorted**.

**Correct Implementation**:
```typescript
function computeInternalHash(left: string, right: string): string {
  return keccak256(left + right);  // Position preserved
}
```

**FORBIDDEN Implementation**:
```typescript
// ❌ NEVER DO THIS
const [first, second] = left < right ? [left, right] : [right, left];
return keccak256(first + second);  // Position destroyed
```

**Why It Matters**: Merkle proofs include a `path: ('left' | 'right')[]` that indicates the position of each sibling. Sorting hashes destroys this positional information, making proofs invalid and allowing different trees to produce the same root.

**This is the most critical invariant.** Violation means the entire cryptographic proof system collapses.

---

### 5. Deterministic Serialization Rules

**Principle**: All cryptographic operations must be **deterministic and reproducible** by independent third parties.

**Requirements**:
- Timestamps use ISO 8601 format with UTC timezone
- JSON metadata keys are sorted alphabetically before hashing
- Logs are sorted by `sequence_number` before tree construction
- No randomness in any hash computation
- Hash encoding is consistent (see below)

**Hash Encoding Standard**:
- Algorithm: **Keccak-256** (Ethereum-compatible)
- Format: **0x-prefixed hexadecimal string**
- Case: **lowercase**
- Length: **66 characters** (0x + 64 hex digits)

**Why It Matters**: An independent auditor must be able to take the same logs and produce the exact same Merkle root. Non-determinism breaks auditability.

---

### 6. Only Merkle Roots (or Batch Hash) Go On-Chain

**Principle**: The blockchain anchor contains **only** the cryptographic commitment (Merkle root or batch hash), never the logs themselves.

**What Goes On-Chain**:
- ✅ Merkle root (32 bytes / 66 hex chars)
- ✅ Batch ID (optional metadata)
- ✅ Timestamp (block.timestamp)

**What Does NOT Go On-Chain**:
- ❌ Log entries
- ❌ Log messages
- ❌ Merkle proofs
- ❌ Individual leaf hashes

**Why It Matters**:
- Cost: Storing logs on-chain would be prohibitively expensive
- Privacy: Logs may contain sensitive information
- Scalability: Blockchain storage doesn't scale to millions of logs

The Merkle root is a **commitment** to all logs in the batch. This is sufficient for tamper-evidence.

---

### 7. Proofs Are Derivable, Never Trusted from Database

**Principle**: Merkle proofs stored in the `merkle_proofs` table are **cached optimizations only**, not sources of truth.

**Security Requirement**:
- All verification must **recompute** the Merkle proof from log data
- Proofs must be **derived** from logs + batch metadata
- Never trust proofs retrieved from the database for security-critical operations

**Why It Matters**: If the database is compromised, an attacker could modify stored proofs to make invalid logs appear valid, or valid logs appear invalid. Derivable proofs ensure that verification depends only on:
1. The log data itself
2. The blockchain-anchored root

**Implementation Rule**: The `merkle_proofs` table is a performance optimization for fast lookups. Auditors must be able to verify logs without accessing this table.

---

## Operational Invariants

### 8. Database Permissions Separation

**Principle**: The application user must have minimal permissions.

**Permission Model**:
```sql
-- App user can only INSERT
GRANT SELECT, INSERT ON logs TO app_user;
REVOKE UPDATE, DELETE, TRUNCATE ON logs FROM app_user;

-- Migrations run as separate owner role
-- App user is NOT the table owner
```

**Why It Matters**: Defense in depth. Even if the application is compromised, an attacker cannot mutate logs through normal database access.

---

### 9. Batching Must Be Consistent

**Principle**: Once a batch is created, its contents and Merkle root are **immutable**.

**Requirements**:
- Logs included in a batch cannot change
- Batch metadata (log_count, start_time, end_time) cannot be altered
- Each batch has exactly one Merkle root (enforced by UNIQUE constraint)

**Why It Matters**: Batch integrity ensures that the anchored root corresponds to a fixed, unchanging set of logs.

---

### 10. Blockchain Anchor Is Single Source of Truth

**Principle**: If there is a conflict between the database and the blockchain, the **blockchain wins**.

**Verification Order**:
1. Retrieve log from database
2. Compute leaf hash
3. Verify Merkle proof → get root
4. Query blockchain for that root
5. If root is NOT on-chain → log is invalid or batch is unanchored
6. If root IS on-chain → log is cryptographically verified

**Why It Matters**: The blockchain is the immutable, external timestamp authority. The database is considered potentially compromised.

---

## Testing Invariants

These invariants must be tested:

- ✅ Attempt UPDATE on logs → should fail
- ✅ Attempt DELETE on logs → should fail
- ✅ Same logs + same order → same Merkle root (determinism)
- ✅ Merkle proof with correct path → verifies successfully
- ✅ Merkle proof with wrong path → verification fails
- ✅ Modified log content → leaf hash changes, proof fails
- ✅ Blockchain query returns correct root → verification succeeds
- ✅ Blockchain query returns different root → verification fails

---

## Summary: The Contract

This system is **correct** if and only if:

1. An independent auditor can verify any log entry without trusting SeaLog
2. Any alteration to historical logs is cryptographically detectable
3. Logs cannot be deleted without detection
4. Timestamps cannot be manipulated without detection
5. The blockchain anchor provides external, immutable proof of existence

**These invariants make that possible. Do not break them.**
