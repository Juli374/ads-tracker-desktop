import { apiClient } from './client';

export type CampaignState = 'enabled' | 'paused';

export interface CampaignUpdate {
  state?: CampaignState;
  budget?: number;
}

export const campaignsApi = {
  // PUT /api/campaigns/:id — обычное обновление без истории.
  update(campaignId: number, data: CampaignUpdate): Promise<{ message: string }> {
    return apiClient.put<{ message: string }>(`/api/campaigns/${campaignId}`, data);
  },
};
