import { apiClient } from './client';

export interface AmazonAdsProfile {
  profile_id: string;
  country_code: string;
  marketplace_id?: string;
  account_name?: string;
  account_type?: string;
  currency_code?: string;
  daily_budget?: number;
  // Backend на разных деплоях возвращает разный shape — оставляем рекордом.
  [k: string]: unknown;
}

export interface AmazonAdsTokenInfo {
  has_refresh_token: boolean;
  expires_at?: string | null;
  scope?: string | null;
  region?: string | null;
}

export interface OAuthAuthorizeResponse {
  url: string;
  state: string;
}

export interface OAuthConfig {
  client_id?: string;
  redirect_uri?: string;
  scope?: string;
}

export const amazonAdsApi = {
  getProfiles(): Promise<AmazonAdsProfile[]> {
    return apiClient.get<AmazonAdsProfile[]>('/api/amazon-ads/profiles');
  },

  syncProfiles(): Promise<{ message: string; count?: number }> {
    return apiClient.post<{ message: string; count?: number }>(
      '/api/amazon-ads/sync/profiles',
    );
  },

  getTokenInfo(): Promise<AmazonAdsTokenInfo> {
    return apiClient.get<AmazonAdsTokenInfo>('/api/amazon-ads/token-info');
  },

  refreshToken(): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>('/api/amazon-ads/refresh-token');
  },

  // Запускает OAuth — backend возвращает URL для открытия в браузере.
  // redirect_uri теперь HTTPS-страница (https://kdpbook.click/callback),
  // которая re-emit'ит deep-link ads-tracker-desktop://callback обратно в апп.
  // Бэкенд отдаёт ключ `auth_url` (oauth.py:140); интерфейс обещает `url`,
  // поэтому нормализуем здесь: url ?? auth_url. Без этого openExternal(undefined)
  // падает и браузер не открывается.
  startOAuth(redirectUri: string): Promise<OAuthAuthorizeResponse> {
    return apiClient
      .post<{ auth_url?: string; url?: string; state: string }>(
        '/api/amazon-ads/oauth/authorize',
        { redirect_uri: redirectUri },
      )
      .then((r) => ({ url: r.url ?? r.auth_url ?? '', state: r.state }));
  },

  // Завершает OAuth: передаём code+state, backend меняет на refresh-token.
  completeOAuth(
    code: string,
    state: string,
    redirectUri: string,
  ): Promise<{ message: string; profiles_count?: number }> {
    return apiClient.post<{ message: string; profiles_count?: number }>(
      '/api/amazon-ads/oauth/callback',
      { code, state, redirect_uri: redirectUri },
    );
  },

  // ==========================================================================
  // Campaign live-edit (uses local campaign id, backend translates to amzn id).
  // Optimistic: caller updates local state immediately, reverts on rejection.
  // ==========================================================================

  setCampaignState(
    campaignId: number,
    state: 'enabled' | 'paused',
  ): Promise<{ message: string }> {
    return apiClient.put<{ message: string }>(
      `/api/amazon-ads/campaigns/${campaignId}/state`,
      { state },
    );
  },

  setCampaignBudget(
    campaignId: number,
    budget: number,
  ): Promise<{ message: string }> {
    return apiClient.put<{ message: string }>(
      `/api/amazon-ads/campaigns/${campaignId}/budget`,
      { budget },
    );
  },

  setCampaignBiddingStrategy(
    campaignId: number,
    biddingStrategy:
      | 'Fixed bids'
      | 'Dynamic bids - down only'
      | 'Dynamic bids - up and down',
  ): Promise<{ message: string }> {
    return apiClient.put<{ message: string }>(
      `/api/amazon-ads/campaigns/${campaignId}/bidding-strategy`,
      { bidding_strategy: biddingStrategy },
    );
  },

  // ==========================================================================
  // Targets bulk operations
  // ==========================================================================

  setTargetState(
    targetId: number,
    state: 'enabled' | 'paused',
  ): Promise<{ message: string }> {
    return apiClient.put<{ message: string }>(
      `/api/amazon-ads/targets/${targetId}/state`,
      { state },
    );
  },

  // Меняет ставку через Amazon API (backend сам транслирует local id → amzn id
  // и вызывает Amazon Ads, затем обновляет local DB). В отличие от
  // targetsApi.update() — это НЕ local-only: правка реально доходит до Amazon,
  // поэтому следующий pull-sync её не откатывает. backend gate: can_manage_bids.
  setTargetBid(
    targetId: number,
    bid: number,
  ): Promise<{ message: string }> {
    return apiClient.put<{ message: string }>(
      `/api/amazon-ads/targets/${targetId}/bid`,
      { bid },
    );
  },

  bulkUpdateTargets(payload: {
    target_ids: number[];
    state?: 'enabled' | 'paused';
    bid_multiplier?: number;
    bid?: number;
  }): Promise<{ updated: number; message?: string }> {
    return apiClient.post<{ updated: number; message?: string }>(
      '/api/amazon-ads/targets/bulk-update',
      payload,
    );
  },
};
