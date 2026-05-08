import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { marketplacesApi } from '../api/marketplaces';
import { useAuth } from './AuthContext';

interface MarketplacesContextValue {
  list: string[];
  loading: boolean;
  error: string | null;
  refetch(): Promise<void>;
}

const MarketplacesContext = createContext<MarketplacesContextValue | null>(null);

export const MarketplacesProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { status } = useAuth();
  const [list, setList] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedFor = useRef<'idle' | string>('idle');

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const codes = await marketplacesApi.list();
      setList(Array.isArray(codes) ? codes : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить маркетплейсы');
    } finally {
      setLoading(false);
    }
  }, []);

  // Инвалидация кэша на каждом sign-in / sign-out (status меняется).
  useEffect(() => {
    if (status === 'authenticated' && fetchedFor.current !== 'authenticated') {
      fetchedFor.current = 'authenticated';
      fetch();
    } else if (status !== 'authenticated' && fetchedFor.current !== 'idle') {
      fetchedFor.current = 'idle';
      setList([]);
    }
  }, [status, fetch]);

  const value = useMemo<MarketplacesContextValue>(
    () => ({ list, loading, error, refetch: fetch }),
    [list, loading, error, fetch],
  );

  return (
    <MarketplacesContext.Provider value={value}>
      {children}
    </MarketplacesContext.Provider>
  );
};

export function useMarketplaces(): MarketplacesContextValue {
  const ctx = useContext(MarketplacesContext);
  if (!ctx) throw new Error('useMarketplaces must be used within MarketplacesProvider');
  return ctx;
}
