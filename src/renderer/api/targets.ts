import { apiClient } from './client';

export type MatchType = 'exact' | 'phrase' | 'broad';
export type TargetState = 'enabled' | 'paused';
export type TargetType = 'keyword' | 'product';

export interface Target {
  id: number;
  ad_group_id: number;
  campaign_id?: number;
  // Для keyword targets — ключевая фраза. Для product targets — ASIN/category-id.
  keyword_text?: string;
  asin?: string;
  category?: string;
  match_type?: MatchType | 'asin' | 'category' | string;
  bid: number;
  state?: TargetState | string;
  created_at?: string;
}

// Один payload-объект для одного target. Backend принимает single-object POST.
export interface TargetCreatePayload {
  // Один из: keyword_text + match_type ИЛИ asin ИЛИ category.
  keyword_text?: string;
  asin?: string;
  category?: string;
  match_type?: MatchType | 'asin' | 'category';
  bid: number;
}

export interface TargetUpdate {
  bid?: number;
  state?: TargetState;
  match_type?: MatchType;
}

export const targetsApi = {
  listByAdGroup(adGroupId: number): Promise<Target[]> {
    return apiClient.get<Target[]>(`/api/ad-groups/${adGroupId}/targets`);
  },

  listByCampaign(campaignId: number): Promise<Target[]> {
    return apiClient.get<Target[]>(`/api/campaigns/${campaignId}/targets`);
  },

  create(adGroupId: number, data: TargetCreatePayload): Promise<{ id: number }> {
    return apiClient.post<{ id: number }>(
      `/api/ad-groups/${adGroupId}/targets`,
      data,
    );
  },

  // Удобный wrapper: создать пачку keyword-targets с одинаковым match_type и bid.
  // Возвращает массив результатов (успехи + ошибки) — caller сам решает что с этим делать.
  async createKeywordsBulk(
    adGroupId: number,
    keywords: string[],
    matchType: MatchType,
    bid: number,
  ): Promise<Array<{ keyword: string; ok: boolean; error?: string }>> {
    const results: Array<{ keyword: string; ok: boolean; error?: string }> = [];
    for (const kw of keywords) {
      try {
        await targetsApi.create(adGroupId, {
          keyword_text: kw,
          match_type: matchType,
          bid,
        });
        results.push({ keyword: kw, ok: true });
      } catch (err) {
        results.push({
          keyword: kw,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return results;
  },

  update(id: number, data: TargetUpdate): Promise<{ message: string }> {
    return apiClient.put<{ message: string }>(`/api/targets/${id}`, data);
  },
};
