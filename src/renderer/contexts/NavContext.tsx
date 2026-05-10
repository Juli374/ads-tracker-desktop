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

// Filters passed during drill-down between pages.
// The receiving page decides what to apply and when to reset.
export interface NavFilters {
  bookId?: number;
  localCampaignId?: number;
  amazonCampaignId?: string;
  marketplace?: string;
  // For campaign_details: local campaign id, optional initial tab.
  campaignId?: number;
  detailsTab?: 'ad_groups' | 'targets' | 'search_terms' | 'negatives' | 'history';
}

// Books drill level for the 3-level Books -> Marketplaces -> Campaigns drill.
export type BooksDrillLevel = 'list' | 'marketplaces' | 'campaigns';

export interface BooksDrillState {
  level: BooksDrillLevel;
  selectedBookId?: number;
  selectedBookTitle?: string;
  selectedMarketplace?: string;
}

interface NavContextValue {
  page: ViewId;
  filters: NavFilters;
  navigate(page: ViewId, filters?: NavFilters): void;
  // Books drill state
  booksDrill: BooksDrillState;
  setBooksDrill(state: BooksDrillState): void;
}

const NavContext = createContext<NavContextValue | null>(null);

export const NavProvider: React.FC<{
  initial?: ViewId;
  children: React.ReactNode;
}> = ({ initial = 'dashboard', children }) => {
  const [page, setPage] = useState<ViewId>(initial);
  const [filters, setFilters] = useState<NavFilters>({});
  const [booksDrill, setBooksDrill] = useState<BooksDrillState>({ level: 'list' });

  const navigate = useCallback((next: ViewId, nextFilters: NavFilters = {}) => {
    setPage(next);
    setFilters(nextFilters);
    // Reset drill when navigating away from books
    if (next !== 'books') {
      setBooksDrill({ level: 'list' });
    }
  }, []);

  const value = useMemo<NavContextValue>(
    () => ({ page, filters, navigate, booksDrill, setBooksDrill }),
    [page, filters, navigate, booksDrill, setBooksDrill],
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
};

// Hook for receiving page: reads filters once on mount.
// Returns a snapshot that can be used as initial state.
// We do not reset context filters - sidebar.navigate(page) passes {} by default,
// which clears filters for the next mount.
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
