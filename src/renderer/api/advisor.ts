import { apiClient } from './client';

export interface AdvisorMessage {
  id: number | string;
  role: 'user' | 'assistant' | string;
  content: string;
  modelUsed?: string | null;
  createdAt?: string;
}

export interface AdvisorHistory {
  conversationId: number | null;
  messages: AdvisorMessage[];
}

export const advisorApi = {
  getHistory(campaignId: number | string): Promise<AdvisorHistory> {
    return apiClient.get<AdvisorHistory>(
      `/api/ai-advisor/campaign/${campaignId}/history`,
    );
  },

  clearHistory(campaignId: number | string): Promise<{ message: string }> {
    return apiClient.del<{ message: string }>(
      `/api/ai-advisor/campaign/${campaignId}/history`,
    );
  },
};
