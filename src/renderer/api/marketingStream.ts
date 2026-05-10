import { apiClient } from './client';

export interface StreamSyncStatus {
  lastRunAt?: string;
  nextRunAt?: string;
  isRunning: boolean;
}

export interface StreamSyncStats {
  totalEvents: number;
  last24h: number;
  last7d: number;
  byMessageType: Record<string, number>;
}

export interface StreamSyncRun {
  id: string;
  startedAt: string;
  completedAt?: string;
  status: 'success' | 'failed' | 'running';
  eventsProcessed: number;
  error?: string;
}

export interface StreamSyncHistory {
  runs: StreamSyncRun[];
}

export interface StreamAuditEntry {
  timestamp: string;
  action: string;
  actor: string;
  details?: string;
}

export interface StreamSyncAudit {
  entries: StreamAuditEntry[];
}

export const marketingStreamApi = {
  getStatus(): Promise<StreamSyncStatus> {
    return apiClient.get<StreamSyncStatus>('/api/marketing-stream/sync/status');
  },
  getStats(): Promise<StreamSyncStats> {
    return apiClient.get<StreamSyncStats>('/api/marketing-stream/sync/stats');
  },
  getHistory(): Promise<StreamSyncHistory> {
    return apiClient.get<StreamSyncHistory>('/api/marketing-stream/sync/history');
  },
  getAudit(): Promise<StreamSyncAudit> {
    return apiClient.get<StreamSyncAudit>('/api/marketing-stream/sync/audit');
  },
};
