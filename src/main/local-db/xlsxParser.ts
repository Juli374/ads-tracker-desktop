// Real xlsx/csv parser for KDP royalty reports.
//
// Supports two KDP-export shapes:
//   1. Monthly Royalty Report (.xlsx): columns
//      Royalty Type / Marketplace / Title / Author / ASIN /
//      Net Units Sold / Royalty / Currency
//   2. Sales Dashboard CSV (.csv) export from KDP: columns
//      ASIN / Title / Marketplace / Date / Units / Royalty
//
// The format is detected by sniffing the header row. Header matching is
// case-insensitive and whitespace-tolerant.
//
// On total failure (corrupt buffer, no recognisable headers, no sheets)
// the parser throws `RoyaltyParseError`. The lower-level `parseRoyaltyXlsx`
// is kept for backward compat and uses the same machinery but downgrades
// errors to "return []" for callers that expect a soft fail.
//
// Re-exported convenience: `parseRoyaltyFile()` returns `{records, warnings}`
// so the renderer can show a confirm-import preview with non-fatal warnings.

import * as XLSX from 'xlsx';

export interface RoyaltyRow {
  marketplace?: string;
  asin?: string;
  title?: string;
  units_sold?: number;
  royalty?: number;
  currency?: string;
}

export interface ParseResult {
  records: RoyaltyRow[];
  warnings: string[];
  /** Detected source format. */
  format: 'monthly-royalty' | 'sales-dashboard' | 'unknown';
}

export class RoyaltyParseError extends Error {
  public readonly code: string;
  public readonly details?: unknown;
  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = 'RoyaltyParseError';
    this.code = code;
    this.details = details;
  }
}

// Canonical header → possible aliases (lower-cased, trimmed).
// Two formats merge cleanly because Sales Dashboard uses ASIN/Title/Marketplace
// the same as Monthly Royalty Report; only the units/royalty headers diverge,
// and `units_sold` aliases cover both ("units" and "net units sold").
const HEADER_ALIASES: Record<keyof RoyaltyRow, string[]> = {
  marketplace: ['marketplace', 'market', 'store'],
  asin: ['asin', 'asin/isbn'],
  title: ['title', 'book title', 'book_title', 'name'],
  units_sold: [
    'units sold',
    'units_sold',
    'quantity sold',
    'units',
    'net units sold',
    'net_units_sold',
  ],
  royalty: ['royalty', 'royalties', 'royalty amount', 'net royalty'],
  currency: ['currency', 'currency code', 'cur'],
};

// Headers that, if present, signal Sales Dashboard format.
const SALES_DASHBOARD_HINTS = new Set(['date', 'order date']);
// Headers that, if present, signal Monthly Royalty Report format.
const MONTHLY_REPORT_HINTS = new Set([
  'royalty type',
  'royalty_type',
  'author',
  'net units sold',
  'net_units_sold',
]);

type RoyaltyKey = keyof RoyaltyRow;

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function buildHeaderMap(headers: string[]): Map<RoyaltyKey, number> {
  const map = new Map<RoyaltyKey, number>();
  headers.forEach((h, idx) => {
    const norm = normalize(h);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [
      RoyaltyKey,
      string[],
    ][]) {
      if (aliases.includes(norm) && !map.has(field)) {
        map.set(field, idx);
      }
    }
  });
  return map;
}

function detectFormat(headers: string[]): ParseResult['format'] {
  const norm = headers.map(normalize);
  if (norm.some((h) => MONTHLY_REPORT_HINTS.has(h))) return 'monthly-royalty';
  if (norm.some((h) => SALES_DASHBOARD_HINTS.has(h))) return 'sales-dashboard';
  return 'unknown';
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
 * Parse a KDP royalty workbook (xlsx or csv) from a Buffer/Uint8Array.
 * Throws `RoyaltyParseError` when the buffer is corrupt, has no sheets,
 * or has no recognisable header columns.
 *
 * Non-fatal issues (rows skipped because empty, missing optional values)
 * are returned via `warnings`.
 */
export function parseRoyaltyFile(data: Buffer | Uint8Array): ParseResult {
  let workbook: XLSX.WorkBook;
  try {
    // xlsx supports both .xlsx (binary) and .csv (text) buffers via type:'buffer'.
    workbook = XLSX.read(data, { type: 'buffer' });
  } catch (err) {
    throw new RoyaltyParseError(
      'Failed to parse workbook (corrupt or unsupported format)',
      'CORRUPT_BUFFER',
      err,
    );
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new RoyaltyParseError('Workbook has no sheets', 'NO_SHEETS');
  }
  const sheet = workbook.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
  });

  if (aoa.length < 2) {
    throw new RoyaltyParseError(
      'Sheet has fewer than 2 rows (header + data expected)',
      'EMPTY_SHEET',
    );
  }

  const headerRow = (aoa[0] as unknown[]).map((c) => String(c ?? ''));
  const headerMap = buildHeaderMap(headerRow);

  if (headerMap.size === 0) {
    throw new RoyaltyParseError(
      'No recognisable columns in header row',
      'NO_HEADERS',
      { headerRow },
    );
  }

  const format = detectFormat(headerRow);
  const warnings: string[] = [];
  const required: RoyaltyKey[] = ['asin', 'title'];
  for (const k of required) {
    if (!headerMap.has(k)) {
      warnings.push(`Header column "${k}" missing — values will be empty`);
    }
  }

  const records: RoyaltyRow[] = [];
  let skipped = 0;
  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i] as unknown[];
    const get = (field: RoyaltyKey) => {
      const idx = headerMap.get(field);
      return idx !== undefined ? row[idx] : undefined;
    };

    if (row.every((c) => c === '' || c === null || c === undefined)) {
      skipped += 1;
      continue;
    }

    records.push({
      marketplace: toString(get('marketplace')),
      asin: toString(get('asin')),
      title: toString(get('title')),
      units_sold: toNumber(get('units_sold')),
      royalty: toNumber(get('royalty')),
      currency: toString(get('currency')),
    });
  }

  if (skipped > 0) {
    warnings.push(`Skipped ${skipped} empty row${skipped === 1 ? '' : 's'}`);
  }

  return { records, warnings, format };
}

/**
 * Backwards-compatible soft-fail wrapper. Returns [] on any error and logs
 * the cause, instead of throwing. Kept so existing callers continue to work.
 */
export function parseRoyaltyXlsx(data: Buffer | Uint8Array): RoyaltyRow[] {
  try {
    return parseRoyaltyFile(data).records;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[xlsxParser] failed to parse workbook:', err);
    return [];
  }
}
