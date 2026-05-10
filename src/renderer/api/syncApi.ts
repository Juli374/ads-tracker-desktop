import { apiClient } from './client';

export type SyncOption =
  | 'campaigns'
  | 'ad_groups'
  | 'keywords'
  | 'product_targets'
  | 'negatives'
  | 'sb';

export type SyncJobStatus = {
  jobId: string;
  accountId: string;
  country: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  progress: number;
  error?: string;
  startedAt: string;
  completedAt?: string;
};

export type StartSyncResponse = {
  jobId: string;
  message?: string;
};

export const syncApi = {
  start(body: {
    accounts: string[];
    countries: string[];
    options: SyncOption[];
  }): Promise<StartSyncResponse> {
    return apiClient.post<StartSyncResponse>('/api/amazon-ads/sync/start', body);
  },

  getStatus(jobId: string): Promise<SyncJobStatus> {
    return apiClient.get<SyncJobStatus>(`/api/amazon-ads/sync/status/${jobId}`);
  },

  active(): Promise<SyncJobStatus[]> {
    return apiClient.get<SyncJobStatus[]>('/api/amazon-ads/sync/active');
  },

  cancel(jobId: string): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>(`/api/amazon-ads/sync/cancel/${jobId}`);
  },
};
