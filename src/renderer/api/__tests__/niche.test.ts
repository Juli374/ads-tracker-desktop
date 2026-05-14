// Phase M.1 — Niche Explorer: parser + revenue-formula unit tests.
//
// We assert four behaviours:
//   1. CSV parse — column-order-agnostic, lowercase header tolerance, all
//      seven fields land in the output rows; keyword is stamped from arg.
//   2. bsrToRevenue — bucket boundaries are correct AND marketplace multipliers
//      scale USA-baseline correctly (UK ~0.5x, DE ~0.4x, JP ~0.3x).
//   3. Malformed CSV (empty / no ASIN column / no Title column) → throws.
//   4. Marketplace defaults to USA when caller omits the arg.

import { describe, it, expect } from 'vitest';
import {
  bsrToRevenue,
  DEFAULT_MARKETPLACE,
  parseNicheKeywordCsv,
  parseSynthesisJson,
  ParseError,
} from '../niche';

describe('parseNicheKeywordCsv', () => {
  it('parses a standard PR keyword-search export with all seven columns', () => {
    const csv = [
      'ASIN,Title,BSR,Estimated Revenue,Page Count,Reviews,Release Date',
      'B07KQRMS9F,The Sample Cookbook,12500,8400,250,1200,03/15/2024',
      'B08ABC1234,Another Cookbook,42000,2500,180,420,07/01/2023',
      'B09XYZ9999,Third Cookbook,250000,500,120,80,01/10/2023',
    ].join('\n');

    const rows = parseNicheKeywordCsv(csv, 'crockpot recipes');

    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      keyword: 'crockpot recipes',
      asin: 'B07KQRMS9F',
      title: 'The Sample Cookbook',
      bsr: 12500,
      estimatedRevenue: 8400,
      pageCount: 250,
      reviewCount: 1200,
      releaseDate: '03/15/2024',
    });
    // Order-agnostic column matching: lowercase / aliased headers should also work.
    const csv2 = [
      'product asin,book title,Best Seller Rank,Monthly Revenue,Pages,Review Count,Publication Date',
      'B0AAAA0001,"Title, with comma","1,200","9,000",300,5500,DD.MM.YYYY',
    ].join('\n');
    const rows2 = parseNicheKeywordCsv(csv2, 'tarot');
    expect(rows2).toHaveLength(1);
    expect(rows2[0].asin).toBe('B0AAAA0001');
    expect(rows2[0].title).toBe('Title, with comma');
    expect(rows2[0].bsr).toBe(1200);
    expect(rows2[0].estimatedRevenue).toBe(9000);
    expect(rows2[0].pageCount).toBe(300);
    expect(rows2[0].reviewCount).toBe(5500);
    expect(rows2[0].keyword).toBe('tarot');
  });

  it('treats missing optional columns as zero and skips empty rows', () => {
    const csv = [
      'ASIN,Title',
      'B0NORARE,Skinny Edition',
      ',',
      'B0SECOND,Second',
    ].join('\n');

    const rows = parseNicheKeywordCsv(csv, 'mystery');

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      keyword: 'mystery',
      asin: 'B0NORARE',
      title: 'Skinny Edition',
      bsr: 0,
      estimatedRevenue: 0,
      pageCount: 0,
      reviewCount: 0,
      releaseDate: '',
    });
    // Numeric cells with `-` / `N/A` / non-numeric → 0
    const csv2 = [
      'ASIN,Title,BSR,Estimated Revenue,Page Count,Reviews',
      'B0TEST,The Edge Case,-,N/A,not-a-number,1234',
    ].join('\n');
    const rows2 = parseNicheKeywordCsv(csv2, 'thriller');
    expect(rows2[0].bsr).toBe(0);
    expect(rows2[0].estimatedRevenue).toBe(0);
    expect(rows2[0].pageCount).toBe(0);
    expect(rows2[0].reviewCount).toBe(1234);
  });

  it('rejects empty CSV / missing ASIN column / missing Title column', () => {
    expect(() => parseNicheKeywordCsv('', 'kw')).toThrow(ParseError);
    expect(() => parseNicheKeywordCsv('   \n\n', 'kw')).toThrow(ParseError);

    // Missing ASIN column.
    expect(() => parseNicheKeywordCsv('Title,BSR\nBook,100', 'kw')).toThrow(/ASIN/);

    // Missing Title column.
    expect(() => parseNicheKeywordCsv('ASIN,BSR\nB0,100', 'kw')).toThrow(/Title/);

    // Only header.
    expect(() => parseNicheKeywordCsv('ASIN,Title\n', 'kw')).toThrow(/header/);
  });
});

describe('bsrToRevenue', () => {
  it('returns expected USA bucket values at boundary BSRs', () => {
    // The function rounds to nearest $10 — assert the rounded values.
    expect(bsrToRevenue(500, 'USA')).toBe(25000); // top bucket
    expect(bsrToRevenue(1000, 'USA')).toBe(25000); // <=1000 → top
    expect(bsrToRevenue(1001, 'USA')).toBe(10000); // next bucket
    expect(bsrToRevenue(5000, 'USA')).toBe(10000);
    expect(bsrToRevenue(50000, 'USA')).toBe(2000);
    expect(bsrToRevenue(100000, 'USA')).toBe(1000);
    expect(bsrToRevenue(500000, 'USA')).toBe(200);
    expect(bsrToRevenue(750000, 'USA')).toBe(50);
    expect(bsrToRevenue(2_000_000, 'USA')).toBe(10);
    // Invalid BSRs → 0
    expect(bsrToRevenue(0, 'USA')).toBe(0);
    expect(bsrToRevenue(-100, 'USA')).toBe(0);
    expect(bsrToRevenue(NaN, 'USA')).toBe(0);
  });

  it('scales the USA-baseline by the marketplace multiplier', () => {
    // UK ~0.5x → bsr 5000 → 10000 * 0.5 = 5000
    expect(bsrToRevenue(5000, 'UK')).toBe(5000);
    // DE ~0.4x → 10000 * 0.4 = 4000
    expect(bsrToRevenue(5000, 'DE')).toBe(4000);
    // JP ~0.3x → 10000 * 0.3 = 3000
    expect(bsrToRevenue(5000, 'JP')).toBe(3000);
    // IN ~0.05x → 10000 * 0.05 = 500
    expect(bsrToRevenue(5000, 'IN')).toBe(500);
  });

  it('defaults to USA when marketplace is omitted', () => {
    expect(DEFAULT_MARKETPLACE).toBe('USA');
    expect(bsrToRevenue(5000)).toBe(bsrToRevenue(5000, 'USA'));
  });
});

describe('parseSynthesisJson', () => {
  it('parses a clean JSON response', () => {
    const raw = JSON.stringify({
      saturation: 7,
      weakCovers: ['B0WEAK1', 'B0WEAK2'],
      angle: 'Lean into a steamy slow-burn romance angle.',
      notes: 'Steady demand year-round.',
    });
    const s = parseSynthesisJson(raw);
    expect(s.saturation).toBe(7);
    expect(s.weakCovers).toEqual(['B0WEAK1', 'B0WEAK2']);
    expect(s.angle).toMatch(/steamy slow-burn/);
    expect(s.notes).toMatch(/year-round/);
  });

  it('extracts JSON from ```json``` fenced markdown', () => {
    const raw = "Here you go:\n```json\n" +
      '{"saturation": 9, "weakCovers": [], "angle": "Stay away."}' +
      '\n```';
    const s = parseSynthesisJson(raw);
    expect(s.saturation).toBe(9);
    expect(s.weakCovers).toEqual([]);
    expect(s.angle).toBe('Stay away.');
  });

  it('clamps saturation to [1, 10] and tolerates malformed weakCovers', () => {
    const raw = '{"saturation": 99, "weakCovers": [123, "B0OK", null, ""], "angle": "x"}';
    const s = parseSynthesisJson(raw);
    expect(s.saturation).toBe(10);
    // Non-string / empty entries dropped.
    expect(s.weakCovers).toEqual(['B0OK']);
  });

  it('throws when no JSON object can be located', () => {
    expect(() => parseSynthesisJson('I am sorry, I cannot answer.')).toThrow(
      /Could not parse JSON/,
    );
  });
});
