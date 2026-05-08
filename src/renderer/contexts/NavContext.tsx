import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

export type ViewId =
  | 'dashboard'
  | 'books'
  | 'search_terms'
  | 'campaigns'
  | 'reports'
  | 'settings';

// Filters, которые могут передаваться при drill-down между страницами.
// Страница-получатель сама решает, что применить и когда сбросить.
export interface NavFilters {
  bookId?: number;
  localCampaignId?: number;
  amazonCampaignId?: string;
  marketplace?: string;
}

interface NavContextValue {
  page: ViewId;
  filters: NavFilters;
  navigate(page: ViewId, filters?: NavFilters): void;
  // Используется страницей-получателем чтобы пометить filters прочитанными
  // и предотвратить повторное применение при ре-рендере.
  consumeFilters(): NavFilters;
}

const NavContext = createContext<NavContextValue | null>(null);

export const NavProvider: React.FC<{
  initial?: ViewId;
  children: React.ReactNode;
}> = ({ initial = 'dashboard', children }) => {
  const [page, setPage] = useState<ViewId>(initial);
  const [filters, setFilters] = useState<NavFilters>({});

  const navigate = useCallback((next: ViewId, nextFilters: NavFilters = {}) => {
    setPage(next);
    setFilters(nextFilters);
  }, []);

  const consumeFilters = useCallback((): NavFilters => {
    const snapshot = filters;
    if (Object.keys(snapshot).length > 0) {
      setFilters({});
    }
    return snapshot;
  }, [filters]);

  const value = useMemo<NavContextValue>(
    () => ({ page, filters, navigate, consumeFilters }),
    [page, filters, navigate, consumeFilters],
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
};

export function useNav(): NavContextValue {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used within NavProvider');
  return ctx;
}
