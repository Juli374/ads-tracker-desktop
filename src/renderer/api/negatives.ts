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

  // Bulk-добавление: backend принимает { keywords: string[], match_type }.
  // Используется в AddCampaignModal wizard и расширенной NegativesPage.
  addBulkToCampaign(
    campaignId: number,
    keywords: string[],
    matchType: NegativeMatchType,
  ) {
    return apiClient.post<{ success: boolean; results?: unknown[] }>(
      `/api/campaigns/${campaignId}/negatives`,
      { keywords, match_type: matchType },
    );
  },

  addBulkToAdGroup(
    adGroupId: number,
    keywords: string[],
    matchType: NegativeMatchType,
  ) {
    return apiClient.post<{ success: boolean; results?: unknown[] }>(
      `/api/ad-groups/${adGroupId}/negatives`,
      { keywords, match_type: matchType },
    );
  },

  delete(negativeId: number) {
    return apiClient.del<{ success: boolean }>(
      `/api/negatives/${negativeId}`,
    );
  },
};
