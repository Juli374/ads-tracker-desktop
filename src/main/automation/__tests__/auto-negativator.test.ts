// Phase L.2 Lane B — Auto-Negativator scanner unit tests.
//
// These tests pin the contract of the scanner without touching electron, the
// real local-db file, or the network. We inject stub `fetchFn`/`readState`/
// `writeState` and assert:
//   - rule (a) zero-sale: fires when clicks ≥ minClicks, orders = 0
//   - rule (b) high-ACOS: fires when ACOS exceeds target × multiplier with
//     enough orders to be statistically meaningful
//   - threshold respected: clicks below minClicks → no zero-sale recommendation
//   - scan() returns a result count consistent with successful POSTs
//
// `evaluateSearchTerm` is pure, so the rule tests target it directly. `scan()`
// tests wire through the full plumbing (fetch → POSTs → state update).

import { describe, it, expect } from 'vitest';
import {
  AutoNegativator,
  evaluateSearchTerm,
  nextRunTimestamp,
  type AutoNegDeps,
  type ScanSearchTerm,
} from '../auto-negativator';
import type { ApiResponse, AutoNegThresholds } from '../../../shared/ipc';

const DEFAULT_THRESHOLDS: AutoNegThresholds = {
  minClicks: 10,
  minAcosMultiplier: 1.5,
  minOrdersForAcos: 2,
};

function makeTerm(overrides: Partial<ScanSearchTerm>): ScanSearchTerm {
  return {
    id: 1,
    searchTerm: 'cookie recipe',
    campaignId: 'C100',
    localCampaignId: 100,
    impressions: 1000,
    clicks: 0,
    cost: 0,
    sales: 0,
    orders: 0,
    acos: 0,
    termType: 'keyword',
    marketplace: 'USA',
    ...overrides,
  };
}

describe('evaluateSearchTerm — rule (a) zero-sale', () => {
  it('fires when clicks ≥ minClicks AND orders = 0', () => {
    const term = makeTerm({ clicks: 12, cost: 4.8, orders: 0, sales: 0 });
    const drafts = evaluateSearchTerm(term, DEFAULT_THRESHOLDS);

    expect(drafts).toHaveLength(1);
    expect(drafts[0].rule_code).toBe('auto-neg-zero-sale');
    expect(drafts[0].suggested_action).toBe('add_negative');
    expect(drafts[0].search_term).toBe('cookie recipe');
    expect(drafts[0].subject_id).toBe(1);
    expect(drafts[0].campaign_id).toBe(100);
    expect(drafts[0].confidence).toBeGreaterThan(0.7);
    expect(drafts[0].metrics_snapshot.clicks).toBe(12);
    expect(drafts[0].metrics_snapshot.orders).toBe(0);
  });

  it('does not fire when clicks below minClicks', () => {
    const term = makeTerm({ clicks: 5, cost: 2, orders: 0 });
    const drafts = evaluateSearchTerm(term, DEFAULT_THRESHOLDS);

    // Rule (a) skipped. Spend < HIGH_SPEND_FLOOR (5), so rule (c) also skipped.
    expect(drafts).toEqual([]);
  });

  it('respects custom higher minClicks threshold', () => {
    const term = makeTerm({ clicks: 12, cost: 1.0, orders: 0 });
    const drafts = evaluateSearchTerm(term, { ...DEFAULT_THRESHOLDS, minClicks: 25 });

    // Rule (a) doesn't fire (12 < 25). Spend low, so rule (c) doesn't fire either.
    expect(drafts).toEqual([]);
  });
});

describe('evaluateSearchTerm — rule (b) high-ACOS', () => {
  it('fires when ACOS > target × multiplier with enough orders', () => {
    // ACOS 60 > target 30 × 1.5 = 45. Orders 5 ≥ minOrdersForAcos 2.
    const term = makeTerm({
      clicks: 30,
      cost: 90,
      sales: 150,
      orders: 5,
      acos: 60,
    });
    const drafts = evaluateSearchTerm(term, DEFAULT_THRESHOLDS);

    expect(drafts).toHaveLength(1);
    expect(drafts[0].rule_code).toBe('auto-neg-high-acos');
    expect(drafts[0].reason).toContain('ACOS');
  });

  it('does NOT fire when orders < minOrdersForAcos (statistical noise guard)', () => {
    // ACOS huge but only 1 order — too noisy to act on.
    const term = makeTerm({
      clicks: 30,
      cost: 90,
      sales: 30,
      orders: 1,
      acos: 300,
    });
    const drafts = evaluateSearchTerm(term, DEFAULT_THRESHOLDS);

    // Rule (a) skipped (orders > 0). Rule (b) skipped (orders < 2).
    // Rule (c) skipped (orders > 0).
    expect(drafts).toEqual([]);
  });
});

describe('nextRunTimestamp', () => {
  it('targets the next 03:00 local time', () => {
    const noon = new Date(2026, 4, 14, 12, 0, 0).getTime();
    const next = nextRunTimestamp(noon);
    const nd = new Date(next);
    expect(nd.getHours()).toBe(3);
    expect(nd.getMinutes()).toBe(0);
    // Next 03:00 is tomorrow because now=12:00 today.
    expect(nd.getDate()).toBe(15);
  });

  it('targets same-day 03:00 when called before 03:00', () => {
    const earlyMorning = new Date(2026, 4, 14, 1, 30, 0).getTime();
    const next = nextRunTimestamp(earlyMorning);
    const nd = new Date(next);
    expect(nd.getHours()).toBe(3);
    expect(nd.getDate()).toBe(14);
  });
});

describe('AutoNegativator.scan() integration', () => {
  function makeDeps(opts: {
    items: ScanSearchTerm[];
    enabled?: boolean;
    thresholds?: AutoNegThresholds;
  }): AutoNegDeps & { state: { enabled: boolean; thresholds: AutoNegThresholds; lastRunAt: string | null; lastRecommendationCount: number; lastError: string | null } } {
    const state = {
      enabled: opts.enabled ?? false,
      thresholds: opts.thresholds ?? DEFAULT_THRESHOLDS,
      lastRunAt: null as string | null,
      lastRecommendationCount: 0,
      lastError: null as string | null,
    };
    const fetchFn = async <T>(payload: {
      method: string;
      path: string;
    }): Promise<ApiResponse<T>> => {
      if (payload.method === 'GET' && payload.path === '/api/search-terms') {
        return { status: 200, ok: true, data: { items: opts.items } as unknown as T };
      }
      if (
        payload.method === 'POST' &&
        payload.path === '/api/automation/recommendations'
      ) {
        return { status: 201, ok: true, data: { id: 999 } as unknown as T };
      }
      return { status: 404, ok: false, data: null, error: 'Not mocked' };
    };
    return {
      state,
      fetchFn: fetchFn as AutoNegDeps['fetchFn'],
      readState: () => state,
      writeState: (partial) => {
        Object.assign(state, {
          ...partial,
          thresholds: partial.thresholds ?? state.thresholds,
        });
      },
      nowFn: () => new Date(2026, 4, 14, 12, 0, 0).getTime(),
      emitChange: () => undefined,
    };
  }

  it('runNow returns count consistent with successful POSTs (zero-sale + high-acos)', async () => {
    const deps = makeDeps({
      items: [
        makeTerm({ id: 1, clicks: 20, cost: 8, orders: 0, sales: 0 }), // (a)
        makeTerm({ id: 2, clicks: 5, cost: 1, orders: 0 }), // skipped (low clicks + low spend)
        makeTerm({
          id: 3,
          clicks: 40,
          cost: 90,
          sales: 150,
          orders: 5,
          acos: 60,
        }), // (b)
      ],
    });
    const negativator = new AutoNegativator(deps);

    const result = await negativator.runNow();

    expect(result.inspected).toBe(3);
    expect(result.added).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toEqual([]);
    // State persisted with lastRunAt + count.
    expect(deps.state.lastRunAt).toBeTruthy();
    expect(deps.state.lastRecommendationCount).toBe(2);
  });

  it('records lastError when search-terms fetch fails', async () => {
    const deps: AutoNegDeps = {
      fetchFn: (async () => ({ status: 500, ok: false, data: null, error: 'boom' })) as AutoNegDeps['fetchFn'],
      readState: () => ({
        enabled: false,
        thresholds: DEFAULT_THRESHOLDS,
        lastRunAt: null,
        lastRecommendationCount: 0,
        lastError: null,
      }),
      writeState: () => undefined,
      nowFn: () => Date.now(),
      emitChange: () => undefined,
    };
    const negativator = new AutoNegativator(deps);

    const result = await negativator.runNow();

    expect(result.added).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('search-terms fetch failed');
  });
});

describe('AutoNegativator.toggle + setThresholds', () => {
  function makeStateContainer() {
    const state = {
      enabled: false,
      thresholds: { ...DEFAULT_THRESHOLDS },
      lastRunAt: null as string | null,
      lastRecommendationCount: 0,
      lastError: null as string | null,
    };
    const deps: AutoNegDeps = {
      fetchFn: (async () => ({ status: 200, ok: true, data: { items: [] } })) as AutoNegDeps['fetchFn'],
      readState: () => state,
      writeState: (partial) => {
        Object.assign(state, {
          ...partial,
          thresholds: partial.thresholds ?? state.thresholds,
        });
      },
      nowFn: () => new Date(2026, 4, 14, 12, 0, 0).getTime(),
      emitChange: () => undefined,
    };
    return { state, deps };
  }

  it('toggle(true) persists enabled flag and schedules a timer', () => {
    const { state, deps } = makeStateContainer();
    const negativator = new AutoNegativator(deps);
    const result = negativator.toggle(true);
    expect(state.enabled).toBe(true);
    expect(result.enabled).toBe(true);
    expect(result.nextRunAt).toBeTruthy();
    negativator.stop();
  });

  it('setThresholds clamps out-of-range values to safe defaults', () => {
    const { deps } = makeStateContainer();
    const negativator = new AutoNegativator(deps);
    const next = negativator.setThresholds({
      minClicks: -50,
      minAcosMultiplier: 0.1, // below floor
      minOrdersForAcos: 999,
    });
    expect(next.minClicks).toBeGreaterThanOrEqual(1);
    expect(next.minAcosMultiplier).toBeGreaterThanOrEqual(1.0);
    expect(next.minOrdersForAcos).toBeLessThanOrEqual(100);
  });
});
