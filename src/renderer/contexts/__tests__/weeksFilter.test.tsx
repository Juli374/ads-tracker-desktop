import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  WeeksFilterProvider,
  useWeeksFilter,
  getFullWeeksDateRange,
} from '../WeeksFilterContext';
import React from 'react';

describe('getFullWeeksDateRange', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    // Wed 2026-05-15 (Wed). Last full week ends Sun 2026-05-12.
    vi.setSystemTime(new Date('2026-05-15T12:00:00Z'));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('returns most-recent first, ISO Mon→Sun, no overlap with current week', () => {
    const ranges = getFullWeeksDateRange(4);
    expect(ranges).toHaveLength(4);
    expect(ranges[0]).toEqual({ index: 1, from: '2026-05-04', to: '2026-05-10' });
    expect(ranges[1]).toEqual({ index: 2, from: '2026-04-27', to: '2026-05-03' });
    expect(ranges[2]).toEqual({ index: 3, from: '2026-04-20', to: '2026-04-26' });
    expect(ranges[3]).toEqual({ index: 4, from: '2026-04-13', to: '2026-04-19' });
  });

  it('returns 1 week when count=1', () => {
    const ranges = getFullWeeksDateRange(1);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].from).toBe('2026-05-04');
    expect(ranges[0].to).toBe('2026-05-10');
  });

  it('returns 12 weeks when count=12', () => {
    const ranges = getFullWeeksDateRange(12);
    expect(ranges).toHaveLength(12);
    // 12th week ends 11 weeks before W1's end (2026-05-10).
    expect(ranges[11].to).toBe(
      new Date(Date.UTC(2026, 4, 10) - 11 * 7 * 86400 * 1000)
        .toISOString()
        .slice(0, 10),
    );
  });
});

describe('useWeeksFilter', () => {
  it('returns fallback when no provider mounted', () => {
    const { result } = renderHook(() => useWeeksFilter());
    expect(result.current.weeksCount).toBe(4);
    expect(typeof result.current.setWeeksCount).toBe('function');
  });

  it('persists weeksCount via provider', () => {
    window.localStorage.clear();
    const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
      <WeeksFilterProvider>{children}</WeeksFilterProvider>
    );
    const { result } = renderHook(() => useWeeksFilter(), { wrapper });
    expect(result.current.weeksCount).toBe(4);
    act(() => result.current.setWeeksCount(8));
    expect(result.current.weeksCount).toBe(8);
  });
});
