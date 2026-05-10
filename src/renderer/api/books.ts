import { apiClient } from './client';

export interface BookAsin {
  id: number;
  marketplace: string;
  asin: string;
  format: string;
  price: number | null;
  is_active: number;
}

export interface Book {
  id: number;
  title: string;
  subtitle: string | null;
  cover_image: string | null;
  amazon_link: string | null;
  trim_size: string | null;
  interior_type: string | null;
  page_count: number | null;
  account: string | null;
  publication_date: string | null;
  archived?: number;
  asins?: BookAsin[];
  // Extended fields from backend
  author?: string | null;
  be_acos?: number | null;
  max_cpc?: number | null;
  royalty_pct?: number | null;
  organic_baseline?: number | null;
}

export interface BookUpdate {
  title?: string;
  subtitle?: string | null;
  author?: string | null;
  account?: string | null;
  be_acos?: number | null;
  max_cpc?: number | null;
  royalty_pct?: number | null;
  organic_baseline?: number | null;
}

export interface AsinCreate {
  marketplace: string;
  asin: string;
}

export interface AsinUpdate {
  marketplace?: string;
  asin?: string;
  format?: string;
  price?: number | null;
  is_active?: number;
}

export interface KdpMetricsRequest {
  listPriceUsd: number;
  marketplace: string;
}

export interface KdpMetricsResponse {
  royaltyPerPage: number;
  beAcos: number;
  maxCpc: number;
}

export interface BsrPoint {
  ts: string;
  bsr: number;
}

export interface BsrHistoryResponse {
  points: BsrPoint[];
}

export interface BookRating {
  bookId: number;
  marketplace: string;
  stars: number;
  count: number;
}

export interface AllBooksRatingsResponse {
  ratings: BookRating[];
}

export const booksApi = {
  list(opts: { archived?: boolean; all?: boolean } = {}): Promise<Book[]> {
    const query: Record<string, string | undefined> = {};
    if (opts.archived) query.archived = '1';
    if (opts.all) query.all = '1';
    return apiClient.get<Book[]>('/api/books', query);
  },

  get(id: number): Promise<Book> {
    return apiClient.get<Book>(`/api/books/${id}`);
  },

  update(id: number, data: BookUpdate): Promise<{ message: string }> {
    return apiClient.put<{ message: string }>(`/api/books/${id}`, data);
  },

  archive(id: number): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>(`/api/books/${id}/archive`, {});
  },

  unarchive(id: number): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>(`/api/books/${id}/unarchive`, {});
  },

  kdpMetrics(id: number, req: KdpMetricsRequest): Promise<KdpMetricsResponse> {
    return apiClient.post<KdpMetricsResponse>(`/api/books/${id}/kdp-metrics`, {
      list_price_usd: req.listPriceUsd,
      marketplace: req.marketplace,
    });
  },

  bsrHistory(
    id: number,
    opts: { marketplace: string; hours?: number },
  ): Promise<BsrHistoryResponse> {
    return apiClient.get<BsrHistoryResponse>(`/api/book/${id}/bsr-history`, {
      marketplace: opts.marketplace,
      hours: String(opts.hours ?? 168),
    });
  },
};

export const asinApi = {
  add(bookId: number, data: AsinCreate): Promise<{ id: number; message?: string }> {
    return apiClient.post<{ id: number; message?: string }>(
      `/api/books/${bookId}/asins`,
      data,
    );
  },

  update(asinId: number, data: AsinUpdate): Promise<{ message: string }> {
    return apiClient.put<{ message: string }>(`/api/asins/${asinId}`, data);
  },

  delete(asinId: number): Promise<{ message: string }> {
    return apiClient.del<{ message: string }>(`/api/asins/${asinId}`);
  },
};

export const ratingsApi = {
  allBooks(): Promise<AllBooksRatingsResponse> {
    return apiClient.get<AllBooksRatingsResponse>('/api/ratings/all-books');
  },
};
