-- CreateTable
CREATE TABLE "logs" (
    "log_id" TEXT NOT NULL,
    "source_service" TEXT NOT NULL,
    "log_level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sequence_number" BIGSERIAL NOT NULL,
    "batch_id" TEXT,

    CONSTRAINT "logs_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "batches" (
    "batch_id" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "log_count" INTEGER NOT NULL,
    "merkle_root" TEXT NOT NULL,
    "batch_hash" TEXT,
    "anchor_tx_hash" TEXT,
    "anchor_block_number" BIGINT,
    "anchor_timestamp" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anchored_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "batches_pkey" PRIMARY KEY ("batch_id")
);

-- CreateTable
CREATE TABLE "merkle_proofs" (
    "proof_id" TEXT NOT NULL,
    "log_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "leaf_hash" TEXT NOT NULL,
    "proof_siblings" JSONB NOT NULL,
    "proof_path" JSONB NOT NULL,
    "tree_depth" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merkle_proofs_pkey" PRIMARY KEY ("proof_id")
);

-- CreateIndex
CREATE INDEX "logs_timestamp_idx" ON "logs"("timestamp");

-- CreateIndex
CREATE INDEX "logs_sequence_number_idx" ON "logs"("sequence_number");

-- CreateIndex
CREATE INDEX "logs_batch_id_idx" ON "logs"("batch_id");

-- CreateIndex
CREATE INDEX "logs_source_service_idx" ON "logs"("source_service");

-- CreateIndex
CREATE INDEX "batches_status_idx" ON "batches"("status");

-- CreateIndex
CREATE INDEX "batches_created_at_idx" ON "batches"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "batches_batch_id_merkle_root_key" ON "batches"("batch_id", "merkle_root");

-- CreateIndex
CREATE INDEX "merkle_proofs_log_id_idx" ON "merkle_proofs"("log_id");

-- CreateIndex
CREATE INDEX "merkle_proofs_batch_id_idx" ON "merkle_proofs"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "merkle_proofs_log_id_key" ON "merkle_proofs"("log_id");

-- AddForeignKey
ALTER TABLE "logs" ADD CONSTRAINT "logs_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("batch_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merkle_proofs" ADD CONSTRAINT "merkle_proofs_log_id_fkey" FOREIGN KEY ("log_id") REFERENCES "logs"("log_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merkle_proofs" ADD CONSTRAINT "merkle_proofs_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("batch_id") ON DELETE RESTRICT ON UPDATE CASCADE;
