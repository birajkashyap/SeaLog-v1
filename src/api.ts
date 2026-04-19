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
import { ValidationError, IntegrityError } from './types';

const app = express();
app.use((req, res, next) => {
  const allowedOrigins = [
    process.env.CORS_ORIGIN,
    'http://127.0.0.1:5173',
    'http://localhost:5173',
  ].filter(Boolean);
  const origin = req.headers.origin;
  res.header(
    'Access-Control-Allow-Origin',
    origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
  );
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});
app.use(express.json());

/**
 * Health check endpoint
 */
app.get('/health', (_req, res) => {
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
 * Ingest multiple log entries atomically
 * POST /api/v1/logs/ingest-batch
 */
app.post('/api/v1/logs/ingest-batch', async (req, res) => {
  try {
    if (!Array.isArray(req.body?.logs)) {
      res.status(400).json({ error: 'Request body must include logs array' });
      return;
    }

    const result = await logIngestionService.ingestBatch(req.body.logs);
    res.status(201).json({ logs: result });
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
 * Verify the cross-batch cryptographic chain
 * GET /api/v1/verify/chain
 *
 * Optional query params:
 *   ?from=<batch_number>  - start of range (inclusive, default: first batch)
 *   ?to=<batch_number>    - end of range (inclusive, default: last batch)
 *
 * Returns a ChainVerificationResult indicating:
 *   - Whether all chain links are valid
 *   - Any missing batch_numbers (deleted batches)
 *   - The batch_number where the chain breaks (if any)
 */
app.get('/api/v1/verify/chain', async (req, res): Promise<void> => {
  try {
    const from = req.query.from ? parseInt(req.query.from as string, 10) : undefined;
    const to = req.query.to ? parseInt(req.query.to as string, 10) : undefined;

    if ((from !== undefined && isNaN(from)) || (to !== undefined && isNaN(to))) {
      res.status(400).json({ error: 'from and to must be valid integers' });
      return;
    }

    const result = await verificationService.verifyBatchChain(from, to);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
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
app.post('/api/v1/admin/batch/trigger', async (_req, res) => {
  try {
    const batch = await batchProcessor.triggerBatch();
    if (!batch) {
      res.json({ message: 'No unbatched logs available' });
    } else {
      res.json({
        batch_id: batch.batch_id,
        log_count: batch.log_count,
        processing_time_ms: batch.processing_time_ms,
        tree_depth: batch.tree_depth,
      });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Development-only tamper simulation
 * POST /api/v1/admin/simulate-tamper/:log_id
 */
app.post('/api/v1/admin/simulate-tamper/:log_id', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({ error: 'Tamper simulation is disabled in production' });
    return;
  }

  try {
    const { storageService } = await import('./storage/implementation');
    await storageService.simulateTamper(req.params.log_id);
    res.json({
      success: true,
      message: 'Log tampered successfully',
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
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
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

export { app };
