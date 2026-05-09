import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

export interface GlobalFilters {
  marketplaces: string[];
  bookId?: number;
  accounts: string[];
}

interface GlobalFiltersContextValue {
  filters: GlobalFilters;
  setMarketplaces(codes: string[]): void;
  toggleMarketplace(code: string): void;
  setBookId(id: number | undefined): void;
  setAccounts(accounts: string[]): void;
  toggleAccount(account: string): void;
  reset(): void;
  hasAny: boolean;
}

const GlobalFiltersContext = createContext<GlobalFiltersContextValue | null>(null);

const EMPTY: GlobalFilters = { marketplaces: [], bookId: undefined, accounts: [] };

export const GlobalFiltersProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [filters, setFilters] = useState<GlobalFilters>(EMPTY);

  const setMarketplaces = useCallback((codes: string[]) => {
    setFilters((f) => ({ ...f, marketplaces: codes }));
  }, []);

  const toggleMarketplace = useCallback((code: string) => {
    setFilters((f) => {
      const has = f.marketplaces.includes(code);
      return {
        ...f,
        marketplaces: has
          ? f.marketplaces.filter((m) => m !== code)
          : [...f.marketplaces, code],
      };
    });
  }, []);

  const setBookId = useCallback((id: number | undefined) => {
    setFilters((f) => ({ ...f, bookId: id }));
  }, []);

  const setAccounts = useCallback((accounts: string[]) => {
    setFilters((f) => ({ ...f, accounts }));
  }, []);

  const toggleAccount = useCallback((account: string) => {
    setFilters((f) => {
      const has = f.accounts.includes(account);
      return {
        ...f,
        accounts: has
          ? f.accounts.filter((a) => a !== account)
          : [...f.accounts, account],
      };
    });
  }, []);

  const reset = useCallback(() => setFilters(EMPTY), []);

  const hasAny =
    filters.marketplaces.length > 0 ||
    filters.bookId != null ||
    filters.accounts.length > 0;

  const value = useMemo<GlobalFiltersContextValue>(
    () => ({
      filters,
      setMarketplaces,
      toggleMarketplace,
      setBookId,
      setAccounts,
      toggleAccount,
      reset,
      hasAny,
    }),
    [
      filters,
      setMarketplaces,
      toggleMarketplace,
      setBookId,
      setAccounts,
      toggleAccount,
      reset,
      hasAny,
    ],
  );

  return (
    <GlobalFiltersContext.Provider value={value}>
      {children}
    </GlobalFiltersContext.Provider>
  );
};

export function useGlobalFilters(): GlobalFiltersContextValue {
  const ctx = useContext(GlobalFiltersContext);
  if (!ctx)
    throw new Error('useGlobalFilters must be used within GlobalFiltersProvider');
  return ctx;
}

// Превращает текущие global filters в массив chip-объектов для ActiveFiltersBar.
// Caller передаёт книги (из BooksContext) чтобы перевести bookId в title.
import type { ActiveFilterChip } from '../components/ui/ActiveFiltersBar';
export function useGlobalFilterChips(books: Array<{ id: number; title: string }>) {
  const ctx = useGlobalFilters();
  const chips: ActiveFilterChip[] = [];
  if (ctx.filters.bookId != null) {
    const book = books.find((b) => b.id === ctx.filters.bookId);
    chips.push({
      label: `📕 ${book?.title ?? `book #${ctx.filters.bookId}`}`,
      onRemove: () => ctx.setBookId(undefined),
    });
  }
  for (const acc of ctx.filters.accounts) {
    chips.push({
      label: `👤 ${acc}`,
      onRemove: () => ctx.toggleAccount(acc),
    });
  }
  for (const mp of ctx.filters.marketplaces) {
    chips.push({
      label: `🌍 ${mp}`,
      onRemove: () => ctx.toggleMarketplace(mp),
    });
  }
  return chips;
}
