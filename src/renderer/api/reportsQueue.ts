import { apiClient } from './client';

export interface ReportJob {
  jobId: string;
  accountId: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  progress: number;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

export interface CoverageDay {
  date: string;
  profileId: string;
  hasData: boolean;
}

export interface ScheduleStatus {
  enabled: boolean;
  profiles: string[];
  nextRunAt?: string;
}

export interface ScheduleProfile {
  profileId: string;
  accountName: string;
  scheduled: boolean;
}

export interface AnalysisStats {
  totalTerms: number;
  unanalyzed: number;
  lastRunAt?: string;
}

export const reportsQueueApi = {
  startQueue(accounts: string[]): Promise<{ jobId: string }> {
    return apiClient.post<{ jobId: string }>(
      '/api/amazon-ads/reports/queue/start',
      { accounts, reportType: 'search_terms' },
    );
  },

  getActiveJobs(): Promise<ReportJob[]> {
    return apiClient.get<ReportJob[]>('/api/amazon-ads/reports/queue/active');
  },

  getJobStatus(jobId: string): Promise<ReportJob> {
    return apiClient.get<ReportJob>(`/api/amazon-ads/reports/queue/status/${jobId}`);
  },

  cancelJob(jobId: string): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>(
      `/api/amazon-ads/reports/queue/cancel/${jobId}`,
    );
  },

  getCoverage(): Promise<{ days: CoverageDay[] }> {
    return apiClient.get<{ days: CoverageDay[] }>('/api/amazon-ads/reports/coverage');
  },

  getScheduleStatus(): Promise<ScheduleStatus> {
    return apiClient.get<ScheduleStatus>('/api/amazon-ads/reports/schedule/status');
  },

  getScheduleProfiles(): Promise<ScheduleProfile[]> {
    return apiClient.get<ScheduleProfile[]>('/api/amazon-ads/reports/schedule/profiles');
  },

  setScheduleProfile(profileId: string, scheduled: boolean): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>(
      '/api/amazon-ads/reports/schedule/profiles',
      { profileId, scheduled },
    );
  },

  getAnalysisStats(): Promise<AnalysisStats> {
    return apiClient.get<AnalysisStats>('/api/amazon-ads/reports/analysis-stats');
  },

  runAnalysis(): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>('/api/amazon-ads/reports/analyze-on-demand');
  },
};
