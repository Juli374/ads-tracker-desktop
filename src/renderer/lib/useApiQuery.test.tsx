import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useApiQuery } from './useApiQuery';
import { ApiError } from '../api/client';

describe('useApiQuery', () => {
  it('returns data on successful fetch', async () => {
    const fetcher = vi.fn(async () => ({ value: 42 }));
    const { result } = renderHook(() => useApiQuery(fetcher, []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ value: 42 });
    expect(result.current.error).toBeNull();
  });

  it('captures error message on failure', async () => {
    const fetcher = vi.fn(async () => {
      throw new ApiError('boom', 500);
    });
    const { result } = renderHook(() => useApiQuery(fetcher, []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('boom');
  });

  it('silentStatuses suppresses error and clears data', async () => {
    const fetcher = vi.fn(async () => {
      throw new ApiError('not found', 404);
    });
    const { result } = renderHook(() =>
      useApiQuery(fetcher, [], { silentStatuses: [404] }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBeNull();
  });

  it('refetch re-runs the fetcher', async () => {
    let n = 0;
    const fetcher = vi.fn(async () => ({ n: ++n }));
    const { result } = renderHook(() => useApiQuery(fetcher, []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ n: 1 });
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.data).toEqual({ n: 2 });
  });

  it('enabled=false skips initial fetch', async () => {
    const fetcher = vi.fn(async () => 'x');
    const { result } = renderHook(() =>
      useApiQuery(fetcher, [], { enabled: false }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
  });
});
