-- Custom migration to add append-only enforcement
-- This runs after Prisma's auto-generated migration

-- Create trigger function to prevent log mutation
CREATE OR REPLACE FUNCTION prevent_log_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Logs are append-only. Updates and deletes are forbidden.';
END;
$$ LANGUAGE plpgsql;

-- Create triggers for UPDATE and DELETE
CREATE TRIGGER logs_no_update
BEFORE UPDATE ON logs
FOR EACH ROW EXECUTE FUNCTION prevent_log_mutation();

CREATE TRIGGER logs_no_delete
BEFORE DELETE ON logs
FOR EACH ROW EXECUTE FUNCTION prevent_log_mutation();

-- Add check constraints for log_level
ALTER TABLE logs
ADD CONSTRAINT valid_log_level 
CHECK (log_level IN ('ERROR', 'WARN', 'INFO', 'DEBUG'));

-- Add check constraint for batch status
ALTER TABLE batches
ADD CONSTRAINT valid_batch_status
CHECK (status IN ('pending', 'building', 'anchoring', 'anchored', 'failed'));

-- Add comments for documentation
COMMENT ON TABLE logs IS 'Append-only log storage. Updates and deletes are forbidden by triggers.';
COMMENT ON COLUMN logs.timestamp IS 'Event time (client-supplied, untrusted, can be backdated)';
COMMENT ON COLUMN logs.ingested_at IS 'Ingestion time (server-assigned, trusted, immutable)';
COMMENT ON COLUMN logs.sequence_number IS 'Global monotonic ordering across all log sources';
COMMENT ON TABLE batches IS 'Batch metadata with Merkle root commitments';
COMMENT ON TABLE merkle_proofs IS 'CACHE ONLY - proofs must be derivable from log data for security';

-- Performance: Add partial index for unbatched logs
CREATE INDEX idx_logs_unbatched ON logs(sequence_number) WHERE batch_id IS NULL;

-- IMPORTANT: After migration, run these commands with superuser privileges:
-- REVOKE UPDATE, DELETE, TRUNCATE ON logs FROM sealog_user;
-- REVOKE UPDATE, DELETE, TRUNCATE ON batches FROM sealog_user;
-- This ensures even if the application is compromised, logs cannot be mutated
