import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { booksApi, Book } from '../api/books';
import { useAuth } from './AuthContext';

interface BooksContextValue {
  list: Book[];
  loading: boolean;
  error: string | null;
  refetch(): Promise<void>;
}

const BooksContext = createContext<BooksContextValue | null>(null);

export const BooksProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { status } = useAuth();
  const [list, setList] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedFor = useRef<'idle' | string>('idle');

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await booksApi.list();
      setList(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить книги');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated' && fetchedFor.current !== 'authenticated') {
      fetchedFor.current = 'authenticated';
      fetch();
    } else if (status !== 'authenticated' && fetchedFor.current !== 'idle') {
      fetchedFor.current = 'idle';
      setList([]);
    }
  }, [status, fetch]);

  const value = useMemo<BooksContextValue>(
    () => ({ list, loading, error, refetch: fetch }),
    [list, loading, error, fetch],
  );

  return <BooksContext.Provider value={value}>{children}</BooksContext.Provider>;
};

export function useBooks(): BooksContextValue {
  const ctx = useContext(BooksContext);
  if (!ctx) throw new Error('useBooks must be used within BooksProvider');
  return ctx;
}
