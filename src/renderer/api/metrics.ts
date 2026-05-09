import { apiClient, ApiError } from './client';

// ============================================================================
// Books summary (used by Dashboard, BooksPage)
// ============================================================================

export interface BookMetric {
  book_id: number;
  title: string;
  cover_image: string | null;
  account: string | null;
  marketplace: string | null;
  currency: string;
  impressions: number;
  clicks: number;
  cost: number;
  sales: number;
  orders: number;
  ctr: number;
  cpc: number;
  acos: number;
  royalty: number;
  total_royalty?: number;
  royalty_local?: number;
  royalty_currency?: string;
  paperback_royalty?: number;
  paperback_orders?: number;
  organic_orders?: number;
  profit: number;
  be_acos?: number | null;
  tacos?: number;
  roas?: number;
}

export interface BookSummary {
  date_from: string;
  date_to: string;
  attribution_window: string;
  books: BookMetric[];
  error?: string;
}

// ============================================================================
// Campaign summary
// ============================================================================

export interface CampaignAnalyticsItem {
  campaign_id: number;
  amazon_campaign_id: string;
  campaign_name: string;
  campaign_type: string;
  targeting_type: string;
  status?: string;
  book_id: number;
  book_title: string;
  book_cover: string | null;
  marketplace: string;
  currency: string;
  impressions: number;
  clicks: number;
  cost: number;
  sales: number;
  orders: number;
  ctr: number;
  cpc: number;
  cr: number;
  acos: number;
  profit: number;
  be_acos?: number | null;
}

export interface CampaignSummary {
  date_from: string;
  date_to: string;
  attribution_window: string;
  campaigns: CampaignAnalyticsItem[];
  total_count: number;
  error?: string;
}

// ============================================================================
// Daily / Weekly summary (Reports)
// ============================================================================

export interface DailySummaryMetric {
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
  ctr: number;
  cpc: number;
  cr: number;
  acos: number;
  roi: number;
  royalty: number | null;
  total_royalty?: number;
  profit: number | null;
  tacos?: number;
  roas?: number;
}

export interface DailySummary {
  date_from: string;
  date_to: string;
  attribution_window: string;
  daily: DailySummaryMetric[];
  error?: string;
}

export interface WeeklySummaryMetric {
  week_start: string;
  week_end: string;
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
  ctr: number;
  cpc: number;
  cr: number;
  acos: number;
  roi: number;
  royalty: number | null;
  total_royalty?: number;
  profit: number | null;
  tacos?: number;
  roas?: number;
}

export interface WeeklySummary {
  date_from: string;
  date_to: string;
  attribution_window: string;
  weekly: WeeklySummaryMetric[];
  error?: string;
}

// ============================================================================
// Keyword summary (KeywordsPage)
// ============================================================================

export interface KeywordAnalyticsItem {
  keyword_id: string;
  keyword_text: string;
  match_type: string;
  target_type: 'keyword' | 'auto' | 'product' | string;
  campaign_id: number;
  campaign_name: string;
  ad_group_id: number | null;
  ad_group_name: string | null;
  book_id: number;
  book_title: string;
  book_cover: string | null;
  marketplace: string;
  currency: string;
  target_id: number | null;
  bid: number | null;
  status: string;
  impressions: number;
  clicks: number;
  cost: number;
  sales: number;
  orders: number;
  ctr: number;
  cpc: number;
  cr: number;
  acos: number;
  profit: number;
  be_acos?: number | null;
}

export interface KeywordSummary {
  date_from: string;
  date_to: string;
  attribution_window: string;
  keywords: KeywordAnalyticsItem[];
  total_count: number;
  error?: string;
}

// ============================================================================
// Marketplace summary
// ============================================================================

export interface MarketplaceMetric {
  impressions: number;
  clicks: number;
  cost: number;
  sales: number;
  orders: number;
  ctr: number;
  cpc: number;
  cr: number;
  acos: number;
  royalty: number;
  profit: number;
  tacos?: number;
  roas?: number;
}

export interface MarketplaceSummary {
  date_from: string;
  date_to: string;
  attribution_window: string;
  marketplaces: { [key: string]: MarketplaceMetric };
  error?: string;
}

// ============================================================================
// Overview / KPIs with period-over-period comparison (Dashboard hero)
// ============================================================================

export interface PeriodMetrics {
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
  acos: number;
  roi: number;
  ctr: number;
  royalty: number;
  profit: number;
  paperback_orders?: number;
  organic_orders?: number;
  tacos?: number;
  roas?: number;
}

export interface MetricChanges {
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
  acos: number;
  roi: number;
  ctr: number;
  royalty: number;
  profit: number;
  tacos?: number;
  roas?: number;
}

export interface OverviewMetrics {
  date_from: string;
  date_to: string;
  prev_date_from: string;
  prev_date_to: string;
  attribution_window: string;
  current_period: PeriodMetrics;
  previous_period: PeriodMetrics;
  changes: MetricChanges;
  error?: string;
}

// ============================================================================
// Top performers (winners + losers) — Dashboard
// ============================================================================

export interface BookPerformerItem {
  id: number;
  title: string;
  cover_image: string | null;
  profit: number;
  spend: number;
  sales: number;
  orders: number;
  acos: number;
}

export interface CampaignPerformerItem {
  id: number;
  name: string;
  book_title: string;
  marketplace: string;
  campaign_type: string;
  profit: number;
  spend: number;
  sales: number;
  orders: number;
  acos: number;
}

export interface TopPerformersData {
  date_from: string;
  date_to: string;
  attribution_window: string;
  books: { winners: BookPerformerItem[]; losers: BookPerformerItem[] };
  campaigns: { winners: CampaignPerformerItem[]; losers: CampaignPerformerItem[] };
  error?: string;
}

// ============================================================================
// Alerts (Dashboard widget + Alerts page)
// ============================================================================

export interface AlertItem {
  id: number | string;
  severity: 'critical' | 'warning' | 'info' | string;
  title: string;
  message: string;
  // Optional contextual links
  book_id?: number;
  campaign_id?: number;
  link_to?: string;
  created_at?: string;
}

export interface AlertsResponse {
  alerts: AlertItem[];
  count?: number;
  error?: string;
}

// ============================================================================
// Organic vs Paid (Dashboard)
// ============================================================================

export interface OrganicTotalRow {
  marketplace: string;
  organic_orders: number;
  paid_orders: number;
  total_orders: number;
  organic_share?: number;
  paid_share?: number;
}

export interface OrganicTotalSummary {
  date_from: string;
  date_to: string;
  attribution_window: string;
  total_organic_orders: number;
  total_paid_orders: number;
  total_orders: number;
  marketplaces: OrganicTotalRow[];
  error?: string;
}

// ============================================================================
// Hourly dynamics (CampaignDetails)
// ============================================================================

export interface HourlyMetric {
  hour: string; // ISO timestamp or "YYYY-MM-DD HH:00"
  impressions: number;
  clicks: number;
  spend: number;
  sales?: number;
  orders?: number;
  acos?: number;
}

export interface HourlyResponse {
  date_from?: string;
  date_to?: string;
  attribution_window?: string;
  hourly: HourlyMetric[];
  error?: string;
}

// ============================================================================
// Campaign-scoped Search Terms (CampaignDetails embed)
// ============================================================================

export interface CampaignSearchTermItem {
  search_term: string;
  match_type?: string;
  impressions: number;
  clicks: number;
  cost: number;
  sales: number;
  orders: number;
  ctr?: number;
  acos?: number;
}

export interface CampaignSearchTermsResponse {
  date_from?: string;
  date_to?: string;
  items: CampaignSearchTermItem[];
  error?: string;
}

// ============================================================================
// Campaign all-changes (history tab)
// ============================================================================

export interface CampaignChange {
  id?: number | string;
  date: string; // YYYY-MM-DD or ISO
  field?: string;
  from_value?: string | number | null;
  to_value?: string | number | null;
  author?: string;
  note?: string;
}

export interface CampaignAllChangesResponse {
  changes: CampaignChange[];
  error?: string;
}

// ============================================================================
// Common types
// ============================================================================

export type Attribution = '1d' | '7d' | '14d' | '30d';

export interface RangeParams {
  from?: string;
  to?: string;
  attribution?: Attribution;
}

export interface BookFilters {
  marketplace?: string;
  marketplaces?: string[];
  bookIds?: number[];
  accounts?: string[];
}

function buildSummaryQuery(
  params: RangeParams & BookFilters,
): Record<string, string | number | boolean | string[] | undefined> {
  return {
    from: params.from,
    to: params.to,
    attribution: params.attribution ?? '7d',
    marketplace: params.marketplace,
    'accounts[]': params.accounts,
    'marketplaces[]': params.marketplaces,
    'book_ids[]': params.bookIds?.map(String),
  };
}

// ============================================================================
// API
// ============================================================================

export const metricsApi = {
  summaryByBook(params: RangeParams & BookFilters = {}): Promise<BookSummary> {
    return apiClient.get<BookSummary>(
      '/api/metrics/summary/by-book',
      buildSummaryQuery(params),
    );
  },

  summaryByCampaign(
    params: RangeParams & BookFilters & { activeOnly?: boolean } = {},
  ): Promise<CampaignSummary> {
    return apiClient.get<CampaignSummary>('/api/metrics/summary/by-campaign', {
      ...buildSummaryQuery(params),
      active_only: params.activeOnly ? 'true' : undefined,
    });
  },

  summaryByMarketplace(
    params: RangeParams & BookFilters = {},
  ): Promise<MarketplaceSummary> {
    return apiClient.get<MarketplaceSummary>(
      '/api/metrics/summary/by-marketplace',
      buildSummaryQuery(params),
    );
  },

  summaryDaily(params: RangeParams & BookFilters = {}): Promise<DailySummary> {
    return apiClient.get<DailySummary>(
      '/api/metrics/summary/daily',
      buildSummaryQuery(params),
    );
  },

  summaryWeekly(
    params: RangeParams & BookFilters = {},
  ): Promise<WeeklySummary> {
    return apiClient.get<WeeklySummary>(
      '/api/metrics/summary/weekly',
      buildSummaryQuery(params),
    );
  },

  overview(params: RangeParams & BookFilters = {}): Promise<OverviewMetrics> {
    return apiClient.get<OverviewMetrics>(
      '/api/metrics/summary/overview',
      buildSummaryQuery(params),
    );
  },

  topPerformers(
    params: RangeParams & BookFilters & { limit?: number } = {},
  ): Promise<TopPerformersData> {
    return apiClient.get<TopPerformersData>(
      '/api/metrics/summary/top-performers',
      {
        ...buildSummaryQuery(params),
        limit: params.limit ?? 5,
      },
    );
  },

  alerts(params: RangeParams & BookFilters = {}): Promise<AlertsResponse> {
    return apiClient.get<AlertsResponse>('/api/alerts', buildSummaryQuery(params));
  },

  summaryOrganicTotal(
    params: RangeParams & BookFilters = {},
  ): Promise<OrganicTotalSummary> {
    return apiClient.get<OrganicTotalSummary>(
      '/api/metrics/summary/organic-total',
      buildSummaryQuery(params),
    );
  },

  // Fetches metrics for a single campaign within a window.
  // Tries /api/campaigns/<id>/metrics first; falls back to summaryByCampaign+filter on 404.
  async campaignMetrics(
    campaignId: number,
    params: RangeParams = {},
  ): Promise<CampaignAnalyticsItem | null> {
    try {
      const direct = await apiClient.get<CampaignAnalyticsItem>(
        `/api/campaigns/${campaignId}/metrics`,
        {
          from: params.from,
          to: params.to,
          attribution: params.attribution ?? '7d',
        },
      );
      if (direct && typeof direct === 'object' && 'campaign_id' in direct) {
        return direct;
      }
    } catch (err) {
      if (!(err instanceof ApiError) || (err.status !== 404 && err.status !== 405)) {
        throw err;
      }
    }
    const summary = await metricsApi.summaryByCampaign(params);
    return summary.campaigns.find((c) => c.campaign_id === campaignId) ?? null;
  },

  campaignHourly(
    amazonCampaignId: string,
    params: RangeParams = {},
  ): Promise<HourlyResponse> {
    return apiClient.get<HourlyResponse>(
      `/api/metrics/campaigns/${encodeURIComponent(amazonCampaignId)}/hourly`,
      {
        from: params.from,
        to: params.to,
        attribution: params.attribution ?? '7d',
      },
    );
  },

  campaignSearchTerms(
    campaignId: number,
    params: RangeParams = {},
  ): Promise<CampaignSearchTermsResponse> {
    return apiClient.get<CampaignSearchTermsResponse>(
      `/api/campaigns/${campaignId}/search-terms`,
      {
        from: params.from,
        to: params.to,
        attribution: params.attribution ?? '7d',
      },
    );
  },

  campaignAllChanges(campaignId: number): Promise<CampaignAllChangesResponse> {
    return apiClient.get<CampaignAllChangesResponse>(
      `/api/campaigns/${campaignId}/all-changes`,
    );
  },

  summaryByKeyword(
    params: RangeParams & BookFilters = {},
  ): Promise<KeywordSummary> {
    return apiClient.get<KeywordSummary>(
      '/api/metrics/summary/by-keyword',
      buildSummaryQuery(params),
    );
  },

  // Универсальные breakdowns: backend возвращает { date_from, date_to, attribution_window, <pluralKey>: [...] }
  // Все колонки одинакового shape: { <key>: ..., impressions, clicks, cost, sales, orders, ctr, acos, ... }.
  // Renderer (BreakdownTab) ожидает `items` поле — нормализуем здесь.
  async breakdown(
    endpoint: string,
    pluralKey: string,
    params: RangeParams & BookFilters = {},
  ): Promise<{ date_from?: string; date_to?: string; items: Record<string, unknown>[] }> {
    const raw = await apiClient.get<Record<string, unknown>>(endpoint, buildSummaryQuery(params));
    const items = raw[pluralKey];
    let normalized: Record<string, unknown>[] = [];
    if (Array.isArray(items)) {
      normalized = items as Record<string, unknown>[];
    } else if (items && typeof items === 'object') {
      // Некоторые endpoint'ы (by-marketplace) возвращают dict — конвертируем в массив с key.
      normalized = Object.entries(items as Record<string, Record<string, unknown>>).map(
        ([key, m]) => ({ key, ...m }),
      );
    }
    return {
      date_from: raw.date_from as string | undefined,
      date_to: raw.date_to as string | undefined,
      items: normalized,
    };
  },
};
