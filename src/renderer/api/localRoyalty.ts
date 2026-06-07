// Тонкий wrapper над window.api.localRoyalty для consistency с другими api/*.
// Используется из RoyaltiesPage когда юзер выбирает источник = 'local'.

import type {
  LocalRoyaltyUpload,
  LocalRoyaltyRecord,
  LocalRoyaltyMonthSummary,
  LocalRoyaltyImportPayload,
  LocalRoyaltyParseResult,
} from '../../shared/ipc';

export type {
  LocalRoyaltyUpload,
  LocalRoyaltyRecord,
  LocalRoyaltyMonthSummary,
  LocalRoyaltyImportPayload,
  LocalRoyaltyParseResult,
};

const winApi = (): NonNullable<Window['api']>['localRoyalty'] | null => {
  return window.api?.localRoyalty ?? null;
};

export const localRoyaltyApi = {
  isAvailable(): boolean {
    return winApi() !== null;
  },

  async listUploads(): Promise<LocalRoyaltyUpload[]> {
    const api = winApi();
    if (!api) return [];
    return api.listUploads();
  },

  async listRecords(uploadId: number): Promise<LocalRoyaltyRecord[]> {
    const api = winApi();
    if (!api) return [];
    return api.listRecords(uploadId);
  },

  async getSummary(targetMonth: string): Promise<LocalRoyaltyMonthSummary | null> {
    const api = winApi();
    if (!api) return null;
    return api.getSummary(targetMonth);
  },

  async import(
    payload: LocalRoyaltyImportPayload,
  ): Promise<{ upload_id: number; records_added: number }> {
    const api = winApi();
    if (!api) throw new Error('localRoyalty IPC unavailable');
    return api.import(payload);
  },

  async delete(uploadId: number): Promise<{ deleted: number }> {
    const api = winApi();
    if (!api) throw new Error('localRoyalty IPC unavailable');
    return api.delete(uploadId);
  },

  async filePath(): Promise<string> {
    const api = winApi();
    if (!api) return '';
    return api.filePath();
  },

  async parseFile(absPath: string): Promise<LocalRoyaltyParseResult> {
    const api = winApi();
    if (!api?.parseFile) throw new Error('localRoyalty.parseFile IPC unavailable');
    return api.parseFile(absPath);
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Per-book royalty aggregation over a date RANGE.
//
// Pages that show a book list over a [from,to] window (BooksPage, Dashboard)
// need total local royalty per book across every month the range spans — not a
// single month like pnl.ts. We iterate uploads whose `target_month` (YYYY-MM)
// falls inside the range's month span, sum each record's `royalty`, and expose
// three lookup maps so the caller can join against whatever identity it has:
//
//   byBookId  — local record.book_id  ↔  cloud summary book_id   (most reliable)
//   byAsin    — `ASIN|MARKETPLACE`     ↔  per-marketplace ASIN rows
//   byTitle   — lowercased title       ↔  title fallback
//
// `byTitle` here is keyed by lowercased title ONLY (no marketplace), because the
// Books list aggregates a book across all its marketplaces — the group has one
// title and no single marketplace. Returns empty maps when the local store is
// unavailable, so callers degrade gracefully to cloud-only behavior.
export interface LocalRoyaltyByBook {
  byBookId: Map<number, number>;
  byAsin: Map<string, number>;
  byTitle: Map<string, number>;
}

function emptyByBook(): LocalRoyaltyByBook {
  return { byBookId: new Map(), byAsin: new Map(), byTitle: new Map() };
}

/** YYYY-MM-DD or YYYY-MM → YYYY-MM. */
function monthOf(date: string): string {
  return date.slice(0, 7);
}

function addTo<K>(map: Map<K, number>, key: K, amount: number): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

/**
 * Build per-book local-royalty maps covering every month spanned by [from,to].
 * `from`/`to` are YYYY-MM-DD (the format BooksPage's RangePicker produces).
 */
export async function fetchLocalRoyaltyByBookRange(
  from: string,
  to: string,
): Promise<LocalRoyaltyByBook> {
  if (!localRoyaltyApi.isAvailable()) return emptyByBook();
  const out = emptyByBook();
  try {
    const fromMonth = monthOf(from);
    const toMonth = monthOf(to);
    const uploads = await localRoyaltyApi.listUploads();
    // YYYY-MM strings are lexically ordered, so string comparison == chronological.
    const inRange = uploads.filter(
      (u) => u.target_month >= fromMonth && u.target_month <= toMonth,
    );
    const recordLists = await Promise.all(
      inRange.map((u) => localRoyaltyApi.listRecords(u.id)),
    );
    for (const records of recordLists) {
      for (const r of records) {
        const royalty =
          typeof r.royalty === 'number' && Number.isFinite(r.royalty)
            ? r.royalty
            : 0;
        if (royalty === 0) continue;
        if (typeof r.book_id === 'number') {
          addTo(out.byBookId, r.book_id, royalty);
        }
        const mp = (r.marketplace || '').toUpperCase();
        if (r.asin) addTo(out.byAsin, `${r.asin}|${mp}`, royalty);
        if (r.book_title) addTo(out.byTitle, r.book_title.toLowerCase(), royalty);
      }
    }
  } catch {
    // graceful: local store unavailable → empty maps
    return emptyByBook();
  }
  return out;
}

// Exposed for tests.
export const __testing = { monthOf };
