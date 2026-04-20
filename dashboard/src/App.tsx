import React, { useEffect, useMemo, useState } from 'react';
import './index.css';
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle,
  Clock,
  Code2,
  ExternalLink,
  FileJson,
  Layers,
  Link2,
  Play,
  Plus,
  RefreshCw,
  Shield,
  Upload,
} from 'lucide-react';
import { api } from './api/client';
import { getTreeLevels } from './utils/tree';
import type {
  Batch,
  BatchVerificationResult,
  ChainVerificationResult,
  IngestRequest,
  IngestResponse,
  LogLevel,
  VerificationResult,
} from './types/api';

type Step = 1 | 2 | 3 | 4 | 5 | 6;
type ApiStatus = 'checking' | 'online' | 'offline';
type IngestionMode = 'manual' | 'json';

interface QueuedLog extends IngestRequest {
  local_id: string;
}

interface DisplayLog extends QueuedLog {
  log_id?: string;
  sequence_number?: number;
  acknowledged_at?: string;
  batch_status?: 'pending' | 'batched';
}

interface ManualDraft {
  source_service: string;
  log_level: LogLevel;
  message: string;
  metadataText: string;
  timestamp: string;
}

const EMPTY_DRAFT: ManualDraft = {
  source_service: 'auth-service',
  log_level: 'INFO',
  message: '',
  metadataText: '{\n  "user_id": "123"\n}',
  timestamp: '',
};

const SAMPLE_LOGS: IngestRequest[] = [
  {
    source_service: 'auth-service',
    log_level: 'INFO',
    message: 'User login success: uid=kashy_eth',
    metadata: { user_id: 'kashy_eth', ip: '192.168.1.100' },
  },
  {
    source_service: 'api-gateway',
    log_level: 'INFO',
    message: 'GET /api/v1/orders returned 200 OK',
    metadata: { route: '/api/v1/orders', status: 200 },
  },
  {
    source_service: 'db-service',
    log_level: 'WARN',
    message: 'Connection pool at 87% capacity',
    metadata: { pool_usage: 87 },
  },
  {
    source_service: 'auth-service',
    log_level: 'ERROR',
    message: 'Invalid JWT: 3 failed attempts',
    metadata: { attempts: 3 },
  },
];

const RAW_EXAMPLE = JSON.stringify({ logs: SAMPLE_LOGS }, null, 2);

const STEPS = [
  { label: 'Ingestion', icon: Activity },
  { label: 'Batching', icon: Layers },
  { label: 'Merkle Tree', icon: Shield },
  { label: 'Verification', icon: CheckCircle },
  { label: 'Blockchain', icon: Link2 },
  { label: 'Chain Integrity', icon: Shield },
];

function compactHash(value?: string, length = 10) {
  if (!value) return '-';
  if (value.length <= length * 2 + 3) return value;
  return `${value.slice(0, length)}...${value.slice(-length)}`;
}

function makeLocalId() {
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isLogLevel(value: unknown): value is LogLevel {
  return value === 'ERROR' || value === 'WARN' || value === 'INFO' || value === 'DEBUG';
}

function toDisplayLog(log: IngestRequest, response?: IngestResponse): DisplayLog {
  return {
    ...log,
    local_id: makeLocalId(),
    log_id: response?.log_id,
    sequence_number: response?.sequence_number,
    acknowledged_at: response?.acknowledged_at,
    batch_status: response?.batch_status,
  };
}

function toIngestRequest(log: DisplayLog): IngestRequest {
  return {
    source_service: log.source_service,
    log_level: log.log_level,
    message: log.message,
    metadata: log.metadata,
    timestamp: log.timestamp,
  };
}

function StepTracker({ current }: { current: Step }) {
  return (
    <div className="step-tracker">
      {STEPS.map((step, index) => {
        const Icon = step.icon;
        const active = index + 1 === current;
        const done = index + 1 < current;

        return (
          <React.Fragment key={step.label}>
            {index > 0 && <div className={`step-connector ${done ? 'done' : ''}`} />}
            <div className={`step-item ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
              <div className="step-circle">{done ? <Check size={16} /> : <Icon size={16} />}</div>
              <span className="step-label">{step.label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function ApiResponsePanel({ payload }: { payload?: unknown }) {
  if (!payload) return null;

  return (
    <details className="api-response">
      <summary>
        <Code2 size={15} /> API Response
      </summary>
      <pre>{JSON.stringify(payload, null, 2)}</pre>
    </details>
  );
}

function StatusBanner({
  apiStatus,
  error,
}: {
  apiStatus: ApiStatus;
  error?: string | null;
}) {
  if (apiStatus === 'online' && !error) return null;

  return (
    <div className={`status-banner ${apiStatus === 'offline' || error ? 'error' : 'warning'}`}>
      <AlertTriangle size={16} />
      <span>
        {error ||
          (apiStatus === 'checking'
            ? 'Checking SeaLog API availability...'
            : 'SeaLog API is offline. Start the backend on localhost:3000 or use queued demo data only.')}
      </span>
    </div>
  );
}

function MetricsPanel({
  batch,
  verification,
  apiStatus,
}: {
  batch: Batch | null;
  verification: BatchVerificationResult | null;
  apiStatus: ApiStatus;
}) {
  const score = verification?.integrity_score;
  const scoreClass = score === undefined ? '' : score >= 90 ? 'ok' : score >= 60 ? 'warn' : 'err';

  return (
    <aside className="side-panel panel">
      <p className="metrics-title">System Metrics</p>
      <div className="metric-item">
        <div className="metric-item-label">API</div>
        <div className={`metric-item-value status-text ${apiStatus}`}>{apiStatus.toUpperCase()}</div>
      </div>
      <div className="metric-item">
        <div className="metric-item-label">Logs in Batch</div>
        <div className="metric-item-value">{verification?.number_of_logs ?? batch?.log_count ?? '-'}</div>
      </div>
      <div className="metric-item">
        <div className="metric-item-label">Tree Depth</div>
        <div className="metric-item-value">{verification?.tree_depth ?? batch?.tree_depth ?? '-'}</div>
      </div>
      <div className="metric-item">
        <div className="metric-item-label">Build Time</div>
        <div className="metric-item-value">
          {verification?.processing_time_ms ?? batch?.processing_time_ms ?? '-'}
          {batch || verification ? 'ms' : ''}
        </div>
      </div>
      <div className="metric-item" style={{ borderLeft: `3px solid ${scoreClass === 'err' ? 'var(--error)' : scoreClass === 'warn' ? 'var(--warning)' : 'var(--accent-secondary)'}` }}>
        <div className="metric-item-label">Integrity Score</div>
        <div className={`metric-item-value score-${scoreClass}`}>{score ?? '-'}</div>
      </div>
    </aside>
  );
}

function LogFormatHelp() {
  return (
    <div className="format-help">
      <div>
        <div className="verify-label">Accepted Log Shape</div>
        <pre>{`{
  "source_service": "auth-service",
  "log_level": "INFO",
  "message": "User login success",
  "metadata": { "user_id": "123" },
  "timestamp": "2026-04-20T10:00:00.000Z"
}`}</pre>
      </div>
      <div className="field-grid">
        <span>source_service</span><strong>required text</strong>
        <span>log_level</span><strong>ERROR, WARN, INFO, DEBUG</strong>
        <span>message</span><strong>required text</strong>
        <span>metadata</span><strong>optional JSON object</strong>
        <span>timestamp</span><strong>optional ISO datetime</strong>
      </div>
    </div>
  );
}

function LogsTable({
  logs,
  selectedLogId,
  onSelectLog,
}: {
  logs: DisplayLog[];
  selectedLogId?: string;
  onSelectLog?: (logId: string) => void;
}) {
  if (logs.length === 0) return null;

  return (
    <div className="log-table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Source</th>
            <th>Level</th>
            <th>Message</th>
            <th>Timestamp</th>
            <th>Log ID</th>
            <th>Ack</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log, index) => {
            const logId = log.log_id;
            const selected = logId && selectedLogId === logId;

            return (
              <tr
                key={log.local_id}
                className={selected ? 'selected-row' : ''}
                onClick={() => logId && onSelectLog?.(logId)}
              >
                <td>{log.sequence_number ?? index + 1}</td>
                <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{log.source_service}</td>
                <td>
                  <span className={`badge ${log.log_level === 'ERROR' ? 'badge-error' : log.log_level === 'WARN' ? 'badge-warn' : 'badge-info'}`}>
                    {log.log_level}
                  </span>
                </td>
                <td>{log.message}</td>
                <td style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                  {log.timestamp ? new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '-'}
                </td>
                <td className="mono">{compactHash(log.log_id, 7)}</td>
                <td className="mono" style={{ color: 'var(--text-secondary)' }}>
                  {log.acknowledged_at ? log.acknowledged_at.slice(11, 23) : 'queued'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function validateLog(log: unknown, indexLabel = 'Log'): { log?: IngestRequest; errors: string[] } {
  const errors: string[] = [];
  const candidate = log as Partial<IngestRequest>;

  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { errors: [`${indexLabel}: must be a JSON object`] };
  }

  if (!candidate.source_service || typeof candidate.source_service !== 'string') {
    errors.push(`${indexLabel}: source_service is required`);
  }

  if (!isLogLevel(candidate.log_level)) {
    errors.push(`${indexLabel}: log_level must be ERROR, WARN, INFO, or DEBUG`);
  }

  if (!candidate.message || typeof candidate.message !== 'string') {
    errors.push(`${indexLabel}: message is required`);
  }

  if (
    candidate.metadata !== undefined &&
    (typeof candidate.metadata !== 'object' || candidate.metadata === null || Array.isArray(candidate.metadata))
  ) {
    errors.push(`${indexLabel}: metadata must be a JSON object`);
  }

  if (candidate.timestamp && Number.isNaN(Date.parse(candidate.timestamp))) {
    errors.push(`${indexLabel}: timestamp must be a valid ISO datetime`);
  }

  if (errors.length > 0) {
    return { errors };
  }

  return {
    errors,
    log: {
      source_service: candidate.source_service!.trim(),
      log_level: candidate.log_level!,
      message: candidate.message!.trim(),
      metadata: candidate.metadata,
      timestamp: candidate.timestamp ? new Date(candidate.timestamp).toISOString() : undefined,
    },
  };
}

function VerificationCards({ verification }: { verification: BatchVerificationResult | null }) {
  if (!verification) {
    return (
      <div className="empty-state">
        <Shield size={48} className="empty-state-icon" />
        <p>Run batch verification to populate integrity checks.</p>
      </div>
    );
  }

  const checks = [
    {
      label: 'Batch Status',
      value: verification.valid ? 'VALID' : 'COMPROMISED',
      valid: verification.valid,
    },
    {
      label: 'Root Match',
      value: verification.root_match ? 'CONFIRMED' : 'MISMATCH',
      valid: verification.root_match,
    },
    {
      label: 'Log Count',
      value: `${verification.log_count_verified}/${verification.number_of_logs}`,
      valid: verification.consistency_check.log_count_matches,
    },
    {
      label: 'Chain Link',
      value: verification.consistency_check.batch_chain_valid ? 'LINKED' : 'BROKEN',
      valid: verification.consistency_check.batch_chain_valid,
    },
  ];

  return (
    <>
      <div className="score-card">
        <div className="score-ring" style={{ ['--score' as string]: `${verification.integrity_score}%` }}>
          <span>{verification.integrity_score}</span>
        </div>
        <div>
          <div className="verify-label">Integrity Score</div>
          <h3>{verification.valid ? 'Zero-trust verification passed' : 'Tamper evidence detected'}</h3>
          <p className="panel-subtitle">
            Stored root {verification.root_match ? 'matches' : 'does not match'} the recomputed root.
          </p>
        </div>
      </div>

      <div className="verify-grid">
        {checks.map((check) => (
          <div key={check.label} className={`verify-card ${check.valid ? 'valid' : 'invalid'}`}>
            <div className="verify-label">{check.label}</div>
            <div className={`verify-status ${check.valid ? 'ok' : 'err'}`}>
              {check.valid ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
              {check.value}
            </div>
          </div>
        ))}

        <div className="verify-card special" style={{ gridColumn: '1 / -1' }}>
          <div className="verify-label">Stored Root</div>
          <div className="batch-root">{verification.merkle_root}</div>
          <div className="verify-label" style={{ marginTop: '14px' }}>Recomputed Root</div>
          <div className="batch-root">{verification.recomputed_root}</div>
        </div>
      </div>
    </>
  );
}

function TamperComparison({
  before,
  after,
}: {
  before: VerificationResult | null;
  after: VerificationResult | null;
}) {
  if (!before && !after) return null;

  const rows = [
    {
      label: 'Valid',
      before: before ? String(before.valid) : '-',
      after: after ? String(after.valid) : '-',
    },
    {
      label: 'Integrity Score',
      before: before ? String(before.verification_steps.novelty.integrity_score) : '-',
      after: after ? String(after.verification_steps.novelty.integrity_score) : '-',
    },
    {
      label: 'Proof Valid',
      before: before ? String(before.verification_steps.merkle_proof_valid) : '-',
      after: after ? String(after.verification_steps.merkle_proof_valid) : '-',
    },
    {
      label: 'Root Match',
      before: before ? String(before.verification_steps.novelty.root_match) : '-',
      after: after ? String(after.verification_steps.novelty.root_match) : '-',
    },
  ];

  return (
    <div className="comparison-panel">
      <div className="panel-header">
        <h3 className="panel-title">Before vs After Tamper</h3>
        <p className="panel-subtitle">The same log is verified before mutation and again after direct DB tampering.</p>
      </div>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Before</th>
            <th>After</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{row.before}</td>
              <td>{row.after}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {after && (
        <div className="tamper-alert">
          <AlertTriangle size={18} />
          <span>
            Message after tamper: <strong>{after.log_entry.message}</strong>
          </span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [step, setStep] = useState<Step>(1);
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');
  const [mode, setMode] = useState<IngestionMode>('manual');
  const [manualDraft, setManualDraft] = useState<ManualDraft>(EMPTY_DRAFT);
  const [rawJsonText, setRawJsonText] = useState(RAW_EXAMPLE);
  const [queuedLogs, setQueuedLogs] = useState<DisplayLog[]>([]);
  const [submittedLogs, setSubmittedLogs] = useState<DisplayLog[]>([]);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [jsonErrors, setJsonErrors] = useState<string[]>([]);
  const [selectedLogId, setSelectedLogId] = useState('');
  const [currentBatch, setCurrentBatch] = useState<Batch | null>(null);
  const [batchVerification, setBatchVerification] = useState<BatchVerificationResult | null>(null);
  const [selectedLogVerification, setSelectedLogVerification] = useState<VerificationResult | null>(null);
  const [beforeTamper, setBeforeTamper] = useState<VerificationResult | null>(null);
  const [afterTamper, setAfterTamper] = useState<VerificationResult | null>(null);
  const [chainVerification, setChainVerification] = useState<ChainVerificationResult | null>(null);
  const [ledger, setLedger] = useState<Batch[]>([]);
  const [lastApiResponse, setLastApiResponse] = useState<unknown>();
  const [error, setError] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);

  const allLogs = submittedLogs.length > 0 ? submittedLogs : queuedLogs;
  const activeBatchId = currentBatch?.batch_id || batchVerification?.batch?.batch_id;

  const selectedDisplayLog = useMemo(
    () => submittedLogs.find((log) => log.log_id === selectedLogId),
    [selectedLogId, submittedLogs],
  );

  useEffect(() => {
    void checkHealth();
  }, []);

  useEffect(() => {
    if (step === 3 && activeBatchId) {
      void verifyCurrentBatch(3);
    }
    if (step === 5) {
      void fetchLedger();
    }
  }, [step, activeBatchId]);

  async function runAction<T>(name: string, action: () => Promise<T>): Promise<T | null> {
    setLoadingAction(name);
    setError(null);

    try {
      const result = await action();
      setLastApiResponse(result);
      return result;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unexpected error';
      setError(message);
      return null;
    } finally {
      setLoadingAction(null);
    }
  }

  async function checkHealth() {
    setApiStatus('checking');
    try {
      const response = await api.health();
      setApiStatus(response.status === 'healthy' ? 'online' : 'offline');
      setLastApiResponse(response);
    } catch {
      setApiStatus('offline');
    }
  }

  function addManualLog() {
    const metadata = manualDraft.metadataText.trim()
      ? (() => {
          try {
            const parsed = JSON.parse(manualDraft.metadataText);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
              throw new Error('Metadata must be a JSON object');
            }
            return parsed as Record<string, unknown>;
          } catch (caught) {
            setFormErrors([caught instanceof Error ? caught.message : 'Metadata must be valid JSON']);
            return null;
          }
        })()
      : undefined;

    if (metadata === null) return;

    const candidate: IngestRequest = {
      source_service: manualDraft.source_service.trim(),
      log_level: manualDraft.log_level,
      message: manualDraft.message.trim(),
      metadata,
      timestamp: manualDraft.timestamp ? new Date(manualDraft.timestamp).toISOString() : undefined,
    };

    const validation = validateLog(candidate);
    if (validation.errors.length > 0 || !validation.log) {
      setFormErrors(validation.errors);
      return;
    }

    setQueuedLogs((logs) => [...logs, toDisplayLog(validation.log!)]);
    setManualDraft({ ...EMPTY_DRAFT, source_service: manualDraft.source_service });
    setFormErrors([]);
  }

  function loadSampleLogs() {
    const freshSamples = SAMPLE_LOGS.map((log) => ({
      ...log,
      timestamp: new Date().toISOString()
    }));
    setQueuedLogs(freshSamples.map((log) => toDisplayLog(log)));
    setSubmittedLogs([]);
    setBatchVerification(null);
    setCurrentBatch(null);
    setBeforeTamper(null);
    setAfterTamper(null);
    setSelectedLogVerification(null);
    setError(null);
  }

  function loadSkewedSample() {
    const skewedTime = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
    const log: IngestRequest = {
      source_service: 'attacker-node',
      log_level: 'ERROR',
      message: 'SIMULATED ATTACK: Backdated log entry (-1hr)',
      metadata: { attack_type: 'timestamp_skew', target_time: skewedTime },
      timestamp: skewedTime,
    };
    setQueuedLogs((logs) => [...logs, toDisplayLog(log)]);
  }

  function validateRawJson(): IngestRequest[] | null {
    try {
      const parsed = JSON.parse(rawJsonText);
      const rawLogs = Array.isArray(parsed) ? parsed : parsed?.logs;

      if (!Array.isArray(rawLogs) || rawLogs.length === 0) {
        setJsonErrors(['JSON must be an array of logs or an object with a non-empty logs array']);
        return null;
      }

      const logs: IngestRequest[] = [];
      const errors: string[] = [];

      rawLogs.forEach((item, index) => {
        const validation = validateLog(item, `Log ${index + 1}`);
        errors.push(...validation.errors);
        if (validation.log) logs.push(validation.log);
      });

      setJsonErrors(errors);
      return errors.length === 0 ? logs : null;
    } catch (caught) {
      setJsonErrors([caught instanceof Error ? caught.message : 'Invalid JSON']);
      return null;
    }
  }

  function queueRawJsonLogs() {
    const logs = validateRawJson();
    if (!logs) return;
    setQueuedLogs(logs.map((log) => toDisplayLog(log)));
    setSubmittedLogs([]);
  }

  async function submitQueuedLogs() {
    if (queuedLogs.length === 0) {
      setError('Add at least one log before submitting');
      return;
    }

    const result = await runAction('ingest', () =>
      api.ingestBatch(queuedLogs.map((log) => toIngestRequest(log))),
    );

    if (!result) return;

    const merged = queuedLogs.map((log, index) => ({
      ...log,
      log_id: result.logs[index]?.log_id,
      sequence_number: result.logs[index]?.sequence_number,
      acknowledged_at: result.logs[index]?.acknowledged_at,
      batch_status: result.logs[index]?.batch_status,
    }));

    setSubmittedLogs(merged);
    setQueuedLogs([]);
    setSelectedLogId(merged[0]?.log_id || '');
    setCurrentBatch(null);
    setBatchVerification(null);
    setBeforeTamper(null);
    setAfterTamper(null);
  }

  async function triggerBatch() {
    const trigger = await runAction('batch', () => api.triggerBatch());
    if (!trigger) return;

    if (!trigger.batch_id) {
      setError(trigger.message || 'No unbatched logs available');
      return;
    }

    const batch = await runAction('batch-detail', () => api.getBatch(trigger.batch_id!));
    if (!batch) return;

    setCurrentBatch(batch);
    const verified = await runAction('verify-batch', () => api.verifyBatch(batch.batch_id));
    if (verified) setBatchVerification(verified);
    setStep(3);
  }

  async function verifyCurrentBatch(nextStep: Step = 4) {
    if (!activeBatchId) {
      setError('Create a batch before verification');
      return;
    }

    const verified = await runAction('verify-batch', () => api.verifyBatch(activeBatchId));
    if (!verified) return;

    setBatchVerification(verified);
    setCurrentBatch(verified.batch);
    setStep(nextStep);
  }

  async function verifySelectedLog() {
    if (!selectedLogId) {
      setError('Select or enter a log_id first');
      return null;
    }

    const result = await runAction('verify-log', () => api.verifyLog(selectedLogId));
    if (result) {
      setSelectedLogVerification(result);
      if (!currentBatch && result.log_entry.batch_id) {
        const batch = await runAction('batch-detail', () => api.getBatch(result.log_entry.batch_id!));
        if (batch) setCurrentBatch(batch);
      }
    }
    return result;
  }

  async function simulateTamperFlow() {
    if (!selectedLogId) {
      setError('Select or enter the log_id to tamper');
      return;
    }

    const before = await runAction('verify-before-tamper', () => api.verifyLog(selectedLogId));
    if (!before) return;

    setBeforeTamper(before);

    const tamper = await runAction('tamper', () => api.simulateTamper(selectedLogId));
    if (!tamper) return;

    const after = await runAction('verify-after-tamper', () => api.verifyLog(selectedLogId));
    if (after) {
      setAfterTamper(after);
      setSelectedLogVerification(after);
    }

    if (before.log_entry.batch_id) {
      const batchResult = await runAction('verify-batch', () => api.verifyBatch(before.log_entry.batch_id!));
      if (batchResult) {
        setBatchVerification(batchResult);
        setCurrentBatch(batchResult.batch);
      }
    }

    setStep(4);
  }

  async function runChainWalk() {
    const result = await runAction('chain-walk', () => api.verifyChain());
    if (result) {
      setChainVerification(result);
    }
  }

  async function downloadAuditBundle() {
    if (!selectedLogId) {
      setError('Select a log first to download its audit evidence');
      return;
    }

    const bundle = await runAction('audit-bundle', () => api.getAuditBundle(selectedLogId));
    if (!bundle) return;

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-log-${selectedLogId.slice(0, 8)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function anchorCurrentBatch() {
    if (!activeBatchId) {
      setError('No active batch selected for anchoring');
      return;
    }

    const result = await runAction('anchor-batch', () => api.anchorBatch(activeBatchId));
    if (result && result.success) {
      // Re-verify the batch to refresh the UI with new anchor data
      await verifyCurrentBatch(5);
      await fetchLedger();
    }
  }

  async function fetchLedger() {
    const result = await runAction('fetch-ledger', () => api.getAnchoredBatches());
    if (result) {
      setLedger(result);
    }
  }

  function resetDemo() {
    setStep(1);
    setQueuedLogs([]);
    setSubmittedLogs([]);
    setSelectedLogId('');
    setCurrentBatch(null);
    setBatchVerification(null);
    setSelectedLogVerification(null);
    setChainVerification(null);
    setBeforeTamper(null);
    setAfterTamper(null);
    setLastApiResponse(undefined);
    setError(null);
  }

  return (
    <div className="dashboard">
      <header className="top-bar">
        <div className="logo">
          <div className="logo-icon">
            <Shield size={22} color="white" />
          </div>
          <span className="logo-text">
            Sea<span>Log</span> Engine
          </span>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className={`network-badge ${apiStatus === 'offline' ? 'offline' : ''}`}>
            <div className="dot" />
            API {apiStatus}
          </div>
          <button className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => void checkHealth()}>
            <RefreshCw size={14} /> Check API
          </button>
          <button className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={resetDemo}>
            <RefreshCw size={14} /> Reset
          </button>
        </div>
      </header>

      <div className="main-layout">
        <StepTracker current={step} />

        <section className="main-panel panel animate-in">
          <StatusBanner apiStatus={apiStatus} error={error} />

          {step === 1 && (
            <>
              <div className="panel-header">
                <h2 className="panel-title">Step 1 - Log Ingestion</h2>
                <p className="panel-subtitle">Create logs manually, paste JSON, or load sample data, then send them to the real SeaLog API.</p>
              </div>

              <div className="tabs">
                <button className={`tab ${mode === 'manual' ? 'active' : ''}`} onClick={() => setMode('manual')}>
                  <Plus size={15} /> Manual Form
                </button>
                <button className={`tab ${mode === 'json' ? 'active' : ''}`} onClick={() => setMode('json')}>
                  <FileJson size={15} /> Raw JSON
                </button>
              </div>

              {mode === 'manual' ? (
                <div className="form-grid">
                  <label>
                    Source Service
                    <input
                      value={manualDraft.source_service}
                      onChange={(event) => setManualDraft({ ...manualDraft, source_service: event.target.value })}
                    />
                  </label>
                  <label>
                    Log Level
                    <select
                      value={manualDraft.log_level}
                      onChange={(event) => setManualDraft({ ...manualDraft, log_level: event.target.value as LogLevel })}
                    >
                      <option value="INFO">INFO</option>
                      <option value="WARN">WARN</option>
                      <option value="ERROR">ERROR</option>
                      <option value="DEBUG">DEBUG</option>
                    </select>
                  </label>
                  <label className="wide">
                    Message
                    <textarea
                      value={manualDraft.message}
                      onChange={(event) => setManualDraft({ ...manualDraft, message: event.target.value })}
                      rows={3}
                    />
                  </label>
                  <label className="wide">
                    Metadata JSON
                    <textarea
                      className="mono-input"
                      value={manualDraft.metadataText}
                      onChange={(event) => setManualDraft({ ...manualDraft, metadataText: event.target.value })}
                      rows={5}
                    />
                  </label>
                  <label>
                    Timestamp
                    <input
                      type="datetime-local"
                      value={manualDraft.timestamp}
                      onChange={(event) => setManualDraft({ ...manualDraft, timestamp: event.target.value })}
                    />
                  </label>
                  <div className="form-actions">
                    <button className="btn btn-primary" onClick={addManualLog}>
                      <Plus size={16} /> Add to Queue
                    </button>
                    <button className="btn btn-ghost" onClick={loadSampleLogs}>
                      <Upload size={16} /> Load Samples
                    </button>
                    <button className="btn btn-ghost" onClick={loadSkewedSample} title="Simulate a log with an old timestamp to test skew detection">
                      <Clock size={16} /> Load Skewed
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <textarea
                    className="json-editor"
                    value={rawJsonText}
                    onChange={(event) => setRawJsonText(event.target.value)}
                    rows={15}
                  />
                  <div className="btn-row" style={{ marginTop: '14px' }}>
                    <button className="btn btn-primary" onClick={queueRawJsonLogs}>
                      <FileJson size={16} /> Validate and Queue
                    </button>
                    <button className="btn btn-ghost" onClick={() => setRawJsonText(RAW_EXAMPLE)}>
                      Load Example
                    </button>
                  </div>
                </div>
              )}

              <LogFormatHelp />

              {(formErrors.length > 0 || jsonErrors.length > 0) && (
                <div className="inline-errors">
                  {[...formErrors, ...jsonErrors].map((message) => (
                    <div key={message}>{message}</div>
                  ))}
                </div>
              )}

              <div className="section-bar">
                <div>
                  <h3>Queued Logs</h3>
                  <p>{queuedLogs.length} queued, {submittedLogs.length} submitted</p>
                </div>
                <div className="btn-row">
                  <button className="btn btn-ghost" onClick={() => setQueuedLogs([])} disabled={queuedLogs.length === 0}>
                    Clear Queue
                  </button>
                  <button className="btn btn-primary" onClick={() => void submitQueuedLogs()} disabled={loadingAction === 'ingest' || queuedLogs.length === 0}>
                    {loadingAction === 'ingest' ? <><span className="spinner" /> Submitting...</> : <>Submit Logs</>}
                  </button>
                  <button className="btn btn-primary" onClick={() => setStep(2)} disabled={submittedLogs.length === 0}>
                    Next: Create Batch
                  </button>
                </div>
              </div>

              <LogsTable logs={allLogs} selectedLogId={selectedLogId} onSelectLog={setSelectedLogId} />
            </>
          )}

          {step === 2 && (
            <>
              <div className="panel-header">
                <h2 className="panel-title">Step 2 - Batch Creation</h2>
                <p className="panel-subtitle">Trigger the backend batch processor and capture real tree depth and processing time.</p>
              </div>

              <div className="verify-grid">
                <div className="verify-card">
                  <div className="verify-label">Submitted Logs</div>
                  <div className="verify-status info">{submittedLogs.length}</div>
                </div>
                <div className="verify-card">
                  <div className="verify-label">Selected Log</div>
                  <div className="verify-status info">{compactHash(selectedLogId, 7)}</div>
                </div>
              </div>

              <div className="btn-row" style={{ marginTop: '28px' }}>
                <button className="btn btn-primary glow" onClick={() => void triggerBatch()} disabled={!!loadingAction}>
                  {loadingAction?.startsWith('batch') ? <><span className="spinner" /> Building...</> : <><Play size={16} /> Trigger Batch</>}
                </button>
                <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
              </div>
            </>
          )}

          {step === 3 && currentBatch && (
            <>
              <div className="panel-header">
                <h2 className="panel-title">Step 3 - Merkle Tree</h2>
                <p className="panel-subtitle">The backend built this batch from raw logs and stored the root commitment.</p>
              </div>

              <div className="batch-summary" style={{ marginTop: 0 }}>
                <div className="info-grid">
                  <div className="info-item"><label>Batch ID</label><span>{compactHash(currentBatch.batch_id, 8)}</span></div>
                  <div className="info-item"><label>Logs</label><span>{currentBatch.log_count}</span></div>
                  <div className="info-item"><label>Tree Depth</label><span>{currentBatch.tree_depth}</span></div>
                  <div className="info-item"><label>Processed</label><span>{currentBatch.processing_time_ms}ms</span></div>
                </div>
                <div className="verify-label">Merkle Root</div>
                <div className="batch-root">{currentBatch.merkle_root}</div>
              </div>

              <div className="tree-container live-tree" style={{ padding: '40px 20px' }}>
                {(() => {
                  const levels = getTreeLevels(submittedLogs);
                  // Reverse so root is at the top
                  return levels.slice().reverse().map((level, levelIdx) => (
                    <div key={levelIdx} className="tree-level" style={{ marginBottom: '32px' }}>
                      {level.map((hash, nodeIdx) => {
                        const isRoot = levelIdx === 0;
                        const isLeaf = levelIdx === levels.length - 1;
                        
                        // Check if this node is tampered
                        let isTampered = false;
                        if (isLeaf) {
                          const log = submittedLogs[nodeIdx];
                          isTampered = !!afterTamper && afterTamper.log_entry.log_id === log.log_id;
                        } else if (isRoot) {
                          isTampered = !!batchVerification && !batchVerification.root_match;
                        }

                        return (
                          <div key={nodeIdx} className="tree-node">
                            <div 
                              className={`tree-node-circle ${isRoot ? 'root-node' : isLeaf ? 'leaf-node' : ''} ${isTampered ? 'tampered' : ''}`}
                              title={hash}
                            >
                              {isLeaf ? `#${submittedLogs[nodeIdx].sequence_number}` : compactHash(hash, 4)}
                            </div>
                            <div className="tree-node-label">
                              {isLeaf ? submittedLogs[nodeIdx].source_service : isRoot ? 'Root' : `Level ${levels.length - 1 - levelIdx}`}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ));
                })()}
              </div>

              <div className="btn-row" style={{ marginTop: '28px', justifyContent: 'space-between' }}>
                <button className="btn btn-danger" onClick={() => void simulateTamperFlow()} disabled={!selectedLogId || !!loadingAction}>
                  <AlertTriangle size={16} /> Simulate Tamper
                </button>
                <div className="btn-row">
                  <button className="btn btn-ghost" onClick={() => setStep(2)}>Back</button>
                  <button className="btn btn-primary" onClick={() => void verifyCurrentBatch(4)} disabled={!!loadingAction}>
                    {loadingAction === 'verify-batch' ? <><span className="spinner" /> Verifying...</> : <>Run Verification</>}
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="panel-header">
                <h2 className="panel-title">Step 4 - Verification Dashboard</h2>
                <p className="panel-subtitle">Batch and log verification are recomputed from backend data, not local UI state.</p>
              </div>

              <div className="verify-tools">
                <label>
                  Log ID
                  <input value={selectedLogId} onChange={(event) => setSelectedLogId(event.target.value)} />
                </label>
                <button className="btn btn-ghost" onClick={() => void verifySelectedLog()} disabled={!selectedLogId || !!loadingAction}>
                  Verify Log
                </button>
                <button className="btn btn-danger" onClick={() => void simulateTamperFlow()} disabled={!selectedLogId || !!loadingAction}>
                  Simulate Tamper
                </button>
                <button className="btn btn-primary" onClick={() => void verifyCurrentBatch(4)} disabled={!activeBatchId || !!loadingAction}>
                  Verify Batch
                </button>
                {selectedLogVerification && (
                  <button className="btn btn-ghost" onClick={() => setShowRawJson(!showRawJson)}>
                    <FileJson size={16} /> {showRawJson ? 'Hide Raw JSON' : 'View Raw API JSON'}
                  </button>
                )}
              </div>

              {selectedDisplayLog && (
                <div className="verify-card special" style={{ marginTop: '18px' }}>
                  <div className="verify-label">Selected Log</div>
                  <div>{selectedDisplayLog.source_service} / {selectedDisplayLog.log_level} / {selectedDisplayLog.message}</div>
                </div>
              )}

              <VerificationCards verification={batchVerification} />
              <TamperComparison before={beforeTamper} after={afterTamper} />

              {selectedLogVerification && (
                <>
                  {showRawJson && (
                    <div style={{ marginTop: '16px', background: '#09090b', padding: '16px', borderRadius: '8px', border: '1px solid #27272a', overflowX: 'auto' }}>
                      <div style={{ marginBottom: '8px', fontSize: '12px', color: '#a1a1aa', fontWeight: 'bold' }}>
                        RAW BACKEND API RESPONSE (GET /api/v1/verify/log/:id)
                      </div>
                      <pre className="json-editor" style={{ margin: 0, padding: 0, minHeight: 'auto', background: 'transparent' }}>
                        {JSON.stringify(selectedLogVerification, null, 2)}
                      </pre>
                    </div>
                  )}
                  
                  <div className="verify-grid" style={{ marginTop: '20px' }}>
                    <div className="verify-card special" style={{ border: `1px solid ${selectedLogVerification.valid ? 'rgba(34,197,94,0.3)' : 'rgba(244,63,94,0.3)'}` }}>
                      <div className="verify-label">Integrity Score</div>
                      <div className="verify-status" style={{ fontSize: '1.2rem', color: selectedLogVerification.verification_steps.novelty.integrity_score === 100 ? '#22c55e' : '#f43f5e' }}>
                        {selectedLogVerification.verification_steps.novelty.integrity_score} / 100
                      </div>
                      <div style={{ fontSize: '0.65rem', opacity: 0.6 }}>Dynamic Tamper & Skew Metric</div>
                    </div>

                    <div className="verify-card special">
                      <div className="verify-label">Selected Log Proof</div>
                      <div className={`verify-status ${selectedLogVerification.valid ? 'ok' : 'err'}`}>
                        {selectedLogVerification.valid ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
                        {selectedLogVerification.valid ? 'VALID' : 'FAILED'}
                      </div>
                      <div className="batch-root" style={{ fontSize: '0.7rem' }}>Log ID: {selectedLogVerification.log_entry.log_id}</div>
                    </div>
                    
                    <div className="verify-card" style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)' }}>
                      <div className="verify-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Shield size={14} /> Zero-Trust Provenance
                      </div>
                      <div className="verify-status info" style={{ color: '#818cf8', fontSize: '0.9rem' }}>
                        {selectedLogVerification.verification_steps.novelty.proof_source.toUpperCase()}
                      </div>
                      <div style={{ fontSize: '0.65rem', opacity: 0.6 }}>Proof recomputed from raw data.</div>
                    </div>

                    <div className="verify-card" style={{ background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.2)' }}>
                      <div className="verify-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Link2 size={14} /> Root Match
                      </div>
                      <div className={`verify-status ${selectedLogVerification.verification_steps.novelty.root_match ? 'ok' : 'err'}`} style={{ fontSize: '0.9rem' }}>
                        {selectedLogVerification.verification_steps.novelty.root_match ? 'CONFIRMED' : 'MISMATCH'}
                      </div>
                      <div style={{ fontSize: '0.65rem', opacity: 0.6 }}>Deterministic DB constraint.</div>
                    </div>
                  </div>

                  <div className="verify-card" style={{ marginTop: '20px' }}>
                    <div className="verify-label">Novelty 1: Dual-Timestamp Audit</div>
                    <div className="audit-table" style={{ marginTop: '12px' }}>
                      <div className="info-grid">
                        <div className="info-item">
                          <label>Event Time (Client)</label>
                          <span style={{ fontSize: '0.9rem' }}>{new Date(selectedLogVerification.verification_steps.timestamp_check.event_time).toLocaleString()}</span>
                        </div>
                        <div className="info-item">
                          <label>Ingest Time (Server)</label>
                          <span style={{ fontSize: '0.9rem' }}>{new Date(selectedLogVerification.verification_steps.timestamp_check.ingested_at).toLocaleString()}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)' }}>
                        <Clock size={16} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>Clock Delta</div>
                          <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>{selectedLogVerification.verification_steps.timestamp_check.delta_ms}ms</div>
                        </div>
                        <div className={`badge ${selectedLogVerification.verification_steps.timestamp_check.suspicious ? 'badge-error' : 'badge-info'}`}>
                          SKEW: {selectedLogVerification.verification_steps.novelty.timestamp_skew}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="verify-card" style={{ marginTop: '20px', border: '1px border-dashed #52525b', padding: '24px' }}>
                    <div className="verify-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                      <Code2 size={16} /> SeaLog Innovation Summary
                    </div>
                    
                    <div className="step-list">
                      {[
                        { label: 'N1: Dual-Timestamp check (Audit)', done: !selectedLogVerification.verification_steps.timestamp_check.suspicious },
                        { label: 'N2: Zero-Trust "Derived" Proof path', done: selectedLogVerification.verification_steps.novelty.proof_source === 'DERIVED' },
                        { label: 'N3: Deterministic Root Match (Step 3)', done: selectedLogVerification.verification_steps.novelty.root_match },
                        { label: 'N4: Real-time Integrity Score (0-100)', done: selectedLogVerification.verification_steps.novelty.integrity_score > 0 }
                      ].map((s, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                          <div style={{ 
                            width: '24px', height: '24px', borderRadius: '50%', background: s.done ? '#22c55e' : '#f43f5e', 
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#fff' 
                          }}>
                            {s.done ? <Check size={14} /> : '!'}
                          </div>
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: '500', opacity: s.done ? 1 : 0.6 }}>{s.label}</div>
                            <div style={{ fontSize: '11px', opacity: 0.4 }}>Verification condition maintained.</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ 
                      marginTop: '20px', padding: '16px', borderRadius: '8px', background: 'rgba(99,102,241,0.05)', 
                      fontSize: '13px', opacity: 0.8, borderLeft: '4px solid #6366f1', lineHeight: '1.5'
                    }}>
                      <strong>Research Note:</strong> These innovations ensure that trust is shifted from the database administrator to independent cryptographic verification, preventing both log modification and backdating.
                    </div>
                  </div>
                </>
              )}

              <div className="btn-row" style={{ marginTop: '28px', justifyContent: 'space-between' }}>
                <button className="btn btn-ghost" onClick={() => setStep(3)}>Back</button>
                <div className="btn-row">
                  <button className="btn btn-ghost" onClick={() => void downloadAuditBundle()} disabled={!selectedLogId || !!loadingAction}>
                    Download Audit
                  </button>
                  <button className="btn btn-primary" onClick={() => setStep(5)} disabled={!batchVerification}>
                    Blockchain Status
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <div className="panel-header">
                <h2 className="panel-title">Step 5 - Blockchain Anchor</h2>
                <p className="panel-subtitle">This view reflects the anchor fields returned by batch verification.</p>
              </div>

              <div className="anchor-card">
                <div className={`verify-status ${batchVerification?.blockchain_anchor.is_anchored ? 'ok' : 'warn'}`}>
                  {batchVerification?.blockchain_anchor.is_anchored ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
                  {batchVerification?.blockchain_anchor.is_anchored ? 'Anchored on-chain' : 'No blockchain anchor recorded yet'}
                </div>
                <div className="batch-root">{batchVerification?.merkle_root || currentBatch?.merkle_root}</div>
                {batchVerification?.verification_url && (
                  <a className="anchor-link" href={batchVerification.verification_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={16} /> View Transaction
                  </a>
                )}
              </div>

              {!batchVerification?.blockchain_anchor.is_anchored && (
                <div className="btn-row" style={{ marginTop: '24px', justifyContent: 'center' }}>
                  <button className="btn btn-primary glow" onClick={() => void anchorCurrentBatch()} disabled={!!loadingAction}>
                    {loadingAction === 'anchor-batch' ? <><span className="spinner" /> Anchoring...</> : <><Link2 size={16} /> Push to Blockchain</>}
                  </button>
                </div>
              )}

              <div style={{ marginTop: '40px' }}>
                <h3 className="metrics-title">Blockchain Transaction Ledger</h3>
                <div className="log-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Batch</th>
                        <th>Anchored At</th>
                        <th>Merkle Root</th>
                        <th>Explorer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', padding: '32px', opacity: 0.5 }}>
                            No anchors found in the ledger.
                          </td>
                        </tr>
                      ) : (
                        ledger.map((b) => (
                          <tr key={b.batch_id} title={`Batch Root: ${b.merkle_root}\nLogs in this batch: ${b.log_count}`}>
                            <td>
                              <span className="badge badge-info" title={`Batch ID: ${b.batch_id}`}>#{b.batch_number}</span>
                            </td>
                            <td>{b.anchored_at ? new Date(b.anchored_at).toLocaleString() : 'N/A'}</td>
                            <td className="mono">{compactHash(b.merkle_root, 6)}</td>
                            <td>
                              <a 
                                href={api.getExplorerUrl(b.anchor_tx_hash!)} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="status-text online"
                                style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                              >
                                <ExternalLink size={14} /> View
                              </a>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="btn-row" style={{ marginTop: '28px', justifyContent: 'space-between' }}>
                <button className="btn btn-ghost" onClick={() => setStep(4)}>Back</button>
                <button className="btn btn-primary" onClick={() => setStep(6)}>
                  Chain Integrity
                </button>
              </div>
            </>
          )}

          {step === 6 && (
            <>
              <div className="panel-header">
                <h2 className="panel-title">Step 6 - Cross-Batch Chain Integrity</h2>
                <p className="panel-subtitle">Walking the global cryptographic chain to detect missing, reordered, or deleted batches.</p>
              </div>

              <div className="verify-tools" style={{ marginBottom: '24px', justifyContent: 'center' }}>
                <button className="btn btn-primary glow" onClick={() => void runChainWalk()} disabled={!!loadingAction}>
                  {loadingAction === 'chain-walk' ? <><span className="spinner" /> Auditing Chain...</> : <><Shield size={16} /> Run Full Chain Walk</>}
                </button>
              </div>

              {chainVerification && (
                <div className="animate-in">
                  <div className="verify-grid">
                    <div className={`verify-card ${chainVerification.valid ? 'valid' : 'invalid'}`}>
                      <div className="verify-label">Chain Status</div>
                      <div className={`verify-status ${chainVerification.valid ? 'ok' : 'err'}`}>
                        {chainVerification.valid ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
                        {chainVerification.valid ? 'INTACT' : 'COMPROMISED'}
                      </div>
                    </div>
                    <div className="verify-card">
                      <div className="verify-label">Batches Verified</div>
                      <div className="verify-status info">{chainVerification.batches_checked}</div>
                    </div>
                  </div>

                  {!chainVerification.valid && (
                    <div className="tamper-alert" style={{ marginTop: '16px' }}>
                      <AlertTriangle size={18} />
                      <span>
                        {chainVerification.missing_batch_numbers.length > 0
                          ? `Gaps detected! Missing batch numbers: ${chainVerification.missing_batch_numbers.join(', ')}`
                          : `Chain link broken at batch #${chainVerification.broken_link_at}`}
                      </span>
                    </div>
                  )}

                  <div className="chain-visual-container">
                    <div className="chain-line" />
                    <div className="chain-batches">
                      {Array.from({ length: chainVerification.batches_checked }).map((_, i) => {
                        const batchNum = chainVerification.from_batch_number + i;
                        const isBroken = chainVerification.broken_link_at === batchNum;
                        return (
                          <div key={batchNum} className={`chain-batch-node ${isBroken ? 'broken' : ''}`}>
                            <div className="chain-batch-circle">
                              {isBroken ? <AlertTriangle size={14} /> : <Check size={14} />}
                            </div>
                            <div className="chain-batch-label">Batch #{batchNum}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              <div className="btn-row" style={{ marginTop: '28px' }}>
                <button className="btn btn-ghost" onClick={() => setStep(5)}>Back</button>
              </div>
            </>
          )}

          <ApiResponsePanel payload={lastApiResponse} />
        </section>

        <MetricsPanel batch={currentBatch} verification={batchVerification} apiStatus={apiStatus} />
      </div>

      <footer style={{ padding: '20px 32px', borderTop: '1px solid var(--border-color)', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
        SeaLog Engine Dashboard / Live Backend Mode
      </footer>
    </div>
  );
}
