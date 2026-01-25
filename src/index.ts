/**
 * SeaLog Application Entry Point
 * 
 * Starts the API server and batch processor
 */

import dotenv from 'dotenv';
import { app } from './api';
import { batchProcessor } from './batching/implementation';
import type { BatchConfig } from './batching';

// Load environment variables
dotenv.config();

const PORT = process.env.API_PORT || 3000;
const HOST = process.env.API_HOST || 'localhost';

// Batch configuration from environment
const batchConfig: BatchConfig = {
  strategy: (process.env.BATCH_STRATEGY as 'time' | 'size' | 'hybrid') || 'hybrid',
  time_interval_seconds: parseInt(process.env.BATCH_TIME_INTERVAL_SECONDS || '300'),
  size_threshold: parseInt(process.env.BATCH_SIZE_THRESHOLD || '10000'),
};

async function main() {
  try {
    // Start batch processor
    console.log('Starting batch processor...');
    console.log('Batch strategy:', batchConfig.strategy);
    console.log('Time interval:', batchConfig.time_interval_seconds, 'seconds');
    console.log('Size threshold:', batchConfig.size_threshold, 'logs');
    
    batchProcessor.scheduleBatching(batchConfig);

    // Start API server
    app.listen(PORT, () => {
      console.log(`\n🚀 SeaLog API running on http://${HOST}:${PORT}`);
      console.log('\nEndpoints:');
      console.log(`  POST   /api/v1/logs/ingest       - Ingest logs`);
      console.log(`  GET    /api/v1/verify/log/:id    - Verify log`);
      console.log(`  GET    /api/v1/verify/batch/:id  - Verify batch`);
      console.log(`  GET    /api/v1/audit/:id          - Get audit bundle`);
      console.log(`  POST   /api/v1/admin/batch/trigger - Trigger batch (admin)`);
      console.log(`  GET    /api/v1/batch/:id          - Get batch status`);
      console.log(`  GET    /health                    - Health check\n`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully...');
      batchProcessor.stopBatching();
      process.exit(0);
    });

    process.on('SIGINT', () => {
      console.log('SIGINT received, shutting down gracefully...');
      batchProcessor.stopBatching();
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
