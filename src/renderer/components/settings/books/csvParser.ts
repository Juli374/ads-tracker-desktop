import type { BookCreate } from '../../../api/books';

/**
 * Phase J.3 Lane C — minimal RFC 4180-ish CSV parser for the Books bulk
 * import. Handles:
 *   • Quoted fields with embedded commas / newlines (e.g. `"Smith, John"`)
 *   • Doubled quotes inside quoted fields (`""` → `"`)
 *   • CRLF / LF / CR line endings
 *   • Header row (case-insensitive matching)
 *
 * Required header column: `title`. Optional columns: `author`, `language` (or
 * `book_language`), `series_name` (or `series`). Unknown columns are ignored.
 *
 * Why hand-roll instead of importing papaparse: the project already vendors
 * `xlsx` for royalty parsing; pulling another 50KB just for this small import
 * is overkill, and the format we accept is narrow.
 */

interface ColumnMap {
  title: number;
  author: number;
  language: number;
  series: number;
}

const TITLE_HEADERS = ['title'];
const AUTHOR_HEADERS = ['author'];
const LANGUAGE_HEADERS = ['language', 'book_language', 'lang'];
const SERIES_HEADERS = ['series_name', 'series'];

export function parseCsv(text: string): BookCreate[] {
  const rows = tokenize(text);
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const map = matchHeaders(header);
  if (map.title < 0) {
    throw new Error('CSV header is missing required column "title"');
  }

  const out: BookCreate[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    // Skip empty lines (a fully-empty row tokenizes as [""]).
    if (row.every((cell) => cell.trim() === '')) continue;

    const titleRaw = (row[map.title] ?? '').trim();
    if (!titleRaw) continue; // title is required per row

    const create: BookCreate = { title: titleRaw };
    if (map.author >= 0) {
      const v = (row[map.author] ?? '').trim();
      if (v) create.author = v;
    }
    if (map.language >= 0) {
      const v = (row[map.language] ?? '').trim();
      if (v) create.book_language = v;
    }
    if (map.series >= 0) {
      const v = (row[map.series] ?? '').trim();
      if (v) create.series_name = v;
    }
    out.push(create);
  }
  return out;
}

function matchHeaders(header: string[]): ColumnMap {
  const findIdx = (candidates: string[]): number => {
    for (let i = 0; i < header.length; i += 1) {
      if (candidates.includes(header[i])) return i;
    }
    return -1;
  };
  return {
    title: findIdx(TITLE_HEADERS),
    author: findIdx(AUTHOR_HEADERS),
    language: findIdx(LANGUAGE_HEADERS),
    series: findIdx(SERIES_HEADERS),
  };
}

/**
 * Parse a CSV blob into a 2D array of strings. Rows are separated by line
 * breaks (LF / CRLF / CR). Fields may be unquoted or wrapped in double quotes;
 * inside a quoted field, `""` is a literal quote.
 */
function tokenize(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1; // consume the second quote
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      cur.push(field);
      field = '';
      continue;
    }
    if (ch === '\r') {
      if (text[i + 1] === '\n') i += 1;
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = '';
      continue;
    }
    if (ch === '\n') {
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = '';
      continue;
    }
    field += ch;
  }
  // Flush trailing line (file without final newline).
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows;
}
