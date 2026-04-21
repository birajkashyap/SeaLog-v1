import * as fs from 'fs';
import * as path from 'path';

const API_BASE = 'http://localhost:3000/api/v1';

// Configuration
const NUM_LOGS = parseInt(process.env.BENCHMARK_LOG_COUNT || '100', 10);
const VERIFY_COUNT = parseInt(process.env.BENCHMARK_VERIFY_COUNT || '10', 10);


interface BenchmarkResult {
  metric: string;
  count: number;
  totalTimeMs: number;
  latencyPerItemMs: number;
}

const results: BenchmarkResult[] = [];

async function main() {
  console.log(`\n🌊 Starting SeaLog Benchmark Suite`);
  console.log(`Configuration: ${NUM_LOGS} logs to ingest, ${VERIFY_COUNT} verifications.\n`);
  
  // 1. Generate Fake Logs
  const logs = [];
  for (let i = 0; i < NUM_LOGS; i++) {
    logs.push({
      source_service: 'benchmark-runner',
      log_level: 'INFO',
      message: `Automated benchmark load test entry #${i}`,
      timestamp: new Date().toISOString()
    });
  }

  // --- PHASE 1: Ingestion ---
  console.log(`[Phase 1] 📥 Ingesting ${NUM_LOGS} logs through API...`);
  let start = Date.now();
  let res = await fetch(`${API_BASE}/logs/ingest-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ logs })
  });
  
  if (!res.ok) throw new Error('Ingestion failed: ' + await res.text());
  const ingestResponse = (await res.json()) as any;
  let totalTime = Date.now() - start;
  
  results.push({
    metric: 'Ingestion_Batch_API',
    count: NUM_LOGS,
    totalTimeMs: totalTime,
    latencyPerItemMs: totalTime / NUM_LOGS
  });
  console.log(`          ✅ Completed in ${totalTime}ms (${(totalTime / NUM_LOGS).toFixed(3)}ms per log)`);

  const logIds: string[] = ingestResponse.logs.map((L: any) => L.log_id);

  // --- PHASE 2: Batching ---
  console.log(`\n[Phase 2] 🌳 Triggering Merkle Tree batch creation until queue is empty...`);
  let batchTotalTime = 0;
  let batchTotalLogs = 0;
  start = Date.now();
  
  while (true) {
    res = await fetch(`${API_BASE}/admin/batch/trigger`, { method: 'POST' });
    if (!res.ok) throw new Error('Batch trigger failed: ' + await res.text());
    const batchResponse = (await res.json()) as any;
    
    if (batchResponse.message === 'No unbatched logs available') {
      break;
    }
    batchTotalLogs += batchResponse.log_count;
  }
  
  batchTotalTime = Date.now() - start;

  results.push({
    metric: 'Merkle_Batch_Creation',
    count: batchTotalLogs,
    totalTimeMs: batchTotalTime,
    latencyPerItemMs: batchTotalTime / (batchTotalLogs || 1)
  });
  console.log(`          ✅ Completed in ${batchTotalTime}ms`);
  console.log(`          📊 Batched ${batchTotalLogs} total logs.`);

  // --- PHASE 3: Verification ---
  console.log(`\n[Phase 3] 🔍 Running Zero-Trust Verification on ${VERIFY_COUNT} random logs...`);
  let totalVerifyTime = 0;
  
  for(let i=0; i < VERIFY_COUNT; i++) {
    const randomLogId = logIds[Math.floor(Math.random() * logIds.length)];
    const verifyStart = Date.now();
    const vRes = await fetch(`${API_BASE}/verify/log/${randomLogId}`);
    if (!vRes.ok) throw new Error(`Verify failed for ${randomLogId}`);
    
    // Ensure we parse JSON to measure full deserialization cycle
    await vRes.json();
    totalVerifyTime += (Date.now() - verifyStart);
  }

  results.push({
    metric: 'ZeroTrust_Log_Verification',
    count: VERIFY_COUNT,
    totalTimeMs: totalVerifyTime,
    latencyPerItemMs: totalVerifyTime / VERIFY_COUNT
  });
  console.log(`          ✅ Completed ${VERIFY_COUNT} verifications in ${totalVerifyTime}ms (Avg: ${(totalVerifyTime/VERIFY_COUNT).toFixed(3)}ms)`);

  // --- PHASE 4: Report ---
  console.log('\n[Phase 4] 💾 Saving CSV report...');
  const csvLines = ['Phase,Log_Count,Total_Time_ms,Avg_Time_Per_Item_ms'];
  for (const r of results) {
    csvLines.push(`${r.metric},${r.count},${r.totalTimeMs},${r.latencyPerItemMs.toFixed(4)}`);
  }
  
  const resultsDir = path.join(__dirname, 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  const filename = `benchmark_${Date.now()}.csv`;
  const filepath = path.join(resultsDir, filename);
  fs.writeFileSync(filepath, csvLines.join('\n'));
  
  console.log(`          ✅ File saved successfully to: benchmarks/results/${filename}\n`);
}

main().catch(err => {
  console.error("\n❌ Benchmark failed:");
  console.error(err);
});
