import React, { createContext, useContext, useMemo } from 'react';
import { useSessionState } from '../lib/useSessionState';

export type WeeksCount = 1 | 2 | 4 | 8 | 12;

export const WEEKS_OPTIONS: WeeksCount[] = [1, 2, 4, 8, 12];

interface WeeksFilterContextValue {
  weeksCount: WeeksCount;
  setWeeksCount: (next: WeeksCount) => void;
}

const WeeksFilterContext = createContext<WeeksFilterContextValue | null>(null);

export const WeeksFilterProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [weeksCount, setWeeksCount] = useSessionState<WeeksCount>(
    'campaigns:weeksCount',
    4,
  );

  const value = useMemo(
    () => ({
      weeksCount,
      setWeeksCount: (next: WeeksCount) => setWeeksCount(next),
    }),
    [weeksCount, setWeeksCount],
  );

  return (
    <WeeksFilterContext.Provider value={value}>
      {children}
    </WeeksFilterContext.Provider>
  );
};

// Returns a fallback (weeksCount=4, no-op setter) if no provider — keeps tests
// and out-of-tree consumers safe. Production tree is always wrapped in App.tsx.
const FALLBACK: WeeksFilterContextValue = {
  weeksCount: 4,
  setWeeksCount: () => undefined,
};

export function useWeeksFilter(): WeeksFilterContextValue {
  return useContext(WeeksFilterContext) ?? FALLBACK;
}

/**
 * Returns ISO Mon→Sun ranges for the last N full weeks (most recent first).
 * Today is excluded — only fully-elapsed weeks are returned.
 */
export interface WeekRange {
  index: number; // 1 = most recent
  from: string;
  to: string;
}

export function getFullWeeksDateRange(weeksCount: WeeksCount, today = new Date()): WeekRange[] {
  // Find Monday of current week (UTC).
  const utcToday = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const dayOfWeek = utcToday.getUTCDay(); // 0 = Sun .. 6 = Sat
  // Days back to Monday: if today is Sun (0), Monday is 6 days back; else dayOfWeek-1.
  const daysBackToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  // Sunday of last full week = Monday-of-this-week minus 1 day.
  const lastSunday = new Date(utcToday);
  lastSunday.setUTCDate(lastSunday.getUTCDate() - daysBackToMonday - 1);

  const ranges: WeekRange[] = [];
  for (let i = 0; i < weeksCount; i += 1) {
    const sunday = new Date(lastSunday);
    sunday.setUTCDate(sunday.getUTCDate() - i * 7);
    const monday = new Date(sunday);
    monday.setUTCDate(monday.getUTCDate() - 6);
    ranges.push({
      index: i + 1,
      from: monday.toISOString().slice(0, 10),
      to: sunday.toISOString().slice(0, 10),
    });
  }
  return ranges;
}
