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
};
