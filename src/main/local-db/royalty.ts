// Royalty CRUD на локальном сторе.
// Названия методов и shape возвращаемых объектов специально совпадают с
// `src/renderer/api/royalties.ts` (Cloud-источник), чтобы UI мог легко
// переключаться между источниками.

import {
  localStore,
  type RoyaltyUploadRow,
  type RoyaltyRecordRow,
  type RoyaltyRecordType,
} from './index';
import {
  parseRoyaltyFile,
  RoyaltyParseError,
  type RoyaltyRow,
} from './xlsxParser';

export { RoyaltyParseError };

export interface RoyaltyMonthSummary {
  target_month: string;
  totals: {
    units: number;
    royalty: number;
    revenue: number;
  };
  by_marketplace: Array<{
    marketplace: string;
    units: number;
    royalty: number;
    revenue: number;
  }>;
}

/**
 * Rich per-record fields (Phase D-B). All optional so legacy/flat callers keep
 * working: a caller that only supplies units/royalty/revenue still imports
 * fine, and the persisted row simply carries nulls for the unset rich columns.
 */
export interface ImportRecord {
  asin?: string;
  book_title?: string;
  units: number;
  royalty: number;
  revenue: number;
  currency?: string;
  record_type?: RoyaltyRecordType;
  book_id?: number | null;
  author_name?: string | null;
  isbn?: string | null;
  royalty_date?: string | null;
  order_date?: string | null;
  read_date?: string | null;
  royalty_type?: string | null;
  transaction_type?: string | null;
  units_sold?: number;
  units_refunded?: number;
  net_units_sold?: number;
  avg_list_price?: number | null;
  avg_offer_price?: number | null;
  avg_file_size_mb?: number | null;
  avg_delivery_cost?: number | null;
  avg_manufacturing_cost?: number | null;
  kenp_read?: number;
}

export interface ImportPayload {
  account_id: number;
  account_name?: string;
  marketplace: string;
  target_month: string;
  source_filename?: string;
  records: ImportRecord[];
}

// Чистим NaN/Infinity и заводим в 0 — эти значения ломают и арифметику в getSummary,
// и JSON-сериализацию (Infinity → null без warning'а).
const safeNumber = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const TARGET_MONTH_RE = /^\d{4}-\d{2}$/;
const MARKETPLACE_RE = /^[A-Z]{2,8}$/;

const sanitizeImport = (p: ImportPayload): ImportPayload => {
  if (!TARGET_MONTH_RE.test(p.target_month)) {
    throw new Error('local:royalty:import: target_month must match YYYY-MM');
  }
  if (!MARKETPLACE_RE.test(p.marketplace)) {
    throw new Error('local:royalty:import: marketplace must be 2-8 uppercase letters');
  }
  return {
    ...p,
    records: p.records.map((r) => ({
      ...r,
      units: safeNumber(r.units),
      royalty: safeNumber(r.royalty),
      revenue: safeNumber(r.revenue),
    })),
  };
};

export const localRoyalty = {
  listUploads(): RoyaltyUploadRow[] {
    return localStore.read().royalty_uploads.slice().sort((a, b) =>
      (b.uploaded_at ?? '').localeCompare(a.uploaded_at ?? ''),
    );
  },

  listRecords(uploadId: number): RoyaltyRecordRow[] {
    return localStore.read().royalty_records.filter((r) => r.upload_id === uploadId);
  },

  getSummary(targetMonth: string): RoyaltyMonthSummary {
    const state = localStore.read();
    const records = state.royalty_records.filter((r) => r.target_month === targetMonth);
    const totals = records.reduce(
      (acc, r) => ({
        units: acc.units + (r.units || 0),
        royalty: acc.royalty + (r.royalty || 0),
        revenue: acc.revenue + (r.revenue || 0),
      }),
      { units: 0, royalty: 0, revenue: 0 },
    );
    const mpMap = new Map<string, { units: number; royalty: number; revenue: number }>();
    for (const r of records) {
      const cur = mpMap.get(r.marketplace) ?? { units: 0, royalty: 0, revenue: 0 };
      cur.units += r.units || 0;
      cur.royalty += r.royalty || 0;
      cur.revenue += r.revenue || 0;
      mpMap.set(r.marketplace, cur);
    }
    return {
      target_month: targetMonth,
      totals,
      by_marketplace: Array.from(mpMap.entries()).map(([marketplace, m]) => ({
        marketplace,
        ...m,
      })),
    };
  },

  /**
   * Parse a KDP report buffer (xlsx or csv) into a normalised
   * `ImportPayload`-shaped preview. Caller still has to supply
   * `account_id`, `marketplace` and `target_month` (UI form fields)
   * before calling `importUpload`.
   *
   * Throws `RoyaltyParseError` on corrupt input or unrecognised headers.
   */
  parseFile(data: Buffer | Uint8Array): {
    records: ImportPayload['records'];
    warnings: string[];
    format: 'monthly-royalty' | 'sales-dashboard' | 'unknown';
  } {
    const result = parseRoyaltyFile(data);
    return {
      records: result.records.map((r: RoyaltyRow) => ({
        asin: r.asin,
        book_title: r.title,
        units: safeNumber(r.units_sold),
        royalty: safeNumber(r.royalty),
        // KDP reports do not include "revenue" — use royalty as the floor.
        // The cloud importer does the same; renderer can override later.
        revenue: safeNumber(r.royalty),
        currency: r.currency,
      })),
      warnings: result.warnings,
      format: result.format,
    };
  },

  // Импорт распарсенного KDP-отчёта. Renderer прокидывает уже распарсенные
  // строки; парсинг xlsx/csv живёт в src/main/local-db/xlsxParser.ts
  // (parseRoyaltyFile + parseRoyaltyXlsx). Bridged через `parseFile` выше.
  importUpload(rawPayload: ImportPayload): { upload_id: number; records_added: number } {
    const payload = sanitizeImport(rawPayload);
    let createdId = 0;
    let added = 0;
    localStore.mutate((state) => {
      const uploadId = state.next_upload_id;
      state.next_upload_id += 1;
      createdId = uploadId;

      const totals = payload.records.reduce(
        (acc, r) => ({
          units: acc.units + (r.units || 0),
          royalty: acc.royalty + (r.royalty || 0),
          revenue: acc.revenue + (r.revenue || 0),
        }),
        { units: 0, royalty: 0, revenue: 0 },
      );

      const upload: RoyaltyUploadRow = {
        id: uploadId,
        account_id: payload.account_id,
        account_name: payload.account_name,
        marketplace: payload.marketplace,
        target_month: payload.target_month,
        uploaded_at: new Date().toISOString(),
        source_filename: payload.source_filename,
        total_units: totals.units,
        total_royalty: totals.royalty,
        total_revenue: totals.revenue,
        currency: payload.records[0]?.currency,
      };
      state.royalty_uploads.push(upload);

      for (const r of payload.records) {
        const row: RoyaltyRecordRow = {
          id: state.next_record_id,
          upload_id: uploadId,
          asin: r.asin,
          book_title: r.book_title,
          marketplace: payload.marketplace,
          target_month: payload.target_month,
          units: r.units,
          royalty: r.royalty,
          revenue: r.revenue,
          currency: r.currency,
          // Phase D-B rich fields. Default record_type to 'legacy' when the
          // caller didn't classify the row (keeps flat imports valid).
          record_type: r.record_type ?? 'legacy',
          book_id: r.book_id ?? null,
          author_name: r.author_name ?? null,
          isbn: r.isbn ?? null,
          royalty_date: r.royalty_date ?? null,
          order_date: r.order_date ?? null,
          read_date: r.read_date ?? null,
          royalty_type: r.royalty_type ?? null,
          transaction_type: r.transaction_type ?? null,
          units_sold: typeof r.units_sold === 'number' ? r.units_sold : r.units,
          units_refunded: typeof r.units_refunded === 'number' ? r.units_refunded : 0,
          net_units_sold: typeof r.net_units_sold === 'number' ? r.net_units_sold : r.units,
          avg_list_price: r.avg_list_price ?? null,
          avg_offer_price: r.avg_offer_price ?? null,
          avg_file_size_mb: r.avg_file_size_mb ?? null,
          avg_delivery_cost: r.avg_delivery_cost ?? null,
          avg_manufacturing_cost: r.avg_manufacturing_cost ?? null,
          kenp_read: typeof r.kenp_read === 'number' ? r.kenp_read : 0,
          account: payload.account_name ?? null,
          file_hash: null,
        };
        state.royalty_records.push(row);
        state.next_record_id += 1;
        added += 1;
      }
    });
    return { upload_id: createdId, records_added: added };
  },

  deleteUpload(uploadId: number): { deleted: number } {
    let removed = 0;
    localStore.mutate((state) => {
      const before = state.royalty_uploads.length;
      state.royalty_uploads = state.royalty_uploads.filter((u) => u.id !== uploadId);
      state.royalty_records = state.royalty_records.filter((r) => r.upload_id !== uploadId);
      removed = before - state.royalty_uploads.length;
    });
    return { deleted: removed };
  },
};
