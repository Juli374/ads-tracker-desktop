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
  // redirect_uri должен указывать на ads-tracker-desktop://callback.
  startOAuth(redirectUri: string): Promise<OAuthAuthorizeResponse> {
    return apiClient.post<OAuthAuthorizeResponse>(
      '/api/amazon-ads/oauth/authorize',
      { redirect_uri: redirectUri },
    );
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
};
