import { apiClient } from './client';

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
};
