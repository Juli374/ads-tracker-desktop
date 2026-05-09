import { apiClient } from './client';

export interface RoyaltyAccount {
  id: number;
  name: string;
  marketplace?: string;
  currency?: string;
}

export interface RoyaltyUpload {
  id: number;
  account_id: number;
  account_name?: string;
  marketplace: string;
  target_month: string;
  uploaded_at: string;
  total_units?: number;
  total_royalty?: number;
  total_revenue?: number;
}

export interface RoyaltySummary {
  target_month: string;
  // Полная shape различается по бэкендам — оставляем как Record.
  totals?: Record<string, number | undefined>;
  by_book?: Array<Record<string, unknown>>;
}

export const royaltiesApi = {
  listUploads(): Promise<RoyaltyUpload[]> {
    return apiClient.get<RoyaltyUpload[]>('/api/royalties/uploads');
  },

  listAccounts(): Promise<RoyaltyAccount[]> {
    return apiClient.get<RoyaltyAccount[]>('/api/royalties/accounts');
  },

  getSummary(targetMonth: string): Promise<RoyaltySummary> {
    return apiClient.get<RoyaltySummary>(`/api/royalties/summary/${targetMonth}`);
  },
};
