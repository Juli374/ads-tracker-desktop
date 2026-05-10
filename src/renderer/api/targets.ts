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

  // ==========================================================================
  // Bulk operations (Phase J.2 Lane B)
  //
  // Backend endpoints accept { target_ids: number[], <op-specific fields> }
  // and return { updated: number; message?: string } shape so caller can
  // surface "Updated N targets" in toast.
  //
  // If a future backend deploy doesn't have one of these endpoints yet, the
  // POST will return 404 and ApiError.code = 'SERVER' — caller's catch
  // surfaces user-friendly toast. We deliberately don't fall back to per-id
  // PUTs here: if backend doesn't support bulk yet, that's a data-integrity
  // call (do all-or-nothing) the user should see.
  // ==========================================================================

  bulkPause(targetIds: number[]): Promise<{ updated: number; message?: string }> {
    return apiClient.post<{ updated: number; message?: string }>(
      '/api/targets/bulk-pause',
      { target_ids: targetIds },
    );
  },

  bulkResume(targetIds: number[]): Promise<{ updated: number; message?: string }> {
    return apiClient.post<{ updated: number; message?: string }>(
      '/api/targets/bulk-resume',
      { target_ids: targetIds },
    );
  },

  // multiplier: e.g. 0.8 → bid × 0.8, 1.1 → bid × 1.1
  // delta: e.g. 0.05 → bid + 0.05, -0.05 → bid - 0.05
  // Передавай ровно одно из двух полей. Backend применяет соответствующее
  // преобразование атомарно.
  bulkUpdateBid(
    targetIds: number[],
    op: { multiplier: number } | { delta: number },
  ): Promise<{ updated: number; message?: string }> {
    return apiClient.post<{ updated: number; message?: string }>(
      '/api/targets/bulk-update-bid',
      { target_ids: targetIds, ...op },
    );
  },

  bulkMove(
    targetIds: number[],
    adGroupId: number,
  ): Promise<{ updated: number; message?: string }> {
    return apiClient.post<{ updated: number; message?: string }>(
      '/api/targets/bulk-move',
      { target_ids: targetIds, ad_group_id: adGroupId },
    );
  },

  // listId — добавить в указанный negative-list (cross-campaign).
  // campaignId — добавить как campaign-level negative.
  // Передавай ровно одно из двух полей. matchType по умолчанию 'exact'.
  bulkAddNegative(
    targetIds: number[],
    target: { listId: number } | { campaignId: number },
    matchType: 'exact' | 'phrase' = 'exact',
  ): Promise<{ added: number; message?: string }> {
    const payload: Record<string, unknown> = {
      target_ids: targetIds,
      match_type: matchType,
    };
    if ('listId' in target) payload.list_id = target.listId;
    else payload.campaign_id = target.campaignId;
    return apiClient.post<{ added: number; message?: string }>(
      '/api/targets/bulk-add-negative',
      payload,
    );
  },
};
