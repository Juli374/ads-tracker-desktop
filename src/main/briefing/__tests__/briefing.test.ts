// Phase M.5 Lane E — WeeklyBriefer unit tests.
//
// Coverage:
//   1. nextBriefingTimestamp lands on the next Sunday 09:00 local time.
//   2. runNow() returns a stored briefing when AI + fetch both succeed,
//      and the persisted row is reachable via getLastBriefing().
//   3. runNow() persists an error record when AI throws (the user gets a
//      visible "last attempt failed" instead of silent loss).
//   4. start() / stop() respectively schedule and clear the timer without
//      hitting any real APIs.
//
// All side-effects are injected, so this never touches the real local-db
// JSON file, Electron, or the network.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WeeklyBriefer,
  nextBriefingTimestamp,
  composeDigest,
  buildBriefingSystemPrompt,
  type BrieferDeps,
} from '../briefer';
import type { ApiResponse } from '../../../shared/ipc';
import type { WeeklyBriefingRow } from '../../local-db';

/**
 * Build a fake store-backed deps bag. Returns the deps plus an `inspect()`
 * helper so tests can peek at the persisted briefings.
 */
function makeDeps(
  overrides: {
    fetchFn?: BrieferDeps['fetchFn'];
    aiGenerateFn?: BrieferDeps['aiGenerateFn'];
    now?: number;
  } = {},
): { deps: BrieferDeps; inspect: () => WeeklyBriefingRow[] } {
  const rows: WeeklyBriefingRow[] = [];
  let nextId = 1;

  const defaultFetch: BrieferDeps['fetchFn'] = async <T = unknown>(): Promise<ApiResponse<T>> => ({
    status: 200,
    ok: true,
    data: { books: [], alerts: [] } as unknown as T,
  });

  const defaultAi: BrieferDeps['aiGenerateFn'] = async () => ({
    text: 'Top movers:\n- Mock book performed well.\n\nUnderperforming:\n- N/A.\n\nSuggested actions:\n- Keep going.',
    model: 'claude-opus-4-7',
  });

  const nowSnapshot = overrides.now;
  const deps: BrieferDeps = {
    fetchFn: overrides.fetchFn ?? defaultFetch,
    aiGenerateFn: overrides.aiGenerateFn ?? defaultAi,
    nowFn: typeof nowSnapshot === 'number' ? () => nowSnapshot : () => Date.now(),
    appendBriefing: (partial) => {
      const row: WeeklyBriefingRow = { id: nextId++, ...partial };
      rows.push(row);
      return row;
    },
    listBriefings: () => rows.slice(),
  };

  return { deps, inspect: () => rows };
}

describe('nextBriefingTimestamp', () => {
  it('returns the next Sunday at 09:00 local time when called on a Monday', () => {
    // 2026-05-04 is a Monday (let's pick 14:00 local).
    const monday = new Date(2026, 4, 4, 14, 30, 0).getTime();
    const nextMs = nextBriefingTimestamp(monday);
    const next = new Date(nextMs);
    expect(next.getDay()).toBe(0); // Sunday
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(0);
    // 2026-05-10 is the Sunday following 2026-05-04.
    expect(next.getDate()).toBe(10);
    expect(next.getMonth()).toBe(4);
  });

  it('returns today 09:00 when called on Sunday before 09:00', () => {
    // 2026-05-10 is a Sunday. Pre-9am call → fire same day at 09:00.
    const sundayEarly = new Date(2026, 4, 10, 7, 15, 0).getTime();
    const nextMs = nextBriefingTimestamp(sundayEarly);
    const next = new Date(nextMs);
    expect(next.getDate()).toBe(10);
    expect(next.getHours()).toBe(9);
    expect(next.getDay()).toBe(0);
  });

  it('returns next Sunday 09:00 when called on Sunday after 09:00', () => {
    // Same Sunday 2026-05-10 but at 11am — advance a full week.
    const sundayLate = new Date(2026, 4, 10, 11, 0, 0).getTime();
    const nextMs = nextBriefingTimestamp(sundayLate);
    const next = new Date(nextMs);
    expect(next.getDay()).toBe(0);
    expect(next.getDate()).toBe(17);
    expect(next.getHours()).toBe(9);
  });
});

describe('composeDigest', () => {
  it('totals book metrics and clips top/bottom to 5 entries', () => {
    const byBook = Array.from({ length: 8 }, (_, i) => ({
      book_id: i + 1,
      title: `Book ${i + 1}`,
      cost: 10,
      sales: 50,
      orders: 2,
      acos: 20,
      royalty: 12,
      profit: 10 - i, // monotonically decreasing
    }));
    const digest = composeDigest(byBook, { winners: [], losers: [] }, [], '2026-05-07', '2026-05-14');
    expect(digest.totals.spend).toBe(80);
    expect(digest.totals.sales).toBe(400);
    expect(digest.totals.orders).toBe(16);
    expect(digest.top_books).toHaveLength(5);
    expect(digest.bottom_books).toHaveLength(5);
    // Top books sorted by profit descending: profits 10, 9, 8, 7, 6 → ids 1-5
    expect(digest.top_books.map((b) => b.book_id)).toEqual([1, 2, 3, 4, 5]);
    // Bottom books sorted by profit ascending: profits 3, 4, 5, 6, 7 → ids 8, 7, 6, 5, 4
    expect(digest.bottom_books.map((b) => b.book_id)).toEqual([8, 7, 6, 5, 4]);
  });
});

describe('buildBriefingSystemPrompt', () => {
  it('produces a deterministic system prompt with section structure', () => {
    const prompt = buildBriefingSystemPrompt();
    expect(prompt).toContain('250-word');
    expect(prompt).toContain('Top movers');
    expect(prompt).toContain('Underperforming');
    expect(prompt).toContain('Suggested actions');
  });

  it('appends brand voice when configured', () => {
    const prompt = buildBriefingSystemPrompt({
      pov: 'first-person',
      toneWords: ['confident', 'warm'],
      bannedWords: ['cliché'],
    });
    expect(prompt).toContain('Brand voice');
    expect(prompt).toContain('first-person');
    expect(prompt).toContain('confident, warm');
    expect(prompt).toContain('cliché');
  });
});

describe('WeeklyBriefer.runNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores a successful briefing and exposes it via getLastBriefing', async () => {
    const now = new Date(2026, 4, 4, 14, 0, 0).getTime();
    const fetchFn: BrieferDeps['fetchFn'] = async <T = unknown,>(): Promise<ApiResponse<T>> => ({
      status: 200,
      ok: true,
      data: {
        books: [{ book_id: 1, title: 'Top Book', cost: 10, sales: 50, orders: 5, profit: 20 }],
        alerts: [],
      } as unknown as T,
    });
    const { deps, inspect } = makeDeps({ now, fetchFn });
    const briefer = new WeeklyBriefer(deps);
    const result = await briefer.runNow();

    expect(result.error).toBeUndefined();
    expect(result.briefing).not.toBeNull();
    expect(result.briefing?.content).toContain('Top movers');
    expect(result.briefing?.model).toBe('claude-opus-4-7');

    const rows = inspect();
    expect(rows).toHaveLength(1);
    expect(rows[0].error).toBeUndefined();
    expect(rows[0].period_to).toBe('2026-05-04');
    expect(rows[0].period_from).toBe('2026-04-27');

    const last = briefer.getLastBriefing();
    expect(last?.id).toBe(rows[0].id);
    expect(last?.content).toContain('Top movers');
    briefer.stop();
  });

  it('persists an error record when the AI call throws', async () => {
    const { deps, inspect } = makeDeps({
      now: new Date(2026, 4, 4, 14, 0, 0).getTime(),
      aiGenerateFn: vi.fn(async () => {
        throw new Error('Claude API key not configured — set in Settings → AI');
      }),
    });
    const briefer = new WeeklyBriefer(deps);
    const result = await briefer.runNow();

    expect(result.error).toContain('Claude API key not configured');
    expect(result.briefing).not.toBeNull();
    expect(result.briefing?.error).toContain('Claude API key not configured');
    expect(result.briefing?.content).toBe('');

    const rows = inspect();
    expect(rows).toHaveLength(1);
    expect(rows[0].error).toBeDefined();
    expect(rows[0].content).toBe('');
    briefer.stop();
  });

  it('emits a state-change push when a briefing lands', async () => {
    const emitChange = vi.fn();
    const { deps } = makeDeps({
      now: new Date(2026, 4, 4, 14, 0, 0).getTime(),
    });
    const briefer = new WeeklyBriefer({ ...deps, emitChange });
    await briefer.runNow();
    expect(emitChange).toHaveBeenCalledTimes(1);
    expect(emitChange.mock.calls[0][0].content).toContain('Top movers');
    briefer.stop();
  });

  it('de-dupes concurrent runNow calls — second call returns the in-flight promise', async () => {
    let aiCalls = 0;
    const { deps } = makeDeps({
      now: new Date(2026, 4, 4, 14, 0, 0).getTime(),
      aiGenerateFn: async () => {
        aiCalls += 1;
        return { text: 'first', model: 'm' };
      },
    });
    const briefer = new WeeklyBriefer(deps);
    const [a, b] = await Promise.all([briefer.runNow(), briefer.runNow()]);
    // Single underlying AI call, both callers see the same result.
    expect(aiCalls).toBe(1);
    expect(a.briefing?.id).toBe(b.briefing?.id);
    briefer.stop();
  });
});

describe('WeeklyBriefer.start / stop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('schedules a timer on start() and clears it on stop()', () => {
    const now = new Date(2026, 4, 4, 14, 0, 0).getTime();
    vi.setSystemTime(now);
    const { deps } = makeDeps({ now });
    const briefer = new WeeklyBriefer(deps);
    briefer.start();

    // Before stop: we have a future-scheduled run.
    const nextRun = briefer.getNextRunAt();
    expect(nextRun).not.toBeNull();
    // Sunday is 2026-05-10 09:00 local → ms timestamp positive offset.
    expect(new Date(nextRun ?? '').getDay()).toBe(0);

    briefer.stop();
    expect(briefer.getNextRunAt()).toBeNull();
  });
});
