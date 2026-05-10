import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseRoyaltyXlsx } from '../xlsxParser';

/**
 * Build a minimal xlsx workbook in memory and return it as a Buffer,
 * ready to feed into parseRoyaltyXlsx.
 */
function buildXlsxBuffer(rows: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return buf;
}

describe('parseRoyaltyXlsx', () => {
  it('parses a happy-path workbook with standard headers', () => {
    const data = buildXlsxBuffer([
      ['Marketplace', 'ASIN', 'Title', 'Units Sold', 'Royalty', 'Currency'],
      ['USA', 'B000001', 'My Book', 10, 42.5, 'USD'],
      ['UK', 'B000002', 'Another Book', 5, 18.0, 'GBP'],
    ]);

    const rows = parseRoyaltyXlsx(data);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      marketplace: 'USA',
      asin: 'B000001',
      title: 'My Book',
      units_sold: 10,
      royalty: 42.5,
      currency: 'USD',
    });
    expect(rows[1]).toEqual({
      marketplace: 'UK',
      asin: 'B000002',
      title: 'Another Book',
      units_sold: 5,
      royalty: 18,
      currency: 'GBP',
    });
  });

  it('tolerates case-insensitive and whitespace-padded headers', () => {
    const data = buildXlsxBuffer([
      ['  MARKETPLACE  ', ' asin ', 'TITLE', 'UNITS_SOLD', '  Royalty  ', 'currency'],
      ['CA', 'B000003', 'Third Book', 3, 9.0, 'CAD'],
    ]);

    const rows = parseRoyaltyXlsx(data);

    expect(rows).toHaveLength(1);
    expect(rows[0].marketplace).toBe('CA');
    expect(rows[0].royalty).toBe(9);
  });

  it('returns [] for empty workbook (only header row)', () => {
    const data = buildXlsxBuffer([
      ['Marketplace', 'ASIN', 'Title', 'Units Sold', 'Royalty', 'Currency'],
    ]);
    const rows = parseRoyaltyXlsx(data);
    expect(rows).toEqual([]);
  });

  it('returns [] and warns when no recognisable headers', () => {
    const data = buildXlsxBuffer([
      ['foo', 'bar', 'baz'],
      ['1', '2', '3'],
    ]);
    const rows = parseRoyaltyXlsx(data);
    expect(rows).toEqual([]);
  });

  it('skips entirely empty data rows', () => {
    const data = buildXlsxBuffer([
      ['Marketplace', 'ASIN', 'Title', 'Units Sold', 'Royalty', 'Currency'],
      ['USA', 'B000001', 'Book One', 7, 21.0, 'USD'],
      ['', '', '', '', '', ''],
      ['UK', 'B000002', 'Book Two', 2, 6.0, 'GBP'],
    ]);
    const rows = parseRoyaltyXlsx(data);
    expect(rows).toHaveLength(2);
  });

  it('returns [] for corrupt input', () => {
    const corrupt = Buffer.from('not an xlsx file at all');
    const rows = parseRoyaltyXlsx(corrupt);
    expect(rows).toEqual([]);
  });
});
