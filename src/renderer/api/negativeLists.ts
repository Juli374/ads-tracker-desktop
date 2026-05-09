import { apiClient } from './client';

// Backend возвращает поля в camelCase (negativeListsApi).
export interface NegativeList {
  id: number;
  bookId: number | null;
  name: string;
  description: string;
  isDefault: boolean;
  itemCount: number;
  createdAt: string;
  isGlobal: boolean;
}

export interface NegativeListItem {
  id: number;
  keyword: string;
  matchType: 'exact' | 'phrase' | string;
  reason: string | null;
  sourceSearchTerm: string | null;
  addedAt: string;
}

export interface NegativeListWithItems extends NegativeList {
  items: NegativeListItem[];
}

export const negativeListsApi = {
  list(opts: { bookId?: number; includeGlobal?: boolean } = {}): Promise<NegativeList[]> {
    return apiClient.get<NegativeList[]>('/api/negative-lists', {
      book_id: opts.bookId,
      include_global: opts.includeGlobal === false ? 'false' : 'true',
    });
  },

  get(listId: number): Promise<NegativeListWithItems> {
    return apiClient.get<NegativeListWithItems>(`/api/negative-lists/${listId}`);
  },

  create(data: {
    name: string;
    description?: string;
    bookId?: number | null;
  }): Promise<{ id: number; message: string }> {
    return apiClient.post<{ id: number; message: string }>(
      '/api/negative-lists',
      data,
    );
  },

  update(listId: number, data: { name?: string; description?: string }) {
    return apiClient.put<{ message: string }>(`/api/negative-lists/${listId}`, data);
  },

  delete(listId: number) {
    return apiClient.del<{ message: string }>(`/api/negative-lists/${listId}`);
  },

  // Bulk-add: backend принимает { items: [{ keyword, matchType?, reason? }] }.
  addItems(
    listId: number,
    items: Array<{ keyword: string; matchType?: 'exact' | 'phrase'; reason?: string }>,
  ) {
    return apiClient.post<{ added: number; message: string }>(
      `/api/negative-lists/${listId}/items`,
      { items },
    );
  },

  removeItem(itemId: number) {
    return apiClient.del<{ message: string }>(`/api/negative-lists/items/${itemId}`);
  },
};
