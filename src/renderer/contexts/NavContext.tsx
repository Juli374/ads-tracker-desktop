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
  | 'campaign_details'
  | 'keywords'
  | 'reports'
  | 'comparison'
  | 'negatives'
  | 'action_center'
  | 'automation'
  | 'alerts'
  | 'royalties'
  | 'operations'
  | 'accounting'
  | 'settings';

// Filters, которые могут передаваться при drill-down между страницами.
// Страница-получатель сама решает, что применить и когда сбросить.
export interface NavFilters {
  bookId?: number;
  localCampaignId?: number;
  amazonCampaignId?: string;
  marketplace?: string;
  // Для campaign_details: id кампании в нашей БД, и опц. начальный таб.
  campaignId?: number;
  detailsTab?: 'ad_groups' | 'targets' | 'search_terms' | 'negatives' | 'history';
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

// Хук для страницы-получателя: читает filters один раз при mount.
// Возвращает снапшот, который можно использовать как initial state.
// Сброс контекстных filters не делаем — sidebar.navigate(page) уже передаёт
// {} по умолчанию, что обнуляет filters для следующего mount.
export function useInitialFilters(): NavFilters {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useInitialFilters must be used within NavProvider');
  const [snapshot] = useState(() => ctx.filters);
  return snapshot;
}

export function useNav(): NavContextValue {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used within NavProvider');
  return ctx;
}
