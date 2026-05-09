import { apiClient } from './client';

// Backend возвращает items в camelCase (transform_to_camel_case)
export interface SearchTermItem {
  id: number;
  searchTerm: string;
  campaignId?: string;
  campaignName?: string;
  localCampaignId?: number;
  bookId?: number | null;
  bookTitle?: string | null;
  marketplace?: string;
  currency?: string;
  keywordId?: string;
  keywordText?: string;
  matchType?: string;
  termType?: 'keyword' | 'asin';
  impressions: number;
  clicks: number;
  cost: number;
  sales: number;
  orders: number;
  ctr: number;
  cpc: number;
  acos: number;
  classification?: string;
  inboxStatus?: string;
}

export interface SearchTermsSummary {
  totalImpressions: number;
  totalClicks: number;
  totalCost: number;
  totalSales: number;
  totalOrders: number;
  avgCtr: number;
  avgAcos: number;
  termsCount: number;
}

export interface SearchTermsResponse {
  items: SearchTermItem[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
  summary?: SearchTermsSummary;
  inboxCounts?: Record<string, number>;
  classificationCounts?: Record<string, number>;
}

export interface SearchTermsFilters {
  dateFrom: string;
  dateTo: string;
  bookId?: number;
  marketplace?: string;
  campaignId?: string;
  localCampaignId?: number;
  // Backend принимает одиночный account string. Если глобальный фильтр
  // выбрал ровно один — передаём, иначе undefined (без фильтрации).
  account?: string;
  keywordId?: string;
  termType?: 'keywords' | 'asins';
  classifications?: string[];
  inboxStatus?: string;
  minClicks?: number;
  minSpend?: number;
  search?: string;
  sortBy?: 'clicks' | 'cost' | 'sales' | 'acos' | 'orders' | 'impressions';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  perPage?: number;
}

function toQuery(
  f: SearchTermsFilters,
): Record<string, string | number | string[] | undefined> {
  return {
    date_from: f.dateFrom,
    date_to: f.dateTo,
    book_id: f.bookId,
    marketplace: f.marketplace,
    campaign_id: f.campaignId,
    local_campaign_id: f.localCampaignId,
    account: f.account,
    keyword_id: f.keywordId,
    term_type: f.termType,
    classification: f.classifications,
    inbox_status: f.inboxStatus,
    min_clicks: f.minClicks,
    min_spend: f.minSpend,
    search: f.search,
    sort_by: f.sortBy ?? 'clicks',
    sort_order: f.sortOrder ?? 'desc',
    page: f.page ?? 1,
    per_page: f.perPage ?? 50,
  };
}

export const searchTermsApi = {
  list(filters: SearchTermsFilters): Promise<SearchTermsResponse> {
    return apiClient.get<SearchTermsResponse>('/api/search-terms', toQuery(filters));
  },

  summary(
    filters: Pick<SearchTermsFilters, 'dateFrom' | 'dateTo' | 'bookId'>,
  ): Promise<SearchTermsSummary> {
    return apiClient.get<SearchTermsSummary>('/api/search-terms/summary', {
      date_from: filters.dateFrom,
      date_to: filters.dateTo,
      book_id: filters.bookId,
    });
  },
};
