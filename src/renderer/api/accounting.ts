import { apiClient } from './client';

export interface Account {
  id: number;
  name: string;
  type?: string;
  currency?: string;
  current_balance?: number;
  initial_balance?: number;
  is_active?: boolean | number;
}

export interface Category {
  id: number;
  name: string;
  type: 'income' | 'expense' | string;
  parent_id?: number | null;
}

export interface Transaction {
  id: number;
  date: string;
  account_id: number;
  account_name?: string;
  category_id?: number | null;
  category_name?: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer' | string;
  description?: string | null;
  currency?: string;
}

export const accountingApi = {
  listAccounts(): Promise<Account[]> {
    return apiClient.get<Account[]>('/api/accounting/accounts');
  },

  listCategories(): Promise<Category[]> {
    return apiClient.get<Category[]>('/api/accounting/categories');
  },

  listTransactions(opts: { limit?: number; from?: string; to?: string } = {}): Promise<
    Transaction[] | { items?: Transaction[] }
  > {
    return apiClient.get<Transaction[] | { items?: Transaction[] }>(
      '/api/accounting/transactions',
      {
        limit: opts.limit ?? 50,
        from: opts.from,
        to: opts.to,
      },
    );
  },
};

export const normalizeTransactions = (
  res: Transaction[] | { items?: Transaction[] },
): Transaction[] => {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.items)) return res.items;
  return [];
};
