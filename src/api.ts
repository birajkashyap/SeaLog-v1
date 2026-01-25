/**
 * SeaLog REST API
 * 
 * Provides HTTP endpoints for:
 * - Log ingestion
 * - Batch triggering
 * - Log verification
 * - Batch verification
 */

import express from 'express';
import { logIngestionService } from './ingestion/implementation';
import { batchProcessor } from './batching/implementation';
import { verificationService } from './verification/implementation';
import { createAnchorService } from './anchoring/implementation';
import { ValidationError, IntegrityError, BlockchainError } from './types';

const app = express();
app.use(express.json());

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'SeaLog', version: '0.1.0' });
});

/**
 * Ingest a log entry
 * POST /api/v1/logs/ingest
 */
app.post('/api/v1/logs/ingest', async (req, res) => {
  try {
    const result = await logIngestionService.ingest(req.body);
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message, details: error.details });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

/**
 * Verify a log entry
 * GET /api/v1/verify/log/:logId
 */
app.get('/api/v1/verify/log/:logId', async (req, res) => {
  try {
    const result = await verificationService.verifyLog(req.params.logId);
    res.json(result);
  } catch (error) {
    if (error instanceof IntegrityError) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

/**
 * Verify a batch
 * GET /api/v1/verify/batch/:batchId
 */
app.get('/api/v1/verify/batch/:batchId', async (req, res) => {
  try {
    const result = await verificationService.verifyBatch(req.params.batchId);
    res.json(result);
  } catch (error) {
    if (error instanceof IntegrityError) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

/**
 * Generate audit evidence bundle
 * GET /api/v1/audit/:logId
 */
app.get('/api/v1/audit/:logId', async (req, res) => {
  try {
    const bundle = await verificationService.generateAuditBundle(req.params.logId);
    res.json(bundle);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Manually trigger batch creation (admin endpoint)
 * POST /api/v1/admin/batch/trigger
 */
app.post('/api/v1/admin/batch/trigger', async (req, res) => {
  try {
    const batch = await batchProcessor.triggerBatch();
    if (!batch) {
      res.json({ message: 'No unbatched logs available' });
    } else {
      res.json({ batch_id: batch.batch_id, log_count: batch.log_count });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get batch status
 * GET /api/v1/batch/:batchId
 */
app.get('/api/v1/batch/:batchId', async (req, res) => {
  try {
    const batch = await batchProcessor.getBatchStatus(req.params.batchId);
    res.json(batch);
  } catch (error) {
    res.status(404).json({ error: 'Batch not found' });
  }
});

/**
 * Error handling middleware
 */
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

export { app };
