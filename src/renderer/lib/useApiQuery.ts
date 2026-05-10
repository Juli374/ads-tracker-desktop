import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';

export interface ApiQueryState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

export interface UseApiQueryOptions {
  /**
   * If true, errors with status in this list set data to null but suppress
   * `error` (consumers can show empty state). Default: empty array.
   */
  silentStatuses?: number[];
  /**
   * If false, the hook does not auto-fetch on mount. Caller must use refetch().
   */
  enabled?: boolean;
  /**
   * Optional override that maps an error to a user-facing string. If returned
   * value is null, the error is treated as silent (data → null, error stays null).
   */
  errorMessage?: (err: unknown) => string | null;
}

/**
 * Standard hook for renderer-side data fetching. Replaces the boilerplate
 * `useState + useEffect + try/catch + cancel-flag` pattern duplicated across
 * ~13 sites in this codebase. Returns {data, error, loading, refetch}.
 *
 * Cancel-on-unmount is automatic. Re-fetches when any value in `deps` changes.
 *
 * Why an in-house hook instead of TanStack Query: keeps the bundle small and
 * the surface tiny — we don't need cache invalidation, query keys, or
 * optimistic mutations across the whole app. Pages that need optimistic state
 * keep their own setState.
 */
export function useApiQuery<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown>,
  options: UseApiQueryOptions = {},
): ApiQueryState<T> {
  const { silentStatuses, enabled = true, errorMessage } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const cancelRef = useRef(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetcherRef.current();
      if (cancelRef.current) return;
      setData(res);
    } catch (err) {
      if (cancelRef.current) return;
      if (
        err instanceof ApiError &&
        silentStatuses &&
        silentStatuses.includes(err.status)
      ) {
        setData(null);
        return;
      }
      if (errorMessage) {
        const msg = errorMessage(err);
        if (msg == null) {
          setData(null);
          return;
        }
        setError(msg);
        return;
      }
      setError(err instanceof ApiError ? err.message : (err as Error)?.message ?? 'Error');
    } finally {
      if (!cancelRef.current) setLoading(false);
    }
    // silentStatuses is captured by closure; OK to omit since it's read inline.
  }, [errorMessage, silentStatuses]);

  useEffect(() => {
    cancelRef.current = false;
    if (enabled) {
      run();
    } else {
      setLoading(false);
    }
    return () => {
      cancelRef.current = true;
    };
  }, deps);

  const refetch = useCallback(async () => {
    cancelRef.current = false;
    await run();
  }, [run]);

  return { data, error, loading, refetch };
}
