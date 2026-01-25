# SeaLog Log Retention Policy

**Version**: 1.0  
**Effective Date**: Initial MVP Release  
**Policy Type**: Full Retention

---

## Policy Statement

For MVP v1, SeaLog implements **full retention** of all log entries in PostgreSQL with **no deletion**.

## Rationale

1. **Simplicity**: Easiest to implement and maintain for initial deployment
2. **Auditability**: All logs remain available for verification and investigation
3. **Cryptographic Integrity**: Deleting logs would break Merkle tree consistency
4. **Compliance-Friendly**: Provides complete audit trail

## Technical Implementation

### Storage
- All logs stored in PostgreSQL `logs` table
- Append-only constraints enforced via triggers
- No UPDATE, DELETE, or TRUNCATE operations allowed
- Soft deletes are explicitly forbidden

### Constraints
- Database triggers prevent mutation
- Application role lacks UPDATE/DELETE permissions
- Merkle proofs reference all logs in perpetuity

### Future Considerations

When scaling becomes necessary, consider:

1. **Cold Storage Archiving**
   - Move batches older than N days to S3/object storage
   - Retain Merkle proofs and batch metadata in PostgreSQL
   - Provide retrieval mechanism for archived logs

2. **Proof-Only Retention**
   - Keep only leaf hashes and proofs
   - Delete log content (message, metadata)
   - Maintains verifiability without full content

3. **Compliance-Driven Retention**
   - Implement retention schedules per regulatory requirements
   - SOC 2: Typically 1 year minimum
   - ISO 27001: Varies by policy
   - Financial services: 7+ years

## Current Status

✅ **MVP v1**: Full retention in PostgreSQL  
⏸️ **Archiving**: Not implemented  
⏸️ **Deletion**: Not supported (by design)

## Important Notes

- **This is a feature, not a bug**: The inability to delete logs is intentional
- **Storage growth**: Plan for approximately 1-2KB per log entry
- **Scaling estimate**: 1M logs ≈ 1-2GB database size
- **Blockchain anchoring frequency**: Does not change with retention policy

---

## Review Schedule

This policy will be reviewed when:
- Database size exceeds 100GB
- Compliance requirements mandate changes
- Performance degradation is observed
