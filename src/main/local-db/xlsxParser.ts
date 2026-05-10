// Real xlsx parser for KDP royalty reports.
// Parses the first sheet of a workbook buffer, maps rows by header name,
// and returns RoyaltyRow[]. Header matching is case-insensitive and
// whitespace-tolerant. Missing optional columns produce undefined values.

import * as XLSX from 'xlsx';

export interface RoyaltyRow {
  marketplace?: string;
  asin?: string;
  title?: string;
  units_sold?: number;
  royalty?: number;
  currency?: string;
}

// Canonical header → possible aliases (lower-cased, trimmed).
const HEADER_ALIASES: Record<keyof RoyaltyRow, string[]> = {
  marketplace: ['marketplace', 'market', 'store'],
  asin: ['asin', 'asin/isbn'],
  title: ['title', 'book title', 'book_title', 'name'],
  units_sold: ['units sold', 'units_sold', 'quantity sold', 'units'],
  royalty: ['royalty', 'royalties', 'royalty amount', 'net royalty'],
  currency: ['currency', 'currency code', 'cur'],
};

type RoyaltyKey = keyof RoyaltyRow;

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function buildHeaderMap(headers: string[]): Map<RoyaltyKey, number> {
  const map = new Map<RoyaltyKey, number>();
  headers.forEach((h, idx) => {
    const norm = normalize(h);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [RoyaltyKey, string[]][]) {
      if (aliases.includes(norm) && !map.has(field)) {
        map.set(field, idx);
      }
    }
  });
  return map;
}

function toNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function toString(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  return String(v).trim() || undefined;
}

/**
 * Parse a KDP royalty xlsx workbook from a Buffer/Uint8Array.
 * Returns an empty array (with a console.warn) if the sheet structure is
 * unexpected (no recognisable headers, etc.).
 */
export function parseRoyaltyXlsx(data: Buffer | Uint8Array): RoyaltyRow[] {
  try {
    const workbook = XLSX.read(data, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      // eslint-disable-next-line no-console
      console.warn('[xlsxParser] workbook has no sheets');
      return [];
    }
    const sheet = workbook.Sheets[sheetName];
    // Convert to AOA (array-of-arrays) to handle header row manually.
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
    });

    if (aoa.length < 2) {
      // eslint-disable-next-line no-console
      console.warn('[xlsxParser] sheet has fewer than 2 rows (no data rows)');
      return [];
    }

    const headerRow = (aoa[0] as unknown[]).map((c) => String(c ?? ''));
    const headerMap = buildHeaderMap(headerRow);

    if (headerMap.size === 0) {
      // eslint-disable-next-line no-console
      console.warn('[xlsxParser] no recognisable columns found in header row:', headerRow);
      return [];
    }

    const rows: RoyaltyRow[] = [];
    for (let i = 1; i < aoa.length; i++) {
      const row = aoa[i] as unknown[];
      const get = (field: RoyaltyKey) => {
        const idx = headerMap.get(field);
        return idx !== undefined ? row[idx] : undefined;
      };

      // Skip entirely empty rows.
      if (row.every((c) => c === '' || c === null || c === undefined)) continue;

      rows.push({
        marketplace: toString(get('marketplace')),
        asin: toString(get('asin')),
        title: toString(get('title')),
        units_sold: toNumber(get('units_sold')),
        royalty: toNumber(get('royalty')),
        currency: toString(get('currency')),
      });
    }

    return rows;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[xlsxParser] failed to parse workbook:', err);
    return [];
  }
}
