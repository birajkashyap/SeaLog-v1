import type {
  Batch,
  BatchTriggerResponse,
  BatchVerificationResult,
  HealthResponse,
  IngestRequest,
  IngestResponse,
  VerificationResult,
} from '../types/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = payload?.error || payload?.message || `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export const api = {
  health: () => request<HealthResponse>('/health'),

  ingestBatch: (logs: IngestRequest[]) =>
    request<{ logs: IngestResponse[] }>('/api/v1/logs/ingest-batch', {
      method: 'POST',
      body: JSON.stringify({ logs }),
    }),

  triggerBatch: () =>
    request<BatchTriggerResponse>('/api/v1/admin/batch/trigger', {
      method: 'POST',
    }),

  getBatch: (batchId: string) => request<Batch>(`/api/v1/batch/${batchId}`),

  verifyBatch: (batchId: string) =>
    request<BatchVerificationResult>(`/api/v1/verify/batch/${batchId}`),

  verifyLog: (logId: string) =>
    request<VerificationResult>(`/api/v1/verify/log/${logId}`),

  simulateTamper: (logId: string) =>
    request<{ success: boolean; message: string }>(`/api/v1/admin/simulate-tamper/${logId}`, {
      method: 'POST',
    }),
};
