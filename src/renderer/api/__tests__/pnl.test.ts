import { describe, it, expect, beforeEach, vi } from 'vitest';
import { computePnL, __testing } from '../pnl';
import { installMockApi } from '../../../test/mockApi';

// Helper to seed window.api with custom responses
function seedResponses(responses: Record<string, unknown>) {
  installMockApi({ responses });
}

describe('computePnL — cloud royalty + ads spend merge', () => {
  beforeEach(() => {
    seedResponses({
      '/api/metrics/summary/by-book': {
        date_from: '2026-05-01',
        date_to: '2026-05-31',
        attribution_window: '7d',
        books: [
          {
            book_id: 1,
            title: 'Test Book',
            cover_image: null,
            account: 'Test',
            marketplace: 'USA',
            currency: 'USD',
            impressions: 1000,
            clicks: 100,
            cost: 40, // ads spend
            sales: 200,
            orders: 10,
            ctr: 10,
            cpc: 0.4,
            acos: 20,
            royalty: 80,
            profit: 30,
          },
        ],
      },
      '/api/royalties/summary/2026-05': {
        target_month: '2026-05',
        by_book: [
          {
            asin: 'B0TEST001',
            book_title: 'Test Book',
            marketplace: 'USA',
            royalty: 80,
            revenue: 300, // KDP list-price revenue
            currency: 'USD',
          },
        ],
      },
    });
  });

  it('merges cloud royalty revenue with ads spend and computes net profit', async () => {
    const data = await computePnL({
      from: '2026-05-01',
      to: '2026-05-31',
      source: 'cloud',
    });
    expect(data.rows).toHaveLength(1);
    const row = data.rows[0];
    expect(row.title).toBe('Test Book');
    expect(row.marketplace).toBe('USA');
    expect(row.revenue).toBe(300); // KDP revenue
    expect(row.spend).toBe(40);
    expect(row.printCost).toBe(0); // no print cost configured
    expect(row.returns).toBe(0);
    expect(row.netProfit).toBe(260); // 300 - 40 - 0 - 0
    expect(row.margin).toBeCloseTo(260 / 300, 4);

    // Totals
    expect(data.totals.revenue).toBe(300);
    expect(data.totals.spend).toBe(40);
    expect(data.totals.netProfit).toBe(260);
  });
});

describe('computePnL — local royalty source', () => {
  beforeEach(() => {
    seedResponses({
      '/api/metrics/summary/by-book': {
        date_from: '2026-05-01',
        date_to: '2026-05-31',
        attribution_window: '7d',
        books: [
          {
            book_id: 1,
            title: 'Local Book',
            cover_image: null,
            account: null,
            marketplace: 'USA',
            currency: 'USD',
            impressions: 500,
            clicks: 50,
            cost: 20,
            sales: 100,
            orders: 5,
            ctr: 10,
            cpc: 0.4,
            acos: 20,
            royalty: 0,
            profit: 0,
          },
        ],
      },
    });
    // Wire up localRoyalty IPC mock on top of the base api
    (window as unknown as { api: Record<string, unknown> }).api.localRoyalty = {
      listUploads: vi.fn(async () => [
        {
          id: 7,
          account_id: 1,
          marketplace: 'USA',
          target_month: '2026-05',
          uploaded_at: '2026-05-30T00:00:00Z',
          total_units: 5,
          total_royalty: 30,
          total_revenue: 90,
        },
      ]),
      listRecords: vi.fn(async (uploadId: number) => {
        if (uploadId !== 7) return [];
        return [
          {
            id: 1,
            upload_id: 7,
            asin: 'B0LOCAL001',
            book_title: 'Local Book',
            marketplace: 'USA',
            target_month: '2026-05',
            units: 5,
            royalty: 30,
            revenue: 90,
            currency: 'USD',
          },
        ];
      }),
      getSummary: vi.fn(async () => null),
      import: vi.fn(),
      delete: vi.fn(),
      filePath: vi.fn(async () => '/tmp/royalty.json'),
    };
  });

  it('merges local royalty records with ads spend', async () => {
    const data = await computePnL({
      from: '2026-05-01',
      to: '2026-05-31',
      source: 'local',
    });
    expect(data.rows).toHaveLength(1);
    const row = data.rows[0];
    expect(row.title).toBe('Local Book');
    expect(row.revenue).toBe(90); // local-record revenue
    expect(row.spend).toBe(20);
    expect(row.netProfit).toBe(70); // 90 - 20
    expect(row.asin).toBe('B0LOCAL001');
  });
});

describe('computePnL — missing print_cost field', () => {
  beforeEach(() => {
    seedResponses({
      '/api/metrics/summary/by-book': {
        date_from: '2026-04-01',
        date_to: '2026-04-30',
        attribution_window: '7d',
        books: [
          {
            book_id: 42,
            title: 'No Cost Book',
            cover_image: null,
            account: null,
            marketplace: 'UK',
            currency: 'GBP',
            impressions: 100,
            clicks: 10,
            cost: 5,
            sales: 20,
            orders: 4,
            ctr: 10,
            cpc: 0.5,
            acos: 25,
            royalty: 15,
            profit: 10,
          },
        ],
      },
      '/api/royalties/summary/2026-04': {
        target_month: '2026-04',
        by_book: [],
      },
    });
  });

  it('gracefully defaults printCost to 0 when book_id is missing from cost map', async () => {
    const data = await computePnL({
      from: '2026-04-01',
      to: '2026-04-30',
      source: 'cloud',
      // No printCostByBookId provided
    });
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].printCost).toBe(0);
    // netProfit falls back to royalty - spend = 15 - 5 = 10
    expect(data.rows[0].revenue).toBe(15);
    expect(data.rows[0].netProfit).toBe(10);
  });

  it('applies printCost when book_id present in map', async () => {
    const data = await computePnL({
      from: '2026-04-01',
      to: '2026-04-30',
      source: 'cloud',
      printCostByBookId: { 42: 2.5 }, // £2.50/unit
    });
    // 4 orders × 2.50 = 10 print cost
    expect(data.rows[0].printCost).toBe(10);
    expect(data.rows[0].netProfit).toBe(0); // 15 - 5 - 10
  });
});

describe('computePnL — missing royalty data', () => {
  beforeEach(() => {
    seedResponses({
      '/api/metrics/summary/by-book': {
        date_from: '2026-05-01',
        date_to: '2026-05-31',
        attribution_window: '7d',
        books: [
          {
            book_id: 99,
            title: 'Orphan Book',
            cover_image: null,
            account: null,
            marketplace: 'USA',
            currency: 'USD',
            impressions: 200,
            clicks: 20,
            cost: 10,
            sales: 0,
            orders: 0,
            ctr: 10,
            cpc: 0.5,
            acos: 0,
            royalty: 0,
            profit: -10,
          },
        ],
      },
      // /api/royalties/summary/2026-05 NOT mocked → returns 404
    });
  });

  it('gracefully defaults royalty to 0 when endpoint fails', async () => {
    const data = await computePnL({
      from: '2026-05-01',
      to: '2026-05-31',
      source: 'cloud',
    });
    expect(data.rows).toHaveLength(1);
    const row = data.rows[0];
    expect(row.revenue).toBe(0); // no royalty data, no profit field, but b.royalty is 0
    expect(row.spend).toBe(10);
    expect(row.netProfit).toBe(-10); // pure ads loss
    expect(row.margin).toBe(0); // revenue is 0 → margin is 0 (not NaN)
  });
});

describe('__testing helpers', () => {
  it('monthOf extracts YYYY-MM from a date string', () => {
    expect(__testing.monthOf('2026-05-14')).toBe('2026-05');
    expect(__testing.monthOf('2026-12')).toBe('2026-12');
  });

  it('indexRoyaltyByAsin keys by `asin|MARKETPLACE`', () => {
    const map = __testing.indexRoyaltyByAsin([
      { asin: 'B001', marketplace: 'usa', royalty: 5, revenue: 10, book_title: 'A' },
      { asin: 'B002', marketplace: 'UK', royalty: 8, total_revenue: 20 },
    ]);
    expect(map.get('B001|USA')?.royalty).toBe(5);
    expect(map.get('B001|USA')?.title).toBe('A');
    expect(map.get('B002|UK')?.revenue).toBe(20);
  });
});
