import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseRoyaltyFile, RoyaltyParseError } from '../xlsxParser';

function buildXlsxBuffer(rows: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

function buildCsvBuffer(rows: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  return Buffer.from(csv, 'utf8');
}

describe('parseRoyaltyFile — Monthly Royalty Report (.xlsx)', () => {
  it('parses a Monthly Royalty Report shape and tags the format', () => {
    const buf = buildXlsxBuffer([
      ['Royalty Type', 'Marketplace', 'Title', 'Author', 'ASIN', 'Net Units Sold', 'Royalty', 'Currency'],
      ['Standard', 'USA', 'My KDP Book', 'A. Author', 'B0MONTHLY1', 12, 84.5, 'USD'],
      ['Standard', 'UK', 'Book Two', 'A. Author', 'B0MONTHLY2', 4, 11.2, 'GBP'],
    ]);
    const result = parseRoyaltyFile(buf);
    expect(result.format).toBe('monthly-royalty');
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({
      marketplace: 'USA',
      asin: 'B0MONTHLY1',
      title: 'My KDP Book',
      units_sold: 12,
      royalty: 84.5,
      currency: 'USD',
    });
  });
});

describe('parseRoyaltyFile — Sales Dashboard CSV', () => {
  it('detects sales-dashboard format from a Date column', () => {
    const buf = buildCsvBuffer([
      ['ASIN', 'Title', 'Marketplace', 'Date', 'Units', 'Royalty'],
      ['B0CSV0001', 'Dashboard Book', 'USA', '2026-04-15', 7, 21.0],
      ['B0CSV0002', 'Other Book', 'CA', '2026-04-16', 3, 8.4],
    ]);
    const result = parseRoyaltyFile(buf);
    expect(result.format).toBe('sales-dashboard');
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({
      asin: 'B0CSV0001',
      title: 'Dashboard Book',
      marketplace: 'USA',
      units_sold: 7,
      royalty: 21,
    });
    // Currency is optional in this format and should be absent.
    expect(result.records[0].currency).toBeUndefined();
  });
});

describe('parseRoyaltyFile — error cases', () => {
  it('throws RoyaltyParseError for a corrupt buffer', () => {
    const corrupt = Buffer.from('definitely not a workbook');
    expect(() => parseRoyaltyFile(corrupt)).toThrow(RoyaltyParseError);
    try {
      parseRoyaltyFile(corrupt);
    } catch (err) {
      expect(err).toBeInstanceOf(RoyaltyParseError);
      // CORRUPT_BUFFER (xlsx threw) OR EMPTY_SHEET / NO_HEADERS (xlsx absorbed it).
      expect(['CORRUPT_BUFFER', 'EMPTY_SHEET', 'NO_HEADERS']).toContain(
        (err as RoyaltyParseError).code,
      );
    }
  });

  it('throws RoyaltyParseError when no recognisable headers', () => {
    const buf = buildXlsxBuffer([
      ['foo', 'bar', 'baz'],
      ['1', '2', '3'],
    ]);
    expect(() => parseRoyaltyFile(buf)).toThrow(RoyaltyParseError);
    try {
      parseRoyaltyFile(buf);
    } catch (err) {
      expect((err as RoyaltyParseError).code).toBe('NO_HEADERS');
    }
  });

  it('throws RoyaltyParseError for empty workbook (header-only)', () => {
    const buf = buildXlsxBuffer([['Marketplace', 'ASIN', 'Title', 'Units Sold', 'Royalty']]);
    expect(() => parseRoyaltyFile(buf)).toThrow(RoyaltyParseError);
    try {
      parseRoyaltyFile(buf);
    } catch (err) {
      expect((err as RoyaltyParseError).code).toBe('EMPTY_SHEET');
    }
  });

  it('reports skipped empty rows as warnings', () => {
    const buf = buildXlsxBuffer([
      ['Marketplace', 'ASIN', 'Title', 'Units Sold', 'Royalty', 'Currency'],
      ['USA', 'B01', 'Book', 1, 3.5, 'USD'],
      ['', '', '', '', '', ''],
      ['', '', '', '', '', ''],
    ]);
    const result = parseRoyaltyFile(buf);
    expect(result.records).toHaveLength(1);
    expect(result.warnings.some((w) => w.includes('Skipped 2'))).toBe(true);
  });
});
