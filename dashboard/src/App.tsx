import React, { useState } from 'react';
import './index.css';
import {
  Activity, Shield, Layers, CheckCircle, Link2, Check,
  AlertTriangle, Play, RefreshCw, Plus, ExternalLink, Zap
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────
interface Log {
  id: string;
  seq: number;
  source: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  event_time: string;
  ingested_at: string;
  tampered?: boolean;
}

interface BatchResult {
  id: string;
  merkle_root: string;
  count: number;
  processing_ms: number;
  chain_hash: string;
}

interface AnchorResult {
  tx_hash: string;
  block_number: number;
  explorer_url: string;
  timestamp: string;
}

// ─── Sample Data ─────────────────────────────────────────────────────
const SAMPLE_LOGS: Log[] = [
  { id: 'log-001', seq: 1, source: 'auth-service',     level: 'INFO',  message: 'User login success: uid=kashy_eth',    event_time: '2026-04-20T01:00:00.000Z', ingested_at: '2026-04-20T01:00:00.120Z' },
  { id: 'log-002', seq: 2, source: 'api-gateway',      level: 'INFO',  message: 'GET /api/v1/orders — 200 OK',          event_time: '2026-04-20T01:00:01.200Z', ingested_at: '2026-04-20T01:00:01.330Z' },
  { id: 'log-003', seq: 3, source: 'db-service',       level: 'WARN',  message: 'Connection pool at 87% capacity',      event_time: '2026-04-20T01:00:02.400Z', ingested_at: '2026-04-20T01:00:02.510Z' },
  { id: 'log-004', seq: 4, source: 'auth-service',     level: 'ERROR', message: 'Invalid JWT – 3 failed attempts',      event_time: '2026-04-20T01:00:03.100Z', ingested_at: '2026-04-20T01:00:03.225Z' },
  { id: 'log-005', seq: 5, source: 'payment-service',  level: 'INFO',  message: 'Transaction 0xabc processed: $249.00', event_time: '2026-04-20T01:00:04.500Z', ingested_at: '2026-04-20T01:00:04.612Z' },
  { id: 'log-006', seq: 6, source: 'api-gateway',      level: 'INFO',  message: 'POST /api/v1/checkout — 201 Created',  event_time: '2026-04-20T01:00:05.700Z', ingested_at: '2026-04-20T01:00:05.801Z' },
  { id: 'log-007', seq: 7, source: 'email-service',    level: 'INFO',  message: 'Receipt sent to user@domain.io',       event_time: '2026-04-20T01:00:06.800Z', ingested_at: '2026-04-20T01:00:06.934Z' },
  { id: 'log-008', seq: 8, source: 'audit-agent',      level: 'INFO',  message: 'Session closed. Integrity SEALED.',    event_time: '2026-04-20T01:00:08.000Z', ingested_at: '2026-04-20T01:00:08.110Z' },
];

// ─── Deterministic fake hashes keyed to log IDs (stable across renders) ──
const LEAF_HASHES: Record<string, string> = {
  'log-001': '0xa1b2c3', 'log-002': '0xd4e5f6', 'log-003': '0x7a8b9c', 'log-004': '0xde1f23',
  'log-005': '0x456789', 'log-006': '0xabcdef', 'log-007': '0x321fed', 'log-008': '0x987654',
};
const INTERNAL_HASHES = {
  l1_01: '0xf1c2d3', l1_12: '0xe4b5a6', l1_23: '0xc7d8e9', l1_34: '0xba9876',
  l2_0: '0x1a2b3c',  l2_1: '0x4d5e6f',
  root:  '0xebfcd6af',
};
const MERKLE_ROOT = '0xebfcd6afaf070eec64d5f65528f14773732d9bbf4a9ac617415fbc4776ff6349';

// ─── Step Tracker ─────────────────────────────────────────────────────
const STEPS = [
  { label: 'Ingestion',    icon: Activity   },
  { label: 'Batching',     icon: Layers     },
  { label: 'Merkle Tree',  icon: Shield     },
  { label: 'Verification', icon: CheckCircle },
  { label: 'Blockchain',   icon: Link2      },
];

function StepTracker({ current }: { current: number }) {
  return (
    <div className="step-tracker">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const active    = i + 1 === current;
        const done      = i + 1 < current;
        return (
          <React.Fragment key={s.label}>
            {i > 0 && <div className={`step-connector ${done ? 'done' : ''}`} />}
            <div className={`step-item ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
              <div className="step-circle">
                {done ? <Check size={16} /> : <Icon size={16} />}
              </div>
              <span className="step-label">{s.label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Metrics Side Panel ────────────────────────────────────────────────
function MetricsPanel({ batch, anchored }: { batch: BatchResult | null; anchored: boolean }) {
  return (
    <aside className="side-panel panel">
      <p className="metrics-title">System Metrics</p>
      <div className="metric-item">
        <div className="metric-item-label">Logs in Batch</div>
        <div className="metric-item-value">{batch ? batch.count : '—'}</div>
      </div>
      <div className="metric-item">
        <div className="metric-item-label">Batch Processing</div>
        <div className="metric-item-value">{batch ? `${batch.processing_ms}ms` : '—'}</div>
      </div>
      <div className="metric-item">
        <div className="metric-item-label">Chain Integrity</div>
        <div className="metric-item-value" style={{ fontSize: '1rem' }}>{batch ? 'LINKED ✓' : '—'}</div>
      </div>
      <div className="metric-item">
        <div className="metric-item-label">Blockchain Anchor</div>
        <div className="metric-item-value" style={{ fontSize: '1rem', color: anchored ? 'var(--success)' : 'var(--text-secondary)' }}>
          {anchored ? 'COMMITTED ✓' : 'PENDING'}
        </div>
      </div>
      <div className="metric-item" style={{ borderLeft: '3px solid var(--accent-secondary)' }}>
        <div className="metric-item-label">Network</div>
        <div className="metric-item-value" style={{ fontSize: '0.9rem' }}>Sepolia 🟢</div>
      </div>
    </aside>
  );
}

// ─── SVG Merkle Tree ──────────────────────────────────────────────────
function MerkleTree({
  logs, selectedLeaf, onSelectLeaf, tampered,
}: {
  logs: Log[];
  selectedLeaf: string | null;
  onSelectLeaf: (id: string) => void;
  tampered: boolean;
}) {
  // Build 4-level tree layout for 8 leaves
  const leaves  = logs.map(l => l.id);
  const level1  = ['l1_01','l1_12','l1_23','l1_34'];
  const level2  = ['l2_0','l2_1'];
  const root    = 'root';

  const getLeafClass = (id: string) => {
    if (tampered && id === 'log-004') return 'tampered';
    if (selectedLeaf === id) return 'selected';
    if (selectedLeaf && getPathForLeaf(selectedLeaf).includes(id)) return 'highlighted';
    return 'leaf-node';
  };

  const getInternalClass = (id: string) => {
    if (tampered) {
      if (['l1_12', 'l2_0', 'root'].includes(id)) return 'tampered';
    }
    if (selectedLeaf && getPathForLeaf(selectedLeaf).includes(id)) return 'highlighted';
    return '';
  };

  const getPathForLeaf = (leafId: string): string[] => {
    const paths: Record<string, string[]> = {
      'log-001': ['l1_01', 'l2_0', 'root'],
      'log-002': ['l1_01', 'l2_0', 'root'],
      'log-003': ['l1_12', 'l2_0', 'root'],
      'log-004': ['l1_12', 'l2_0', 'root'],
      'log-005': ['l1_23', 'l2_1', 'root'],
      'log-006': ['l1_23', 'l2_1', 'root'],
      'log-007': ['l1_34', 'l2_1', 'root'],
      'log-008': ['l1_34', 'l2_1', 'root'],
    };
    return paths[leafId] || [];
  };

  const rootHash = tampered ? '0x!!INVALID' : INTERNAL_HASHES.root;

  return (
    <div>
      {selectedLeaf && (
        <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '8px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', fontSize: '0.83rem', color: 'var(--warning)' }}>
          ⬆ Proof path highlighted from <strong>{selectedLeaf}</strong> → Root
        </div>
      )}

      <div className="tree-container" style={{ gap: '8px' }}>
        {/* Root */}
        <div className="tree-level">
          <div className="tree-node" onClick={() => onSelectLeaf('')}>
            <div className={`tree-node-circle root-node ${getInternalClass(root)}`}>
              {rootHash}
            </div>
            <div className="tree-node-label">Merkle Root</div>
          </div>
        </div>

        {/* Level 2 */}
        <div className="tree-level" style={{ gap: '80px' }}>
          {level2.map((id, i) => (
            <div key={id} className="tree-node">
              <div className={`tree-node-circle ${getInternalClass(id)}`}>
                {INTERNAL_HASHES[id as keyof typeof INTERNAL_HASHES]}
              </div>
              <div className="tree-node-label">H({i*2},{i*2+1})</div>
            </div>
          ))}
        </div>

        {/* Level 1 (internal) */}
        <div className="tree-level" style={{ gap: '16px' }}>
          {level1.map((id, i) => (
            <div key={id} className="tree-node">
              <div className={`tree-node-circle ${getInternalClass(id)}`} style={{ width: '46px', height: '46px' }}>
                {INTERNAL_HASHES[id as keyof typeof INTERNAL_HASHES]}
              </div>
              <div className="tree-node-label">H({i*2},{i*2+1})</div>
            </div>
          ))}
        </div>

        {/* Leaves */}
        <div className="tree-level" style={{ gap: '6px' }}>
          {leaves.map(id => (
            <div key={id} className="tree-node" onClick={() => onSelectLeaf(id === selectedLeaf ? '' : id)}>
              <div className={`tree-node-circle ${getLeafClass(id)}`} style={{ width: '44px', height: '44px' }}>
                {LEAF_HASHES[id]}
              </div>
              <div className="tree-node-label" style={{ color: selectedLeaf === id ? 'var(--success)' : undefined }}>
                #{logs.find(l => l.id === id)?.seq}
              </div>
            </div>
          ))}
        </div>
      </div>

      {tampered && (
        <div className="tamper-alert" style={{ marginTop: '16px' }}>
          <AlertTriangle size={18} />
          Tampering detected: Hash mismatch at level 2 — propagation to root FAILED
        </div>
      )}

      <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '12px', textAlign: 'center' }}>
        Click any leaf node to trace its Merkle proof path ↑
      </p>
    </div>
  );
}

// ─── Verification Dashboard ───────────────────────────────────────────
function VerificationDashboard({ tampered }: { tampered: boolean }) {
  const checks = [
    {
      label: 'Merkle Proof',
      value: tampered ? '✘  INVALID' : '✔  VALID',
      cls: tampered ? 'invalid' : 'valid',
      statusCls: tampered ? 'err' : 'ok',
    },
    {
      label: 'Root Match',
      value: tampered ? '✘  MISMATCH' : '✔  CONFIRMED',
      cls: tampered ? 'invalid' : 'valid',
      statusCls: tampered ? 'err' : 'ok',
    },
    {
      label: 'Content Integrity',
      value: tampered ? '✘  CORRUPTED' : '✔  INTACT',
      cls: tampered ? 'invalid' : 'valid',
      statusCls: tampered ? 'err' : 'ok',
    },
    {
      label: 'Timestamp Skew',
      value: '⚠  NONE DETECTED',
      cls: 'warning',
      statusCls: 'warn',
    },
  ];

  return (
    <div>
      <div className="verify-grid">
        {checks.map(c => (
          <div key={c.label} className={`verify-card ${c.cls}`}>
            <div className="verify-label">{c.label}</div>
            <div className={`verify-status ${c.statusCls}`}>{c.value}</div>
          </div>
        ))}

        {/* Zero-Trust card (full width) */}
        <div className="verify-card special" style={{ gridColumn: '1 / -1' }}>
          <div className="verify-label">Zero-Trust Proof Source</div>
          <div className="verify-status info">
            🔒 &nbsp;DERIVED — Proof recomputed from raw logs, DB cache never trusted
          </div>
        </div>
      </div>

      {tampered && (
        <div className="tamper-alert">
          <AlertTriangle size={18} />
          <span>Root recomputed as <strong>0x!!INVALID</strong> — does not match anchored root <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{MERKLE_ROOT.slice(0,18)}…</span>. Batch is COMPROMISED.</span>
        </div>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────
export default function App() {
  const [step,        setStep]        = useState(1);
  const [logs,        setLogs]        = useState<Log[]>([]);
  const [batch,       setBatch]       = useState<BatchResult | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [selectedLeaf, setSelectedLeaf] = useState<string | null>(null);
  const [tampered,    setTampered]    = useState(false);
  const [verifying,   setVerifying]   = useState(false);
  const [anchored,    setAnchored]    = useState(false);
  const [anchor,      setAnchor]      = useState<AnchorResult | null>(null);
  const [anchoring,   setAnchoring]   = useState(false);

  const generateLogs = () => {
    setLogs(SAMPLE_LOGS);
    setTampered(false);
  };

  const triggerBatch = () => {
    setLoading(true);
    setTimeout(() => {
      setBatch({
        id: 'b-77a92f12-3c8d',
        merkle_root: MERKLE_ROOT,
        count: logs.length,
        processing_ms: 120,
        chain_hash: '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d',
      });
      setLoading(false);
      setStep(3);
    }, 1200);
  };

  const simulateTamper = () => {
    setTampered(true);
  };

  const runVerification = () => {
    setVerifying(true);
    setTimeout(() => {
      setVerifying(false);
      setStep(4);
    }, 900);
  };

  const commitBlockchain = () => {
    setAnchoring(true);
    setTimeout(() => {
      setAnchor({
        tx_hash: '0x0dd31a36ef69b851862da870bd6165cf164f353a31c69947fb5a907f785904f3',
        block_number: 10692769,
        explorer_url: 'https://sepolia.etherscan.io/tx/0x0dd31a36ef69b851862da870bd6165cf164f353a31c69947fb5a907f785904f3',
        timestamp: new Date().toISOString(),
      });
      setAnchored(true);
      setAnchoring(false);
      setStep(5);
    }, 2000);
  };

  const resetDemo = () => {
    setStep(1); setLogs([]); setBatch(null); setTampered(false);
    setSelectedLeaf(null); setAnchored(false); setAnchor(null);
  };

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="top-bar">
        <div className="logo">
          <div className="logo-icon"><Shield size={22} color="white" /></div>
          <span className="logo-text">Sea<span>Log</span> Engine</span>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div className="network-badge"><div className="dot" />Sepolia Testnet</div>
          <button className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={resetDemo}>
            <RefreshCw size={14} /> Reset Demo
          </button>
        </div>
      </header>

      <div className="main-layout">
        <StepTracker current={step} />

        {/* ── Step 1: Ingestion ── */}
        {step === 1 && (
          <section className="main-panel panel animate-in">
            <div className="panel-header">
              <h2 className="panel-title">Step 1 — Log Ingestion</h2>
              <p className="panel-subtitle">Gather untrusted server events into the SeaLog ingestion pipeline.</p>
            </div>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={generateLogs}>
                <Plus size={16} /> Generate 8 Sample Logs
              </button>
              {logs.length > 0 && (
                <button className="btn btn-ghost" onClick={() => setLogs([])}>Clear</button>
              )}
            </div>

            {logs.length > 0 ? (
              <>
                <div className="log-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th><th>Source</th><th>Level</th><th>Message</th>
                        <th>Event Time</th><th>Ingested At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map(l => (
                        <tr key={l.id}>
                          <td>{l.seq}</td>
                          <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{l.source}</td>
                          <td>
                            <span className={`badge ${{ INFO: 'badge-info', WARN: 'badge-warn', ERROR: 'badge-error' }[l.level]}`}>
                              {l.level}
                            </span>
                          </td>
                          <td>{l.message}</td>
                          <td className="mono">{l.event_time.slice(11, 23)}</td>
                          <td className="mono" style={{ color: 'var(--text-secondary)' }}>{l.ingested_at.slice(11, 23)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
                  <button className="btn btn-primary" onClick={() => setStep(2)}>
                    Next: Create Batch →
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <Activity size={52} className="empty-state-icon" />
                <p>Pipeline empty. Generate sample logs to begin the lifecycle demo.</p>
              </div>
            )}
          </section>
        )}

        {/* ── Step 2: Batching ── */}
        {step === 2 && (
          <section className="main-panel panel animate-in">
            <div className="panel-header">
              <h2 className="panel-title">Step 2 — Batch Creation</h2>
              <p className="panel-subtitle">Seal {logs.length} collected logs into a cryptographically immutable batch using Keccak-256.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '32px' }}>
              {[
                { label: 'Queued Logs', value: logs.length },
                { label: 'Hashing Algorithm', value: 'Keccak-256' },
                { label: 'Ordering Strategy', value: 'Deterministic (seq#)' },
                { label: 'Tree Depth', value: '4 levels' },
              ].map(i => (
                <div key={i.label} className="verify-card">
                  <div className="verify-label">{i.label}</div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', marginTop: '6px' }}>{i.value}</div>
                </div>
              ))}
            </div>

            <div className="btn-row">
              <button className="btn btn-primary glow" onClick={triggerBatch} disabled={loading}>
                {loading ? <><div className="spinner" /> Building Batch…</> : <><Play size={16} /> Trigger Batch</>}
              </button>
              <button className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button>
            </div>
          </section>
        )}

        {/* ── Step 3: Merkle Tree ── */}
        {step === 3 && batch && (
          <section className="main-panel panel animate-in">
            <div className="panel-header">
              <h2 className="panel-title">Step 3 — Merkle Tree</h2>
              <p className="panel-subtitle">
                Each log hashed to a leaf. Pairs combined up to the root. Click any leaf to trace its proof path.
              </p>
            </div>

            <div className="batch-summary" style={{ marginBottom: '24px', marginTop: 0 }}>
              <div className="info-grid">
                <div className="info-item"><label>Batch ID</label><span style={{ fontSize: '0.9rem' }}>{batch.id}</span></div>
                <div className="info-item"><label>Logs</label><span>{batch.count}</span></div>
                <div className="info-item"><label>Processed In</label><span>{batch.processing_ms}ms</span></div>
              </div>
              <div className="verify-label">Merkle Root</div>
              <div className="batch-root">{tampered ? '0x!!INVALID — root corrupted' : batch.merkle_root}</div>
            </div>

            <MerkleTree
              logs={logs}
              selectedLeaf={selectedLeaf}
              onSelectLeaf={setSelectedLeaf}
              tampered={tampered}
            />

            <div className="btn-row" style={{ marginTop: '28px', justifyContent: 'space-between' }}>
              <button className="btn btn-danger" onClick={simulateTamper} disabled={tampered}>
                <AlertTriangle size={16} /> Simulate Tamper
              </button>
              <div className="btn-row">
                <button className="btn btn-ghost" onClick={() => setStep(2)}>← Back</button>
                <button className="btn btn-primary" onClick={runVerification} disabled={verifying}>
                  {verifying ? <><div className="spinner" /> Verifying…</> : <>Run Verification →</>}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ── Step 4: Verification ── */}
        {step === 4 && (
          <section className="main-panel panel animate-in">
            <div className="panel-header">
              <h2 className="panel-title">Step 4 — Verification Dashboard</h2>
              <p className="panel-subtitle">
                {tampered
                  ? '⚠ Tamper simulation active. Verification FAILED — integrity breach detected.'
                  : 'All cryptographic checks passed. System integrity confirmed.'}
              </p>
            </div>

            <VerificationDashboard tampered={tampered} />

            <div className="btn-row" style={{ marginTop: '28px', justifyContent: 'space-between' }}>
              {tampered && (
                <button className="btn btn-ghost" onClick={() => { setTampered(false); setStep(3); }}>
                  ↩ Restore Integrity
                </button>
              )}
              <div className="btn-row" style={{ marginLeft: 'auto' }}>
                <button className="btn btn-ghost" onClick={() => setStep(3)}>← Back</button>
                {!tampered && (
                  <button className="btn btn-primary" onClick={() => setStep(5)}>
                    Commit Root to Blockchain →
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── Step 5: Blockchain ── */}
        {step === 5 && (
          <section className="main-panel panel animate-in">
            <div className="panel-header">
              <h2 className="panel-title">Step 5 — Commit Root to Blockchain</h2>
              <p className="panel-subtitle">
                Permanently anchor the Merkle root to Ethereum Sepolia, making it tamper-proof and publicly verifiable by anyone.
              </p>
            </div>

            {!anchor ? (
              <>
                <div className="verify-card" style={{ marginBottom: '24px', maxWidth: '500px' }}>
                  <div className="verify-label">Root to Commit</div>
                  <div className="mono" style={{ marginTop: '8px', wordBreak: 'break-all' }}>{batch?.merkle_root}</div>
                </div>
                <div className="verify-card" style={{ marginBottom: '24px', maxWidth: '500px' }}>
                  <div className="verify-label">Smart Contract</div>
                  <div className="mono" style={{ marginTop: '8px' }}>0x155B69bC572D14b35C2Bb6CbE874771688E8dED3</div>
                </div>

                <button className="btn btn-primary" onClick={commitBlockchain} disabled={anchoring}>
                  {anchoring
                    ? <><div className="spinner" /> Sending Transaction to Sepolia…</>
                    : <><Zap size={16} /> Commit Root to Blockchain</>}
                </button>
              </>
            ) : (
              <div className="anchor-card animate-in">
                <div style={{ color: 'var(--success)', fontWeight: 700, fontSize: '1.1rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle size={22} /> Root Successfully Committed to Sepolia
                </div>

                <div className="info-grid" style={{ marginBottom: '20px' }}>
                  <div className="info-item"><label>Block Number</label><span>{anchor.block_number}</span></div>
                  <div className="info-item"><label>Confirmations</label><span>1</span></div>
                  <div className="info-item"><label>Committed At</label><span style={{ fontSize: '0.9rem' }}>{anchor.timestamp.slice(0,19).replace('T', ' ')}</span></div>
                  <div className="info-item"><label>Proof Source</label><span style={{ fontSize: '0.85rem' }}>DERIVED ✓</span></div>
                </div>

                <div className="verify-label">Transaction Hash</div>
                <div className="batch-root">{anchor.tx_hash}</div>

                <div className="anchor-row" style={{ marginTop: '20px' }}>
                  <a className="anchor-link" href={anchor.explorer_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={16} /> View on Etherscan
                  </a>
                  <button className="btn btn-ghost" onClick={resetDemo}>
                    <RefreshCw size={14} /> Reset Demo
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Metrics Panel ── */}
        <MetricsPanel batch={batch} anchored={anchored} />
      </div>

      <footer style={{ padding: '20px 32px', borderTop: '1px solid var(--border-color)', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
        SeaLog Engine Dashboard · Tamper-Evident Logging System · Sepolia Testnet · 2026
      </footer>
    </div>
  );
}
