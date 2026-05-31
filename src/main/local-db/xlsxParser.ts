// Real xlsx/csv parser for KDP royalty reports.
//
// This module has TWO entry points:
//
//   1. `parseCanonical()` — the FULL 4-sheet KDP Royalties report parser, a
//      1:1 port of the backend canonical implementation
//      (ads-tracker/backend/services/royalty_import_service.py). It reads the
//      four named sheets ("eBook Royalty", "Paperback Royalty",
//      "Hardcover Royalty", "KENP Read") by COLUMN POSITION (not header text),
//      replicates parse_date / parse_numeric / parse_int / convert_marketplace
//      + the full MARKETPLACE_MAP, applies the same dual-date filtering
//      (order_date -> sales, royalty_date -> royalties, read_date -> KENP) and
//      month filtering, and emits the same rich per-record field set. Its
//      output is verified for parity against expected_canonical.json.
//
//   2. `parseRoyaltyFile()` / `parseRoyaltyXlsx()` — the LEGACY flat
//      single-sheet parser (Monthly Royalty Report / Sales Dashboard CSV) with
//      header-alias sniffing. Kept for backward compat with existing renderer
//      preview flows and tests. Header matching is case-insensitive and
//      whitespace-tolerant.
//
// On total failure (corrupt buffer, no recognisable headers, no sheets) the
// legacy parser throws `RoyaltyParseError`. `parseRoyaltyXlsx` downgrades that
// to "return []" for soft-fail callers.

import * as XLSX from 'xlsx';

// ============================================================================
// Canonical backend parity layer
// ============================================================================
//
// Everything in this section mirrors backend/services/royalty_import_service.py
// field-for-field and index-for-index. Do NOT "improve" it independently — the
// backend is the frozen reference (legacy, read-only) and the desktop must
// match it exactly so historical and desktop data stay comparable.

// Title aliases: map alternate titles to the canonical title. Mirrors the
// backend TITLE_ALIASES dict (applied inside book lookup).
export const TITLE_ALIASES: Record<string, string> = {
  'Excel: Umfassender Ratgeber für Anfänger und Fortgeschrittene in Office 365 und Office 2021 mit Formeln, Funktionen, Beispielen und Tipps':
    'Excel 2024: Umfassender Ratgeber für Anfänger und Fortgeschrittene in Office 365 und Office 2021 mit Formeln, Funktionen, Beispielen und Tipps',
};

// Marketplace mapping: Amazon domain -> our 2-letter code. 21 entries, matches
// the backend MARKETPLACE_MAP exactly (including iteration is irrelevant — it's
// a plain lookup).
export const MARKETPLACE_MAP: Record<string, string> = {
  'Amazon.com': 'USA',
  'Amazon.co.uk': 'UK',
  'Amazon.ca': 'CA',
  'Amazon.com.au': 'AU',
  'Amazon.de': 'DE',
  'Amazon.fr': 'FR',
  'Amazon.es': 'ES',
  'Amazon.it': 'IT',
  'Amazon.co.jp': 'JP',
  'Amazon.com.mx': 'MX',
  'Amazon.com.br': 'BR',
  'Amazon.nl': 'NL',
  'Amazon.pl': 'PL',
  'Amazon.se': 'SE',
  'Amazon.in': 'IN',
  'Amazon.sg': 'SG',
  'Amazon.ae': 'AE',
  'Amazon.sa': 'SA',
  'Amazon.eg': 'EG',
  'Amazon.com.tr': 'TR',
  'Amazon.com.be': 'BE',
};

/** convert_marketplace: Amazon domain -> our code; unmapped passes through;
 *  empty/falsy -> 'USA'. Matches backend convert_marketplace(). */
export function convertMarketplace(amazonMarketplace: unknown): string {
  if (!amazonMarketplace) return 'USA';
  const key = String(amazonMarketplace);
  return MARKETPLACE_MAP[key] ?? key;
}

/** parse_date: returns an ISO `YYYY-MM-DD` string or null. Mirrors backend
 *  parse_date(): accepts Date objects, ISO strings, and `%d/%m/%Y` /
 *  `%m/%d/%Y` forms. Returns null for None / '' / 'N/A'. Excel cells read by
 *  the `xlsx` lib come back either as JS strings (when stored as text) or, for
 *  true date cells, as numbers/Date — we handle both. */
export function parseDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  // True JS Date (xlsx with cellDates, or a Date passed directly).
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return toIsoDate(value);
  }

  if (typeof value === 'number') {
    // Excel serial date number -> JS Date via xlsx helper.
    const d = XLSX.SSF?.parse_date_code
      ? XLSX.SSF.parse_date_code(value)
      : null;
    if (d && d.y) {
      return `${pad4(d.y)}-${pad2(d.m)}-${pad2(d.d)}`;
    }
    return null;
  }

  if (typeof value === 'string') {
    const v = value.trim();
    if (!v || v.toUpperCase() === 'N/A') return null;

    // %Y-%m-%d
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
    if (m) {
      return validIso(Number(m[1]), Number(m[2]), Number(m[3]));
    }
    // %d/%m/%Y  then  %m/%d/%Y (try in backend's strptime order)
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      const year = Number(m[3]);
      // %d/%m/%Y first: a=day, b=month
      const asDM = validIso(year, b, a);
      if (asDM) return asDM;
      // fall back to %m/%d/%Y: a=month, b=day
      return validIso(year, a, b);
    }
    return null;
  }

  return null;
}

/** parse_numeric: float or null. Handles comma-decimal, 'N/A', '-'. Mirrors
 *  backend parse_numeric(). */
export function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const v = value.trim();
    if (!v || v.toUpperCase() === 'N/A' || v === '-') return null;
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** parse_int: integer, defaults to 0. Handles comma-decimal, 'N/A', '-'.
 *  Mirrors backend parse_int() (which does int(float(...)) — truncates toward
 *  zero). */
export function parseInt_(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.trunc(value) : 0;
  }
  if (typeof value === 'string') {
    const v = value.trim();
    if (!v || v.toUpperCase() === 'N/A' || v === '-') return 0;
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  }
  return 0;
}

function isDateInMonth(
  iso: string | null,
  targetYear: number,
  targetMonth: number,
): boolean {
  if (!iso) return false;
  const [y, m] = iso.split('-').map(Number);
  return y === targetYear && m === targetMonth;
}

function getTargetMonthDate(year: number, month: number): string {
  return `${pad4(year)}-${pad2(month)}-01`;
}

// String coercion mirroring the Python `str(row[x]) if row[x] else None`
// idiom: falsy (None/''/0) -> null, else String(...). Note: 0 is falsy in
// Python too, so a literal 0 in a string column becomes null — kept for
// fidelity, though these columns never legitimately hold 0.
function strOrNull(value: unknown): string | null {
  if (!value) return null;
  return String(value);
}

// `row[x]` passthrough used by the backend for title / author / asin (no
// coercion at all — Python keeps the native cell value). For xlsx text cells
// these are strings; we return the value as-is but normalise empty -> null to
// match the JSON the backend produces (Python None serialises to null).
function rawOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return typeof value === 'string' ? value : String(value);
}

export interface EbookRoyaltyRecord {
  royalty_date: string | null;
  title: string | null;
  author_name: string | null;
  asin: string | null;
  marketplace: string;
  royalty_type: string | null;
  transaction_type: string | null;
  units_sold: number;
  units_refunded: number;
  net_units_sold: number;
  avg_list_price: number | null;
  avg_offer_price: number | null;
  avg_file_size_mb: number | null;
  avg_delivery_cost: number | null;
  royalty: number | null;
  currency: string | null;
  target_month: string;
  book_id: number | null;
}

export interface PrintRoyaltyRecord {
  royalty_date: string | null;
  order_date: string | null;
  title: string | null;
  author_name: string | null;
  isbn: string | null;
  asin: string | null;
  marketplace: string;
  royalty_type: string | null;
  transaction_type: string | null;
  units_sold: number;
  units_refunded: number;
  net_units_sold: number;
  avg_list_price: number | null;
  avg_offer_price: number | null;
  avg_manufacturing_cost: number | null;
  royalty: number | null;
  currency: string | null;
  target_month: string;
  book_id: number | null;
}

export interface KenpReadRecord {
  date: string | null;
  title: string | null;
  author_name: string | null;
  asin: string | null;
  marketplace: string;
  kenp_read: number;
  target_month: string;
  book_id: number | null;
}

export interface CanonicalParseResult {
  ebook_royalties: EbookRoyaltyRecord[];
  paperback_sales: PrintRoyaltyRecord[];
  paperback_royalties: PrintRoyaltyRecord[];
  hardcover_sales: PrintRoyaltyRecord[];
  hardcover_royalties: PrintRoyaltyRecord[];
  kenp_reads: KenpReadRecord[];
}

/**
 * Deterministic, DB-free book_id assigner. Mirrors the backend's
 * get_or_create_book() book-id resolution shape for the parity fixture: ids
 * start at 1001 and increment by first-seen (account::canonical-title) key, in
 * sheet processing order (eBook -> Paperback -> Hardcover -> KENP). Title
 * aliases are applied before keying. In real desktop use this is replaced by a
 * lookup against the local book store; here it gives a stable, reproducible id
 * so the parity fixture can pin exact values.
 */
class BookIdAssigner {
  private cache = new Map<string, number>();
  private next: number;
  constructor(
    private account: string | null,
    startAt = 1001,
  ) {
    this.next = startAt;
  }
  resolve(title: unknown): number | null {
    if (!title) return null;
    const canonical = TITLE_ALIASES[title as string] ?? (title as string);
    const key = `${this.account}::${canonical}`;
    const existing = this.cache.get(key);
    if (existing !== undefined) return existing;
    const id = this.next;
    this.next += 1;
    this.cache.set(key, id);
    return id;
  }
}

type Row = unknown[];

function sheetRows(ws: XLSX.WorkSheet): Row[] {
  // Read raw cell values by position. `header: 1` -> array-of-arrays; raw:true
  // keeps numbers as numbers and dates per cellDates. We then iterate from
  // row index 1 (skip the header), mirroring backend min_row=2.
  const aoa = XLSX.utils.sheet_to_json<Row>(ws, {
    header: 1,
    raw: true,
    blankrows: false,
    defval: null,
  });
  return aoa.slice(1);
}

function parseEbookSheet(
  ws: XLSX.WorkSheet,
  year: number,
  month: number,
  books: BookIdAssigner,
): EbookRoyaltyRecord[] {
  const out: EbookRoyaltyRecord[] = [];
  const targetMonthStr = getTargetMonthDate(year, month);
  for (const row of sheetRows(ws)) {
    if (!row[0]) continue; // skip empty (row[0] falsy)
    const royaltyDate = parseDate(row[0]);
    if (!isDateInMonth(royaltyDate, year, month)) continue;
    const title = rawOrNull(row[1]);
    out.push({
      royalty_date: royaltyDate,
      title,
      author_name: rawOrNull(row[2]),
      asin: rawOrNull(row[3]),
      marketplace: convertMarketplace(row[4]),
      royalty_type: strOrNull(row[5]),
      transaction_type: strOrNull(row[6]),
      units_sold: parseInt_(row[7]),
      units_refunded: parseInt_(row[8]),
      net_units_sold: parseInt_(row[9]),
      avg_list_price: parseNumeric(row[10]),
      avg_offer_price: parseNumeric(row[11]),
      avg_file_size_mb: parseNumeric(row[12]),
      avg_delivery_cost: parseNumeric(row[13]),
      royalty: parseNumeric(row[14]),
      currency: strOrNull(row[15]),
      target_month: targetMonthStr,
      book_id: books.resolve(row[1]),
    });
  }
  return out;
}

function parsePrintSheet(
  ws: XLSX.WorkSheet,
  year: number,
  month: number,
  books: BookIdAssigner,
): { sales: PrintRoyaltyRecord[]; royalties: PrintRoyaltyRecord[] } {
  const sales: PrintRoyaltyRecord[] = [];
  const royalties: PrintRoyaltyRecord[] = [];
  const targetMonthStr = getTargetMonthDate(year, month);
  for (const row of sheetRows(ws)) {
    if (!row[0]) continue;
    const royaltyDate = parseDate(row[0]);
    const orderDate = parseDate(row[1]);
    const record: PrintRoyaltyRecord = {
      royalty_date: royaltyDate,
      order_date: orderDate,
      title: rawOrNull(row[2]),
      author_name: rawOrNull(row[3]),
      isbn: strOrNull(row[4]),
      asin: rawOrNull(row[16]),
      marketplace: convertMarketplace(row[5]),
      royalty_type: strOrNull(row[6]),
      transaction_type: strOrNull(row[7]),
      units_sold: parseInt_(row[8]),
      units_refunded: parseInt_(row[9]),
      net_units_sold: parseInt_(row[10]),
      avg_list_price: parseNumeric(row[11]),
      avg_offer_price: parseNumeric(row[12]),
      avg_manufacturing_cost: parseNumeric(row[13]),
      royalty: parseNumeric(row[14]),
      currency: strOrNull(row[15]),
      target_month: targetMonthStr,
      book_id: books.resolve(row[2]),
    };
    if (isDateInMonth(orderDate, year, month)) sales.push({ ...record });
    if (isDateInMonth(royaltyDate, year, month)) royalties.push({ ...record });
  }
  return { sales, royalties };
}

function parseKenpSheet(
  ws: XLSX.WorkSheet,
  year: number,
  month: number,
  books: BookIdAssigner,
): KenpReadRecord[] {
  const out: KenpReadRecord[] = [];
  const targetMonthStr = getTargetMonthDate(year, month);
  for (const row of sheetRows(ws)) {
    if (!row[0]) continue;
    const readDate = parseDate(row[0]);
    if (!isDateInMonth(readDate, year, month)) continue;
    out.push({
      date: readDate,
      title: rawOrNull(row[1]),
      author_name: rawOrNull(row[2]),
      asin: rawOrNull(row[3]),
      marketplace: convertMarketplace(row[4]),
      kenp_read: parseInt_(row[5]),
      target_month: targetMonthStr,
      book_id: books.resolve(row[1]),
    });
  }
  return out;
}

/**
 * Parse a full KDP Royalties workbook (all four named sheets) into the
 * canonical record shape, filtered to `targetYear`/`targetMonth`. 1:1 port of
 * the backend RoyaltyImportService parse_* methods.
 *
 * `account` is used only for the deterministic book-id key; pass the KDP
 * account name when available (defaults to null, matching backend when no
 * account is supplied).
 *
 * Sheets are processed in eBook -> Paperback -> Hardcover -> KENP order so the
 * first-seen book-id assignment is deterministic.
 *
 * Throws `RoyaltyParseError(CORRUPT_BUFFER)` if the workbook can't be opened.
 */
export function parseCanonical(
  data: Buffer | Uint8Array,
  targetYear: number,
  targetMonth: number,
  account: string | null = null,
): CanonicalParseResult {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(data, { type: 'buffer', cellDates: true });
  } catch (err) {
    throw new RoyaltyParseError(
      'Failed to parse workbook (corrupt or unsupported format)',
      'CORRUPT_BUFFER',
      err,
    );
  }

  const books = new BookIdAssigner(account);
  const result: CanonicalParseResult = {
    ebook_royalties: [],
    paperback_sales: [],
    paperback_royalties: [],
    hardcover_sales: [],
    hardcover_royalties: [],
    kenp_reads: [],
  };

  const names = new Set(wb.SheetNames);

  if (names.has('eBook Royalty')) {
    result.ebook_royalties = parseEbookSheet(
      wb.Sheets['eBook Royalty'],
      targetYear,
      targetMonth,
      books,
    );
  }
  if (names.has('Paperback Royalty')) {
    const { sales, royalties } = parsePrintSheet(
      wb.Sheets['Paperback Royalty'],
      targetYear,
      targetMonth,
      books,
    );
    result.paperback_sales = sales;
    result.paperback_royalties = royalties;
  }
  if (names.has('Hardcover Royalty')) {
    const { sales, royalties } = parsePrintSheet(
      wb.Sheets['Hardcover Royalty'],
      targetYear,
      targetMonth,
      books,
    );
    result.hardcover_sales = sales;
    result.hardcover_royalties = royalties;
  }
  if (names.has('KENP Read')) {
    result.kenp_reads = parseKenpSheet(
      wb.Sheets['KENP Read'],
      targetYear,
      targetMonth,
      books,
    );
  }

  return result;
}

// ---- small date helpers -----------------------------------------------------

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
function pad4(n: number): string {
  return String(n).padStart(4, '0');
}
function toIsoDate(d: Date): string {
  // Use UTC components — the workbook reader returns UTC-based dates and tests
  // pin TZ=UTC, so this stays stable across machines.
  return `${pad4(d.getUTCFullYear())}-${pad2(d.getUTCMonth() + 1)}-${pad2(
    d.getUTCDate(),
  )}`;
}
function validIso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  // Reject impossible day-of-month (e.g. 30/02) the way strptime would.
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    return null;
  }
  return `${pad4(y)}-${pad2(m)}-${pad2(d)}`;
}

// ============================================================================
// Legacy flat single-sheet parser (Monthly Royalty Report / Sales Dashboard)
// ============================================================================

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
 * Parse a flat KDP royalty workbook (xlsx or csv) from a Buffer/Uint8Array.
 * Throws `RoyaltyParseError` when the buffer is corrupt, has no sheets,
 * or has no recognisable header columns.
 */
export function parseRoyaltyFile(data: Buffer | Uint8Array): ParseResult {
  let workbook: XLSX.WorkBook;
  try {
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
