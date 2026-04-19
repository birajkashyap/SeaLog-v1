-- Add batch performance metrics used for verification/demo reporting.
ALTER TABLE "batches"
ADD COLUMN "processing_time_ms" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "tree_depth" INTEGER NOT NULL DEFAULT 0;
