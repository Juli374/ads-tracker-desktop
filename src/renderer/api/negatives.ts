import { apiClient } from './client';

export type NegativeMatchType = 'Exact' | 'Phrase';

export interface Negative {
  id: number;
  keyword_text: string;
  match_type: NegativeMatchType | string;
  campaign_id?: number;
  date_added?: string;
  created_at?: string;
  state?: string;
}

export const negativesApi = {
  listByCampaign(campaignId: number): Promise<Negative[]> {
    return apiClient.get<Negative[]>(`/api/campaigns/${campaignId}/negatives`);
  },

  add(
    campaignId: number,
    keyword: string,
    matchType: NegativeMatchType,
    syncToAmazon = true,
  ) {
    return apiClient.post<{ success: boolean; results?: unknown[] }>(
      `/api/campaigns/${campaignId}/negatives`,
      { keyword, match_type: matchType, sync_to_amazon: syncToAmazon },
    );
  },

  delete(negativeId: number) {
    return apiClient.del<{ success: boolean }>(
      `/api/negatives/${negativeId}`,
    );
  },
};
