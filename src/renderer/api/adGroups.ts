import { apiClient } from './client';

export type AdGroupState = 'enabled' | 'paused';

export interface AdGroup {
  id: number;
  campaign_id: number;
  name: string;
  default_bid: number;
  state?: AdGroupState | string;
  created_at?: string;
}

export interface AdGroupCreate {
  name: string;
  default_bid: number;
}

export interface AdGroupUpdate {
  name?: string;
  default_bid?: number;
  state?: AdGroupState;
}

export const adGroupsApi = {
  listByCampaign(campaignId: number): Promise<AdGroup[]> {
    return apiClient.get<AdGroup[]>(`/api/campaigns/${campaignId}/ad-groups`);
  },

  get(id: number): Promise<AdGroup> {
    return apiClient.get<AdGroup>(`/api/ad-groups/${id}`);
  },

  create(campaignId: number, data: AdGroupCreate): Promise<{ id: number; message?: string }> {
    return apiClient.post<{ id: number; message?: string }>(
      `/api/campaigns/${campaignId}/ad-groups`,
      data,
    );
  },

  update(id: number, data: AdGroupUpdate): Promise<{ message: string }> {
    return apiClient.put<{ message: string }>(`/api/ad-groups/${id}`, data);
  },

  delete(id: number): Promise<{ message?: string }> {
    return apiClient.del<{ message?: string }>(`/api/ad-groups/${id}`);
  },
};
