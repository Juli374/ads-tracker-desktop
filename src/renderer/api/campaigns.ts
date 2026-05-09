import { apiClient } from './client';

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
};
