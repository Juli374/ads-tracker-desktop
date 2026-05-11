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
  // Phase J.3 Lane C — book metadata used by Settings inline edit + future
  // book formatter. Backend stores `book_language` (default 'en') and an
  // optional series name, returned in `/api/books/<id>` payload.
  book_language?: string | null;
  series_name?: string | null;
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
  book_language?: string | null;
  series_name?: string | null;
}

/**
 * Phase J.3 Lane C — payload accepted by `/api/books` POST. Mirrors the
 * subset Settings → Books inline-create / CSV import actually use.
 */
export interface BookCreate {
  title: string;
  subtitle?: string | null;
  author?: string | null;
  account?: string | null;
  book_language?: string | null;
  series_name?: string | null;
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

  /**
   * Phase J.3 Lane C — create a single book. Backend returns `{ id, message }`.
   * Used both by Settings → Books quick-create and by CSV import (one POST per row).
   */
  create(data: BookCreate): Promise<{ id: number; message?: string }> {
    return apiClient.post<{ id: number; message?: string }>('/api/books', data);
  },

  /**
   * Phase J.3 Lane C — bulk create. The backend has no native bulk endpoint
   * (verified 2026-05-11), so we fan out into N parallel POSTs. Failed rows
   * are returned with their original index so the caller can report partials.
   */
  async bulkCreate(rows: BookCreate[]): Promise<{
    created: Array<{ index: number; id: number }>;
    failed: Array<{ index: number; error: string }>;
  }> {
    const results = await Promise.allSettled(
      rows.map((row) => booksApi.create(row)),
    );
    const created: Array<{ index: number; id: number }> = [];
    const failed: Array<{ index: number; error: string }> = [];
    results.forEach((r, index) => {
      if (r.status === 'fulfilled') {
        created.push({ index, id: r.value.id });
      } else {
        const err = r.reason;
        failed.push({
          index,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
    return { created, failed };
  },

  update(id: number, data: BookUpdate): Promise<{ message: string }> {
    return apiClient.put<{ message: string }>(`/api/books/${id}`, data);
  },

  /**
   * Phase J.3 Lane C — single delete. Distinct from `archive`: this drops the
   * row entirely. Settings → Books bulk-delete fans out into N parallel calls.
   */
  delete(id: number): Promise<{ message: string }> {
    return apiClient.del<{ message: string }>(`/api/books/${id}`);
  },

  /**
   * Phase J.3 Lane C — bulk delete (parallel `delete` calls). Returns the
   * tally of {deleted, failed} so callers can show toasts like "Deleted 3 of 5".
   */
  async bulkDelete(ids: number[]): Promise<{
    deleted: number[];
    failed: Array<{ id: number; error: string }>;
  }> {
    const results = await Promise.allSettled(ids.map((id) => booksApi.delete(id)));
    const deleted: number[] = [];
    const failed: Array<{ id: number; error: string }> = [];
    results.forEach((r, idx) => {
      const id = ids[idx];
      if (r.status === 'fulfilled') {
        deleted.push(id);
      } else {
        const err = r.reason;
        failed.push({ id, error: err instanceof Error ? err.message : String(err) });
      }
    });
    return { deleted, failed };
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
