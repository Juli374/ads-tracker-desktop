// Phase L.4 — Reverse-ASIN keyword mining: CSV parser + types.
//
// Why CSV-only for now (vs. live Publisher Rocket integration):
//   1. Publisher Rocket's "Reverse ASIN" tool currently has no public REST API.
//      Pro plan users have access to the desktop/web app, but third-party
//      automation only works via screen-scraping (TOS-risky) or future MCP.
//   2. We let users export results as CSV from PR's UI and paste/load it here.
//      Schema mirrors PR's standard reverse-ASIN export:
//         Keyword | Search Volume | Competing Products | Estimated Clicks
//      Columns may appear in different casing/order — the parser tolerates
//      both Title Case and snake_case headers and is column-order-agnostic.
//   3. When PR ships a REST API (or when Publisher Rocket MCP becomes available
//      from main-process — currently it's only callable from Claude Code itself),
//      we'll add a `reverseAsinApi.fetch(asin)` method that hits IPC `pr:reverseAsin`
//      and reuses the same `ReverseAsinKeyword[]` shape.
//
// Validation rules:
//   - File must have at least one row beyond the header.
//   - Numeric columns missing / non-numeric → 0 (graceful — PR sometimes exports
//     "-" or empty for low-volume keywords).
//   - Keyword text is the only mandatory field; rows without it are dropped.
//   - Throws ParseError if the keyword column itself can't be found — that's
//     a malformed file the caller should surface to the user.

export interface ReverseAsinKeyword {
  /** The keyword phrase Amazon ranked this ASIN for. */
  keyword: string;
  /** Estimated monthly Amazon search volume (PR's proprietary metric). */
  searchVolume: number;
  /** Number of products competing for this keyword (lower = easier). */
  competingProducts: number;
  /** Estimated weekly clicks (PR's "Amazon Clicks" / "Estimated Clicks" column). */
  estimatedClicks: number;
}

export class ParseError extends Error {
  constructor(message: string, public readonly hint?: string) {
    super(message);
    this.name = 'ParseError';
  }
}

/**
 * Parse a Publisher Rocket Reverse-ASIN CSV export.
 *
 * Accepts CSV text (already read from disk or pasted). The header row must
 * contain a "keyword" column (case-insensitive, also accepts "Keyword Phrase",
 * "Search Term", "Phrase"). All other columns are optional and default to 0.
 *
 * @param csvText raw CSV file contents
 * @returns parsed keyword rows (may be empty if every row was dropped)
 * @throws ParseError if the keyword column is missing or the file is empty
 */
export function parseReverseAsinCsv(csvText: string): ReverseAsinKeyword[] {
  if (!csvText || !csvText.trim()) {
    throw new ParseError('CSV is empty', 'Export Reverse-ASIN results from Publisher Rocket and try again.');
  }

  const lines = csvText
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    throw new ParseError(
      'CSV must have a header row and at least one keyword row',
      'Make sure the file isn’t just the header.',
    );
  }

  const header = parseCsvLine(lines[0]).map((c) => c.toLowerCase().trim());
  const keywordIdx = findColumnIndex(header, [
    'keyword',
    'keyword phrase',
    'phrase',
    'search term',
    'keyword_text',
  ]);
  if (keywordIdx < 0) {
    throw new ParseError(
      'No "Keyword" column found in CSV header',
      `Header was: ${header.join(', ') || '(empty)'}. Expected a column called "Keyword".`,
    );
  }
  const volumeIdx = findColumnIndex(header, [
    'search volume',
    'estimated search volume',
    'amazon search volume',
    'search_volume',
    'volume',
  ]);
  const competingIdx = findColumnIndex(header, [
    'competing products',
    'competition',
    'competing_products',
    'competitors',
  ]);
  const clicksIdx = findColumnIndex(header, [
    'estimated clicks',
    'amazon clicks',
    'estimated_clicks',
    'weekly clicks',
    'clicks',
  ]);

  const rows: ReverseAsinKeyword[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const keyword = (cells[keywordIdx] ?? '').trim();
    if (!keyword) continue; // skip phrase-less rows (PR sometimes leaves blanks)

    rows.push({
      keyword,
      searchVolume: volumeIdx >= 0 ? parseNumberCell(cells[volumeIdx]) : 0,
      competingProducts: competingIdx >= 0 ? parseNumberCell(cells[competingIdx]) : 0,
      estimatedClicks: clicksIdx >= 0 ? parseNumberCell(cells[clicksIdx]) : 0,
    });
  }

  return rows;
}

/**
 * Minimal RFC-4180-ish CSV line parser. Handles double-quoted fields with
 * embedded commas and doubled-quote escapes (`""` → `"`). Doesn't support
 * embedded newlines in quoted fields — PR's export doesn't produce those,
 * and supporting them would require multi-line lookahead we don't need.
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

/** PR sometimes writes "1,200" with thousands separators or "-" for unknown. */
function parseNumberCell(raw: string | undefined): number {
  if (raw == null) return 0;
  const cleaned = raw.replace(/[,\s$]/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === 'N/A') return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Validate that an ASIN looks like a real Amazon ASIN. Not bulletproof —
 * Amazon uses 10-char alphanumeric IDs starting with B0 for KDP-published
 * books. We accept the broader 10-char alphanumeric pattern so vintage
 * ISBNs (digit-only 10-char) also pass for non-book products.
 */
export function isAsinShape(asin: string): boolean {
  return /^[A-Z0-9]{10}$/i.test(asin.trim());
}
