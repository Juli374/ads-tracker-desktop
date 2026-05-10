// Royalty CRUD на локальном сторе.
// Названия методов и shape возвращаемых объектов специально совпадают с
// `src/renderer/api/royalties.ts` (Cloud-источник), чтобы UI мог легко
// переключаться между источниками.

import {
  localStore,
  type RoyaltyUploadRow,
  type RoyaltyRecordRow,
} from './index';

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

export interface ImportPayload {
  account_id: number;
  account_name?: string;
  marketplace: string;
  target_month: string;
  source_filename?: string;
  records: Array<{
    asin?: string;
    book_title?: string;
    units: number;
    royalty: number;
    revenue: number;
    currency?: string;
  }>;
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

  // Импорт парсенного KDP-отчёта. Renderer прокидывает уже распарсенные строки;
  // парсинг xlsx живёт в src/main/local-db/xlsxParser.ts (parseRoyaltyXlsx).
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
        state.royalty_records.push({
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
        });
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
