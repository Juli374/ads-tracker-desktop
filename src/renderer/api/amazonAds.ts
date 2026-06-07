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
    state: 'enabled' | 'paused' | 'ENABLED' | 'PAUSED',
  ): Promise<{ message: string }> {
    // Backend requires UPPERCASE state (forwarded raw to Amazon; lowercase is
    // rejected with 400). Normalize here so callers can keep passing lowercase.
    return apiClient.put<{ message: string }>(
      `/api/amazon-ads/campaigns/${campaignId}/state`,
      { state: state.toUpperCase() },
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
    state: 'enabled' | 'paused' | 'ENABLED' | 'PAUSED',
  ): Promise<{ message: string }> {
    // Backend requires UPPERCASE state (forwarded raw to Amazon; lowercase is
    // rejected with 400). Normalize here so callers can keep passing lowercase.
    return apiClient.put<{ message: string }>(
      `/api/amazon-ads/targets/${targetId}/state`,
      { state: state.toUpperCase() },
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

  // ──────────────────────────────────────────────────────────────────────
  // Bulk target bid/state → Amazon (batched).
  //
  // Real backend route: POST /api/amazon-ads/targets/bulk-update
  //   body { updates: [{ target_id, bid?, state? }] }
  //   - bid is ABSOLUTE (no multiplier/delta server-side — resolveBids.ts
  //     turns multiply/delta into absolute before calling here).
  //   - state MUST be uppercase ENABLED/PAUSED/ARCHIVED (forwarded raw to
  //     Amazon; lowercase is silently rejected per-item). See resolveBids.normState.
  //   - per-item: successes land in `results`, failures in `errors`.
  //     `success:true` is returned even when every item failed — caller MUST
  //     branch on `failed`/`errors`, never the top-level `success` flag.
  // backend gate: can_manage_bids.
  setTargetBidsBatch(
    updates: Array<{ target_id: number; bid?: number; state?: 'ENABLED' | 'PAUSED' | 'ARCHIVED' }>,
  ): Promise<BulkUpdateResponse> {
    return apiClient.post<BulkUpdateResponse>(
      '/api/amazon-ads/targets/bulk-update',
      { updates },
    );
  },
};

// Real response shape of POST /api/amazon-ads/targets/bulk-update
// (backend updates.py:1076,1159-1166). NOTE: results[] has NO `ok` field —
// presence in `results` == success, presence in `errors` == failure.
export interface BulkUpdateResultItem {
  target_id: number;
  old_bid: number | null;
  new_bid: number | null;
  old_status: string;
  new_state: string | null;
  campaign_id: number;
  name: string;
}
export interface BulkUpdateErrorItem {
  target_id: number;
  error: string;
  deleted?: boolean;
}
export interface BulkUpdateResponse {
  success: boolean;   // "route ran" — NOT "all succeeded". Never branch on this.
  total: number;
  succeeded: number;
  failed: number;
  results: BulkUpdateResultItem[];
  errors: BulkUpdateErrorItem[];
}
