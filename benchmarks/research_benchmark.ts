/**
 * SeaLog Research Benchmark — Screenshot Edition
 *
 * Produces clean, structured terminal output optimized for research paper screenshots.
 * Run with: npx ts-node benchmarks/research_benchmark.ts
 *
 * Pre-requisites:
 *   1. Backend running:         npm run dev  (in SeaLog root)
 *   2. BATCH_SIZE_THRESHOLD     set to 10000 in .env before running
 */

import * as fs from 'fs';
import * as path from 'path';
import { performance } from 'perf_hooks';

// ─── Configuration ────────────────────────────────────────────────────────────

const API_BASE        = 'http://localhost:3000/api/v1';
const N_VALUES        = [10, 50, 100, 500];
const K_VERIFY        = 5;     // Fixed: verify 5 logs per run
const TAMPER_COUNT    = 1;     // Fixed: always tamper exactly 1 log
const SKEW_COUNT      = 10;    // Fixed: always test 10 backdated logs
const SKEW_OFFSET_MS  = 2 * 60 * 60 * 1000;   // Fixed: exactly 2 hours in the past
const STEP_DELAY_MS   = 400;   // Delay between phases for screenshot clarity

// ─── Types ───────────────────────────────────────────────────────────────────

interface LogPayload {
  source_service: string;
  log_level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  message: string;
  metadata: Record<string, unknown>;
  timestamp?: string;
}

interface IngestResponse {
  log_id: string;
  sequence_number: number;
  acknowledged_at: string;
  batch_status: string;
}

interface VerifyResponse {
  valid: boolean;
  verification_steps: {
    merkle_proof_valid: boolean;
    novelty: {
      integrity_score: number;
      timestamp_skew: 'LOW' | 'MEDIUM' | 'HIGH';
      root_match: boolean;
      proof_source: string;
    };
  };
}

interface SummaryRow {
  n: number;
  ingestMs: number;
  batchMs: number;
  verifyAvgMs: number;
  treeDepth: number;
  tamperPass: boolean;
  skewPass: boolean;
}

// ─── Utility Functions ────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function step(msg: string): void {
  console.log(`  → ${msg}`);
}

function divider(): void {
  console.log('');
}

async function post(endpoint: string, body?: unknown): Promise<Response> {
  return fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function get(endpoint: string): Promise<Response> {
  return fetch(`${API_BASE}${endpoint}`);
}

function pickOne<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickK<T>(arr: T[], k: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, Math.min(k, arr.length));
}

// ─── Log Generator ────────────────────────────────────────────────────────────

function generateLogs(n: number, timestampOverride?: string): LogPayload[] {
  const services = ['auth-service', 'api-gateway', 'payment-svc', 'user-mgmt', 'scheduler'];
  const levels: LogPayload['log_level'][] = ['INFO', 'WARN', 'ERROR', 'DEBUG'];
  const messages = [
    'User authenticated successfully',
    'Database connection pool saturated',
    'Payment transaction committed',
    'Session token refreshed',
    'Cache eviction triggered',
    'Rate limit threshold approached',
    'Audit log entry flushed',
    'Health check passed',
  ];

  return Array.from({ length: n }, (_, i) => ({
    source_service: services[i % services.length],
    log_level: levels[i % levels.length],
    message: `${messages[i % messages.length]} [entry=${i + 1}/${n}]`,
    metadata: { index: i, benchmark_run: true },
    ...(timestampOverride ? { timestamp: timestampOverride } : {}),
  }));
}

// ─── Per-N Benchmark ──────────────────────────────────────────────────────────

async function benchmarkN(n: number): Promise<SummaryRow> {

  console.log(`===== BENCHMARK START: N = ${n} =====`);
  divider();

  // ── Phase 1: INGESTION ────────────────────────────────────────────────────

  console.log('[INGESTION]');
  step('Generating logs...');
  await sleep(STEP_DELAY_MS);

  const logs = generateLogs(n);
  step('Sending ingestion request...');

  const t0 = performance.now();
  const ingestRes = await post('/logs/ingest-batch', { logs });
  const t1 = performance.now();

  if (!ingestRes.ok) {
    throw new Error(`Ingestion failed (${ingestRes.status}): ${await ingestRes.text()}`);
  }
  const ingestData = (await ingestRes.json()) as { logs: IngestResponse[] };
  const logIds = ingestData.logs.map((l) => l.log_id);

  const ingestMs  = t1 - t0;
  const throughput = (n / ingestMs) * 1000;

  console.log(`  Total Time : ${ingestMs.toFixed(2)} ms`);
  console.log(`  Throughput : ${throughput.toFixed(1)} logs/sec`);
  divider();
  await sleep(STEP_DELAY_MS);

  // ── Phase 2: BATCH CREATION ───────────────────────────────────────────────

  console.log('[BATCH CREATION]');
  step('Triggering batch...');

  const t2 = performance.now();
  const batchRes = await post('/admin/batch/trigger');
  const t3 = performance.now();

  if (!batchRes.ok) {
    throw new Error(`Batch trigger failed (${batchRes.status}): ${await batchRes.text()}`);
  }
  const batchData = (await batchRes.json()) as any;
  const batchMs   = t3 - t2;
  const treeDepth: number = batchData.tree_depth ?? 0;

  console.log(`  Total Time : ${batchMs.toFixed(2)} ms`);
  console.log(`  Tree Depth : ${treeDepth}`);
  divider();
  await sleep(STEP_DELAY_MS);

  // ── Phase 3: VERIFICATION ─────────────────────────────────────────────────

  console.log('[VERIFICATION]');
  step('Running verification...');

  const verifyIds   = pickK(logIds, K_VERIFY);
  const verifyTimes: number[] = [];

  for (const id of verifyIds) {
    const tv0 = performance.now();
    const vRes = await get(`/verify/log/${id}`);
    const tv1 = performance.now();

    if (!vRes.ok) throw new Error(`Verify failed for ${id}: ${await vRes.text()}`);
    const vData = (await vRes.json()) as VerifyResponse;

    // Guard: proof_source must always be DERIVED — zero-trust invariant
    if (vData.verification_steps.novelty.proof_source !== 'DERIVED') {
      throw new Error(`INVARIANT VIOLATED: proof_source is not DERIVED for ${id}`);
    }

    verifyTimes.push(tv1 - tv0);
  }

  const verifyAvgMs = verifyTimes.reduce((a, b) => a + b, 0) / verifyTimes.length;
  console.log(`  Average Time (${K_VERIFY} logs) : ${verifyAvgMs.toFixed(2)} ms`);
  divider();
  await sleep(STEP_DELAY_MS);

  // ── Phase 4: SECURITY TESTS ───────────────────────────────────────────────

  console.log('[SECURITY TEST]');

  // --- Tamper Detection ---
  step('Simulating tampering...');
  await sleep(STEP_DELAY_MS / 2);

  const tamperId = pickOne(logIds);
  const tamperRes = await post(`/admin/simulate-tamper/${tamperId}`);
  if (!tamperRes.ok) throw new Error(`Tamper failed: ${await tamperRes.text()}`);

  const postTamperRes = await get(`/verify/log/${tamperId}`);
  if (!postTamperRes.ok) throw new Error(`Post-tamper verify failed: ${await postTamperRes.text()}`);
  const ptData = (await postTamperRes.json()) as VerifyResponse;
  const tamperPass = ptData.verification_steps.novelty.integrity_score < 100;

  console.log(`  Tamper Detection        : ${tamperPass ? 'PASS' : 'FAIL'}`);

  // --- Timestamp Skew Detection ---
  step('Running skew test...');
  await sleep(STEP_DELAY_MS / 2);

  const pastTimestamp = new Date(Date.now() - SKEW_OFFSET_MS).toISOString();
  const skewLogs = generateLogs(SKEW_COUNT, pastTimestamp);

  const skewIngestRes = await post('/logs/ingest-batch', { logs: skewLogs });
  if (!skewIngestRes.ok) throw new Error(`Skew ingest failed: ${await skewIngestRes.text()}`);
  const skewData = (await skewIngestRes.json()) as { logs: IngestResponse[] };
  const skewIds = skewData.logs.map((l) => l.log_id);

  const skewBatchRes = await post('/admin/batch/trigger');
  if (!skewBatchRes.ok) throw new Error(`Skew batch failed: ${await skewBatchRes.text()}`);

  let highCount = 0;
  for (const id of skewIds) {
    const svRes = await get(`/verify/log/${id}`);
    if (!svRes.ok) continue;
    const svData = (await svRes.json()) as VerifyResponse;
    if (svData.verification_steps.novelty.timestamp_skew === 'HIGH') highCount++;
  }

  const skewPass = highCount === SKEW_COUNT;
  console.log(`  Timestamp Skew Detection: ${skewPass ? 'PASS' : 'FAIL'}`);

  divider();
  console.log(`===== BENCHMARK END =====`);
  console.log('');
  console.log('');

  await sleep(STEP_DELAY_MS);

  return {
    n,
    ingestMs,
    batchMs,
    verifyAvgMs,
    treeDepth,
    tamperPass,
    skewPass,
  };
}

// ─── Final Summary Table ──────────────────────────────────────────────────────

function printSummary(rows: SummaryRow[]): void {
  console.log('══════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('══════════════════════════════════════════════════════');
  console.log('');

  for (const r of rows) {
    const label   = `N=${String(r.n).padEnd(3)}`;
    const ingest  = `Ingest: ${r.ingestMs.toFixed(1)} ms`.padEnd(20);
    const batch   = `Batch: ${r.batchMs.toFixed(1)} ms`.padEnd(22);
    const verify  = `Verify: ${r.verifyAvgMs.toFixed(2)} ms`.padEnd(22);
    const depth   = `Depth: ${r.treeDepth}`;
    console.log(`  ${label} | ${ingest} | ${batch} | ${verify} | ${depth}`);
  }

  console.log('');
  console.log('  Security (all N):');
  console.log(`  Tamper Detection     : ${rows.every((r) => r.tamperPass) ? 'PASS (100%)' : 'PARTIAL FAILURE'}`);
  console.log(`  Skew Detection       : ${rows.every((r) => r.skewPass) ? 'PASS (100%)' : 'PARTIAL FAILURE'}`);
  console.log('');
  console.log('══════════════════════════════════════════════════════');
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

function saveCSV(rows: SummaryRow[]): string {
  const header = 'N,Ingest_ms,Batch_ms,Verify_avg_ms,Tree_Depth,Tamper_Pass,Skew_Pass';
  const lines  = rows.map((r) =>
    [
      r.n,
      r.ingestMs.toFixed(2),
      r.batchMs.toFixed(2),
      r.verifyAvgMs.toFixed(2),
      r.treeDepth,
      r.tamperPass ? 1 : 0,
      r.skewPass  ? 1 : 0,
    ].join(','),
  );

  const csv        = [header, ...lines].join('\n');
  const dir        = path.join(path.dirname(__filename), 'results');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename   = `research_benchmark_${Date.now()}.csv`;
  const filepath   = path.join(dir, filename);
  fs.writeFileSync(filepath, csv);
  return filepath;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Health check
  try {
    const h = await fetch('http://localhost:3000/health');
    const b = (await h.json()) as { status: string };
    if (b.status !== 'healthy') throw new Error();
  } catch {
    console.error('[FATAL] Backend not reachable. Run: npm run dev');
    process.exit(1);
  }

  console.log('');
  console.log('══════════════════════════════════════════════════════');
  console.log('  SeaLog Research Benchmark');
  console.log('  Cryptographic Integrity Evaluation Suite');
  console.log('══════════════════════════════════════════════════════');
  console.log('');
  console.log(`  Test sizes    : N = [${N_VALUES.join(', ')}]`);
  console.log(`  Verifications : ${K_VERIFY} logs per N`);
  console.log(`  Tamper test   : ${TAMPER_COUNT} log per N (direct DB mutation)`);
  console.log(`  Skew test     : ${SKEW_COUNT} logs at -2hr timestamp offset`);
  console.log(`  Step delay    : ${STEP_DELAY_MS}ms (for screenshot readability)`);
  console.log('');
  await sleep(600);

  const summary: SummaryRow[] = [];

  for (const n of N_VALUES) {
    const row = await benchmarkN(n);
    summary.push(row);
  }

  printSummary(summary);

  const csvPath = saveCSV(summary);
  console.log(`  CSV results  → ${csvPath}`);
  console.log('');
}

main().catch((err: Error) => {
  console.error(`\n[ERROR] ${err.message}`);
  process.exit(1);
});
