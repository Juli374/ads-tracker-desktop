import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

// Phase Q.4.1 — attribution lifted from per-page PnLPage state to a global
// toggle in the topbar. Previously hardcoded `"14d"` on Dashboard / Reports /
// Comparison / Books drill (CampaignWeeklyMetrics). See parity_audit_2026-05-16
// and design-audit-2026-05-16/05-navigation.md §Discoverability findings.
export type AttributionWindow = '1d' | '7d' | '14d' | '30d';

export const ATTRIBUTION_WINDOWS: ReadonlyArray<AttributionWindow> = [
  '1d',
  '7d',
  '14d',
  '30d',
];

const ATTRIBUTION_STORAGE_KEY = 'global:attribution';
const DEFAULT_ATTRIBUTION: AttributionWindow = '14d';

function isAttributionWindow(v: unknown): v is AttributionWindow {
  return v === '1d' || v === '7d' || v === '14d' || v === '30d';
}

function loadAttribution(): AttributionWindow {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_ATTRIBUTION;
  }
  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (isAttributionWindow(raw)) return raw;
  } catch {
    // Ignore — fall through to default.
  }
  return DEFAULT_ATTRIBUTION;
}

export interface GlobalFilters {
  marketplaces: string[];
  bookId?: number;
  accounts: string[];
  attribution: AttributionWindow;
}

interface GlobalFiltersContextValue {
  filters: GlobalFilters;
  setMarketplaces(codes: string[]): void;
  toggleMarketplace(code: string): void;
  setBookId(id: number | undefined): void;
  setAccounts(accounts: string[]): void;
  toggleAccount(account: string): void;
  setAttribution(window: AttributionWindow): void;
  reset(): void;
  hasAny: boolean;
}

const GlobalFiltersContext = createContext<GlobalFiltersContextValue | null>(null);

const EMPTY: GlobalFilters = {
  marketplaces: [],
  bookId: undefined,
  accounts: [],
  attribution: DEFAULT_ATTRIBUTION,
};

export const GlobalFiltersProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [filters, setFilters] = useState<GlobalFilters>(() => ({
    ...EMPTY,
    attribution: loadAttribution(),
  }));

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

  const setAttribution = useCallback((window: AttributionWindow) => {
    setFilters((f) => ({ ...f, attribution: window }));
  }, []);

  // Persist attribution to localStorage so a refresh keeps the selection.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, filters.attribution);
    } catch {
      // Ignore quota / disabled storage.
    }
  }, [filters.attribution]);

  // `reset` keeps the attribution preference (it's a long-lived user pref,
  // not a query filter). Only marketplaces / books / accounts get cleared.
  const reset = useCallback(
    () =>
      setFilters((f) => ({
        ...EMPTY,
        attribution: f.attribution,
      })),
    [],
  );

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
      setAttribution,
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
      setAttribution,
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
