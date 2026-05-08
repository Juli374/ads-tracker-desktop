import { apiClient } from './client';

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

export interface SummaryByBookParams {
  from?: string;
  to?: string;
  attribution?: '1d' | '7d' | '14d' | '30d';
  marketplace?: string;
}

export const metricsApi = {
  summaryByBook(params: SummaryByBookParams = {}): Promise<BookSummary> {
    return apiClient.get<BookSummary>('/api/metrics/summary/by-book', {
      from: params.from,
      to: params.to,
      attribution: params.attribution ?? '7d',
      marketplace: params.marketplace,
    });
  },
};
