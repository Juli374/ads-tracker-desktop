import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
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

  const value = useMemo<NavContextValue>(
    () => ({ page, filters, navigate }),
    [page, filters, navigate],
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
};

// Хук для страницы-получателя: читает filters один раз при mount и потом
// сбрасывает их в контексте через useEffect (после рендера, безопасно для React).
// Возвращает снапшот, который можно использовать как initial state.
export function useInitialFilters(): NavFilters {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useInitialFilters must be used within NavProvider');
  // Снимок при первом рендере — не меняется при перерендерах
  const [snapshot] = useState(() => ctx.filters);
  // После mount сбрасываем filters в контексте, чтобы повторный mount страницы
  // (через cmd+K или sidebar) не унаследовал старые фильтры.
  useEffect(() => {
    if (Object.keys(snapshot).length > 0) {
      ctx.navigate(ctx.page, {});
    }
    // Run once on mount; ctx-based deps would re-trigger on every navigate.
  }, []); // eslint-disable-line
  return snapshot;
}

export function useNav(): NavContextValue {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used within NavProvider');
  return ctx;
}
