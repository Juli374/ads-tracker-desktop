import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  fetchLocalRoyaltyByBookRange,
  localRoyaltyApi,
  __testing,
} from '../localRoyalty';

// Minimal upload/record factories matching the IPC shapes we read.
function upload(id: number, target_month: string) {
  return {
    id,
    account_id: 1,
    marketplace: 'USA',
    target_month,
    uploaded_at: `${target_month}-15T00:00:00Z`,
    total_units: 0,
    total_royalty: 0,
    total_revenue: 0,
  };
}

function record(
  upload_id: number,
  fields: {
    asin?: string;
    book_id?: number | null;
    book_title?: string;
    marketplace?: string;
    target_month: string;
    royalty: number;
  },
) {
  return {
    id: Math.floor(Math.random() * 1e6),
    upload_id,
    marketplace: fields.marketplace ?? 'USA',
    units: 1,
    revenue: fields.royalty * 2,
    currency: 'USD',
    ...fields,
  };
}

describe('fetchLocalRoyaltyByBookRange', () => {
  afterEach(() => {
    // Clean window.api between tests.
    (window as unknown as { api?: unknown }).api = undefined;
  });

  it('returns empty maps when the local store is unavailable', async () => {
    (window as unknown as { api?: unknown }).api = undefined;
    expect(localRoyaltyApi.isAvailable()).toBe(false);
    const res = await fetchLocalRoyaltyByBookRange('2026-05-01', '2026-05-31');
    expect(res.byBookId.size).toBe(0);
    expect(res.byAsin.size).toBe(0);
    expect(res.byTitle.size).toBe(0);
  });

  describe('with a wired local store spanning multiple months', () => {
    beforeEach(() => {
      const uploads = [
        upload(10, '2026-03'), // before range — excluded
        upload(11, '2026-04'), // in range
        upload(12, '2026-05'), // in range
        upload(13, '2026-06'), // after range — excluded
      ];
      const recordsByUpload: Record<number, ReturnType<typeof record>[]> = {
        10: [
          record(10, {
            book_id: 1,
            asin: 'B001',
            book_title: 'Alpha',
            target_month: '2026-03',
            royalty: 999, // must NOT be counted
          }),
        ],
        11: [
          record(11, {
            book_id: 1,
            asin: 'B001',
            book_title: 'Alpha',
            target_month: '2026-04',
            royalty: 100,
          }),
        ],
        12: [
          record(12, {
            book_id: 1,
            asin: 'B001',
            book_title: 'Alpha',
            marketplace: 'usa',
            target_month: '2026-05',
            royalty: 50,
          }),
          // Legacy row: no book_id → only asin + title keys.
          record(12, {
            book_id: null,
            asin: 'B002',
            book_title: 'Beta',
            target_month: '2026-05',
            royalty: 30,
          }),
          // Zero-royalty row is skipped entirely.
          record(12, {
            book_id: 7,
            asin: 'B007',
            book_title: 'Zeroed',
            target_month: '2026-05',
            royalty: 0,
          }),
        ],
        13: [
          record(13, {
            book_id: 1,
            asin: 'B001',
            book_title: 'Alpha',
            target_month: '2026-06',
            royalty: 999, // must NOT be counted
          }),
        ],
      };

      (window as unknown as { api: Record<string, unknown> }).api = {
        localRoyalty: {
          listUploads: vi.fn(async () => uploads),
          listRecords: vi.fn(async (id: number) => recordsByUpload[id] ?? []),
          getSummary: vi.fn(async () => null),
          import: vi.fn(),
          delete: vi.fn(),
          filePath: vi.fn(async () => '/tmp/r.json'),
        },
      };
    });

    it('sums royalty per book across the range, excluding out-of-range months', async () => {
      const res = await fetchLocalRoyaltyByBookRange('2026-04-10', '2026-05-20');
      // book_id 1 = 100 (Apr) + 50 (May); March/June excluded.
      expect(res.byBookId.get(1)).toBe(150);
      // Legacy Beta row has no book_id → absent from byBookId.
      expect(res.byBookId.has(0)).toBe(false);
      // Zero-royalty row contributes nothing.
      expect(res.byBookId.has(7)).toBe(false);
    });

    it('keys byAsin as `ASIN|MARKETPLACE` (uppercased) and byTitle lowercased', async () => {
      const res = await fetchLocalRoyaltyByBookRange('2026-04-01', '2026-05-31');
      expect(res.byAsin.get('B001|USA')).toBe(150); // 100 USA + 50 usa→USA
      expect(res.byAsin.get('B002|USA')).toBe(30);
      expect(res.byTitle.get('alpha')).toBe(150);
      expect(res.byTitle.get('beta')).toBe(30);
    });

    it('honors the from/to month boundaries inclusively', async () => {
      // Only May.
      const res = await fetchLocalRoyaltyByBookRange('2026-05-01', '2026-05-31');
      expect(res.byBookId.get(1)).toBe(50);
      expect(res.byTitle.get('beta')).toBe(30);
    });
  });
});

describe('__testing.monthOf', () => {
  it('extracts YYYY-MM from a date string', () => {
    expect(__testing.monthOf('2026-05-14')).toBe('2026-05');
    expect(__testing.monthOf('2026-12')).toBe('2026-12');
  });
});
