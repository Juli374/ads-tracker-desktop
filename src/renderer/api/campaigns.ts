import { ApiError, apiClient } from './client';

export type CampaignState = 'enabled' | 'paused';

// Уровни кампаний поддерживаемые backend'ом.
export type CampaignType = 'sp' | 'sb' | 'sd';
export type TargetingType = 'auto' | 'manual';
export type BiddingStrategy =
  | 'Fixed bids'
  | 'Dynamic bids - down only'
  | 'Dynamic bids - up and down';

export interface CampaignCreate {
  name: string;
  campaign_type: CampaignType;
  targeting_type: TargetingType;
  budget: number;
  bidding_strategy?: BiddingStrategy;
  // Placement bid adjustments в процентах (0..900 для up-and-down, 0 для остальных)
  top_of_search?: number;
  product_pages?: number;
  rest_of_search?: number;
}

export interface CampaignUpdate {
  state?: CampaignState;
  budget?: number;
  name?: string;
  bidding_strategy?: BiddingStrategy;
  top_of_search?: number;
  product_pages?: number;
  rest_of_search?: number;
}

// Phase J.2 Lane B — per-week placement breakdown.
// Backend (если выкатан endpoint) возвращает массив недель с разбивкой
// по top_of_search / product_pages / rest_of_search. Если endpoint ещё не
// существует, getPlacementHistory вернёт null — caller рендерит только
// текущие модификаторы без chart.
export interface PlacementWeekRow {
  week_start: string;
  week_end: string;
  week_label?: string;
  is_current?: boolean;
  top_of_search?: { impressions: number; clicks: number; cost: number; sales: number; orders: number; acos: number; ctr?: number; percent?: number };
  product_pages?: { impressions: number; clicks: number; cost: number; sales: number; orders: number; acos: number; ctr?: number; percent?: number };
  rest_of_search?: { impressions: number; clicks: number; cost: number; sales: number; orders: number; acos: number; ctr?: number; percent?: number };
}

export interface PlacementHistoryResponse {
  campaign_id: number;
  weeks: PlacementWeekRow[];
}

export const campaignsApi = {
  // POST /api/asins/:asinId/campaigns — создать кампанию для ASIN.
  // asinId, не bookId — backend требует именно ASIN-id (книга → ASIN per MP).
  create(asinId: number, data: CampaignCreate): Promise<{ id: number; message?: string }> {
    return apiClient.post<{ id: number; message?: string }>(
      `/api/asins/${asinId}/campaigns`,
      data,
    );
  },

  // PUT /api/campaigns/:id — обычное обновление без истории.
  update(campaignId: number, data: CampaignUpdate): Promise<{ message: string }> {
    return apiClient.put<{ message: string }>(`/api/campaigns/${campaignId}`, data);
  },

  // GET /api/campaigns/:id/placement-history — per-week placement breakdown.
  // Graceful 404: если backend не выкатан, возвращаем null — UI рендерит
  // только текущие модификаторы без chart. Все остальные ошибки (5xx,
  // network) пробрасываются как ApiError, чтобы caller мог toast'нуть.
  async getPlacementHistory(campaignId: number): Promise<PlacementHistoryResponse | null> {
    try {
      return await apiClient.get<PlacementHistoryResponse>(
        `/api/campaigns/${campaignId}/placement-history`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },
};
