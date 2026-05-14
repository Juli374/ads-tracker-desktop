// Phase M.1 — Niche Explorer: CSV parsing + BSR→revenue estimate utilities.
//
// Why CSV-only for now (vs. live Publisher Rocket integration):
//   1. Publisher Rocket's keyword-search / competition export currently has no
//      public REST API. PR MCP is callable from Claude Code itself but NOT from
//      the Electron main process. We therefore mirror the L.4 Reverse-ASIN
//      pattern: user exports CSV from PR → loads it here → we parse + analyse.
//   2. When PR ships a REST API (or its MCP becomes callable from main), a
//      `nicheApi.fetchKeyword(keyword)` / `fetchAsin(asin)` method can drop in
//      behind the same `NicheKeyword[]` shape with zero UI churn.
//
// PR's keyword-search export gives us roughly this schema (column casing
// varies, our parser is tolerant of both Title Case and snake_case headers):
//
//   ASIN | Title | BSR | Estimated Revenue | Page Count | Reviews | Release Date
//
// `keyword` is set by the parser from the search query the user typed in,
// because PR's keyword-search export does NOT echo the keyword per-row — it's
// implicit in the file name / heading. The caller passes the query as the
// `keyword` argument to `parseNicheKeywordCsv`.
//
// For "by ASIN" mode (reverse-search a single competitor's keywords) we
// currently reuse the L.4 ReverseAsinKeyword shape — see reverseAsin.ts.
//
// BSR→revenue formula:
//   K-lytics-style rough buckets for USA (and similar order-of-magnitude
//   adjustments for other marketplaces — UK ~0.5x, DE ~0.4x, JP ~0.3x). This
//   is a SHIPPING-GRADE-ROUGH estimate intended to be presented with strong
//   disclaimer text — actual monthly revenue depends on price point, royalty
//   share, KU borrows, returns, and ad spend. Real data from KDP backend
//   trumps any BSR-derived guess.
//
// The buckets (USA, monthly USD):
//   BSR ≤ 1,000      → ~$25,000
//   BSR ≤ 5,000      → ~$10,000
//   BSR ≤ 10,000     → ~$5,000
//   BSR ≤ 50,000     → ~$2,000
//   BSR ≤ 100,000    → ~$1,000
//   BSR ≤ 250,000    → ~$500
//   BSR ≤ 500,000    → ~$200
//   BSR ≤ 1,000,000  → ~$50
//   else             → ~$10
//
// Source: rough average of K-lytics 2022 study + author-earnings reports +
// internal calibration. Marketplace multipliers from CPC index ratios.

export type Marketplace =
  | 'USA'
  | 'UK'
  | 'CA'
  | 'AU'
  | 'DE'
  | 'FR'
  | 'ES'
  | 'IT'
  | 'JP'
  | 'IN'
  | 'MX'
  | 'BR'
  | 'NL';

/** Default marketplace used when caller doesn't pass one. */
export const DEFAULT_MARKETPLACE: Marketplace = 'USA';

/**
 * A single competing book row imported from PR's keyword-search CSV.
 *
 * `keyword` is the niche query (set externally — PR's keyword-search export
 * doesn't include it per-row). All other fields come from the row itself.
 *
 * Numeric fields default to 0 when missing / non-numeric (PR sometimes exports
 * "-" or empty for low-volume cells). `releaseDate` is kept as raw string —
 * we do not normalise the format because PR uses MM/DD/YYYY in USA exports
 * and DD.MM.YYYY in DE exports.
 */
export interface NicheKeyword {
  /** The niche / category / search query — set by caller, not from CSV. */
  keyword: string;
  asin: string;
  title: string;
  /** Amazon's Best Seller Rank in its primary category. 0 = unknown. */
  bsr: number;
  /**
   * PR's "Estimated Revenue" column (their proprietary number, monthly USD).
   * When missing, callers should fall back to `bsrToRevenue(bsr, marketplace)`.
   */
  estimatedRevenue: number;
  pageCount: number;
  reviewCount: number;
  /** Raw release date string from CSV — caller formats for display. */
  releaseDate: string;
}

export class ParseError extends Error {
  constructor(message: string, public readonly hint?: string) {
    super(message);
    this.name = 'ParseError';
  }
}

/**
 * Marketplace multipliers applied to USA-baseline `bsrToRevenue`. These are
 * order-of-magnitude — UK is ~half the depth of USA, JP ~a third, etc. Sources:
 *   - Amazon CPC indices (KDPRocket, PublishDrive bench),
 *   - Author Earnings public reports,
 *   - calibration against a handful of our own books.
 */
const MARKETPLACE_MULTIPLIER: Record<Marketplace, number> = {
  USA: 1,
  UK: 0.5,
  CA: 0.25,
  AU: 0.2,
  DE: 0.4,
  FR: 0.2,
  ES: 0.15,
  IT: 0.15,
  JP: 0.3,
  IN: 0.05,
  MX: 0.05,
  BR: 0.05,
  NL: 0.1,
};

/**
 * Convert an Amazon BSR into a rough monthly revenue estimate.
 *
 * **This is a rough, BSR-derived guess** intended for at-a-glance niche
 * comparison only. It is calibrated to USA Kindle Store and scaled by a
 * marketplace multiplier. Real revenue requires KDP backend access.
 *
 * @param bsr     Best Seller Rank (positive integer). 0 / negative → 0.
 * @param mp      Marketplace; defaults to USA.
 * @returns       Estimated monthly revenue in USD (rounded to nearest $10).
 */
export function bsrToRevenue(bsr: number, mp: Marketplace = DEFAULT_MARKETPLACE): number {
  if (!Number.isFinite(bsr) || bsr <= 0) return 0;
  const base = bsrToUsaRevenue(bsr);
  const mult = MARKETPLACE_MULTIPLIER[mp] ?? 1;
  // Round to nearest $10 so the output reads cleanly in the UI.
  return Math.round((base * mult) / 10) * 10;
}

function bsrToUsaRevenue(bsr: number): number {
  if (bsr <= 1_000) return 25_000;
  if (bsr <= 5_000) return 10_000;
  if (bsr <= 10_000) return 5_000;
  if (bsr <= 50_000) return 2_000;
  if (bsr <= 100_000) return 1_000;
  if (bsr <= 250_000) return 500;
  if (bsr <= 500_000) return 200;
  if (bsr <= 1_000_000) return 50;
  return 10;
}

/**
 * Parse a Publisher Rocket keyword-search CSV export.
 *
 * Required columns (case-insensitive, order-agnostic):
 *   - ASIN (also accepts "asin", "Product ASIN")
 *   - Title (also "Book Title", "Name")
 *
 * Optional columns (default to 0 / empty string):
 *   - BSR (also "Best Seller Rank", "rank")
 *   - Estimated Revenue (also "Monthly Revenue", "revenue")
 *   - Page Count (also "Pages", "pages")
 *   - Reviews (also "Review Count", "review_count")
 *   - Release Date (also "Publication Date", "date")
 *
 * @param csvText raw CSV file contents
 * @param keyword the niche/category query the user typed — stamped on every row
 * @returns parsed rows (may be empty if every row was dropped)
 * @throws ParseError if the file is empty or the ASIN/Title columns are missing
 */
export function parseNicheKeywordCsv(csvText: string, keyword: string): NicheKeyword[] {
  if (!csvText || !csvText.trim()) {
    throw new ParseError(
      'CSV is empty',
      'Export keyword search results from Publisher Rocket and try again.',
    );
  }

  const lines = csvText
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    throw new ParseError(
      'CSV must have a header row and at least one book row',
      'Make sure the file isn’t just the header.',
    );
  }

  const header = parseCsvLine(lines[0]).map((c) => c.toLowerCase().trim());
  const asinIdx = findColumnIndex(header, [
    'asin',
    'product asin',
    'product_asin',
  ]);
  if (asinIdx < 0) {
    throw new ParseError(
      'No "ASIN" column found in CSV header',
      `Header was: ${header.join(', ') || '(empty)'}. Expected a column called "ASIN".`,
    );
  }
  const titleIdx = findColumnIndex(header, ['title', 'book title', 'name', 'product name']);
  if (titleIdx < 0) {
    throw new ParseError(
      'No "Title" column found in CSV header',
      `Header was: ${header.join(', ') || '(empty)'}. Expected a column called "Title".`,
    );
  }
  const bsrIdx = findColumnIndex(header, ['bsr', 'best seller rank', 'rank', 'sales rank']);
  const revenueIdx = findColumnIndex(header, [
    'estimated revenue',
    'monthly revenue',
    'revenue',
    'est. revenue',
  ]);
  const pageIdx = findColumnIndex(header, [
    'page count',
    'pages',
    'page_count',
    'pages count',
  ]);
  const reviewIdx = findColumnIndex(header, [
    'reviews',
    'review count',
    'review_count',
    'reviews count',
  ]);
  const dateIdx = findColumnIndex(header, [
    'release date',
    'publication date',
    'date',
    'pub_date',
    'pub date',
  ]);

  const trimmedKeyword = keyword.trim();
  const rows: NicheKeyword[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const asin = (cells[asinIdx] ?? '').trim();
    const title = (cells[titleIdx] ?? '').trim();
    // Skip rows where both ASIN and title are blank — most likely a trailing
    // blank line PR sometimes emits.
    if (!asin && !title) continue;

    rows.push({
      keyword: trimmedKeyword,
      asin,
      title,
      bsr: bsrIdx >= 0 ? parseNumberCell(cells[bsrIdx]) : 0,
      estimatedRevenue: revenueIdx >= 0 ? parseNumberCell(cells[revenueIdx]) : 0,
      pageCount: pageIdx >= 0 ? parseNumberCell(cells[pageIdx]) : 0,
      reviewCount: reviewIdx >= 0 ? parseNumberCell(cells[reviewIdx]) : 0,
      releaseDate: dateIdx >= 0 ? (cells[dateIdx] ?? '').trim() : '',
    });
  }

  return rows;
}

/**
 * Minimal RFC-4180-ish CSV line parser. Handles double-quoted fields with
 * embedded commas and doubled-quote escapes (`""` → `"`). Doesn't support
 * embedded newlines in quoted fields — PR's exports don't produce those.
 */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++; // skip the escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function findColumnIndex(header: string[], candidates: string[]): number {
  for (const c of candidates) {
    const idx = header.indexOf(c.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

/** PR exports sometimes use "1,200" thousands separators or "-" / "N/A" / "$" prefixes. */
function parseNumberCell(raw: string | undefined): number {
  if (raw == null) return 0;
  const cleaned = raw.replace(/[,\s$£€¥]/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === 'N/A' || cleaned === 'n/a') return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** AI-synthesis result returned from Anthropic — see ResearchPage prompt. */
export interface NicheSynthesis {
  /** 1-10 saturation score (1 = wide open, 10 = saturated). */
  saturation: number;
  /**
   * ASINs in the niche that look like weak covers — we surface them as
   * "easy targets" the author could outperform with a stronger cover.
   */
  weakCovers: string[];
  /** Short prose suggestion for the author's angle in this niche. */
  angle: string;
  /** Free-form rationale / caveats from the model. */
  notes?: string;
}

/**
 * Try to parse a model-returned JSON synthesis blob. Anthropic models often
 * wrap JSON in markdown fences or prose — this is tolerant of both.
 *
 * @throws Error if no JSON object can be located in the text.
 */
export function parseSynthesisJson(rawText: string): NicheSynthesis {
  // First try: the text IS valid JSON.
  const trimmed = rawText.trim();
  const direct = tryParseJsonObject(trimmed);
  if (direct) return coerceSynthesis(direct);

  // Second try: model wrapped JSON in ```json fences.
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced && fenced[1]) {
    const inside = tryParseJsonObject(fenced[1].trim());
    if (inside) return coerceSynthesis(inside);
  }

  // Third try: locate the first balanced `{...}` substring.
  const braceStart = trimmed.indexOf('{');
  const braceEnd = trimmed.lastIndexOf('}');
  if (braceStart >= 0 && braceEnd > braceStart) {
    const slice = trimmed.slice(braceStart, braceEnd + 1);
    const found = tryParseJsonObject(slice);
    if (found) return coerceSynthesis(found);
  }

  throw new Error('Could not parse JSON synthesis from AI response');
}

function tryParseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function coerceSynthesis(raw: unknown): NicheSynthesis {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  let saturation = Number(obj.saturation);
  if (!Number.isFinite(saturation)) saturation = 5;
  saturation = Math.max(1, Math.min(10, Math.round(saturation)));

  const weakCovers: string[] = Array.isArray(obj.weakCovers)
    ? obj.weakCovers.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];

  const angle =
    typeof obj.angle === 'string' && obj.angle.trim().length > 0
      ? obj.angle.trim()
      : 'No angle suggested.';
  const notes =
    typeof obj.notes === 'string' && obj.notes.trim().length > 0 ? obj.notes.trim() : undefined;

  return { saturation, weakCovers, angle, notes };
}

/**
 * Persisted research project. Kept in localStorage so the user can pop back
 * to a niche they explored last week.
 */
export interface ResearchProject {
  id: string;
  /** Human-friendly label — keyword or ASIN. */
  label: string;
  /** 'keyword' = top-20 books for query; 'asin' = reverse-search a single book. */
  mode: 'keyword' | 'asin';
  marketplace: Marketplace;
  createdAt: string;
  rowCount: number;
}

/** Key under which we persist research projects per-user. */
export function researchProjectsKey(userId: number | null | undefined): string {
  return `research:projects:${userId ?? 0}`;
}
