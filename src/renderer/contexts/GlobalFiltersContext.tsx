import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

export interface GlobalFilters {
  marketplaces: string[];
}

interface GlobalFiltersContextValue {
  filters: GlobalFilters;
  setMarketplaces(codes: string[]): void;
  toggleMarketplace(code: string): void;
  reset(): void;
  hasAny: boolean;
}

const GlobalFiltersContext = createContext<GlobalFiltersContextValue | null>(null);

const EMPTY: GlobalFilters = { marketplaces: [] };

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

  const reset = useCallback(() => setFilters(EMPTY), []);

  const value = useMemo<GlobalFiltersContextValue>(
    () => ({
      filters,
      setMarketplaces,
      toggleMarketplace,
      reset,
      hasAny: filters.marketplaces.length > 0,
    }),
    [filters, setMarketplaces, toggleMarketplace, reset],
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
