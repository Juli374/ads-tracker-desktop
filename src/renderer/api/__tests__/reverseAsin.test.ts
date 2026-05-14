import { describe, it, expect } from 'vitest';
import { parseReverseAsinCsv, ParseError, isAsinShape } from '../reverseAsin';

describe('parseReverseAsinCsv', () => {
  it('parses a standard Publisher Rocket export with all four columns', () => {
    const csv = [
      'Keyword,Search Volume,Competing Products,Estimated Clicks',
      'crockpot recipes,12500,3200,890',
      'slow cooker dinner ideas,8400,1900,540',
      'pressure cooker cookbook,5200,2100,310',
    ].join('\n');

    const rows = parseReverseAsinCsv(csv);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      keyword: 'crockpot recipes',
      searchVolume: 12500,
      competingProducts: 3200,
      estimatedClicks: 890,
    });
    expect(rows[2].keyword).toBe('pressure cooker cookbook');
    expect(rows[2].searchVolume).toBe(5200);
  });

  it('tolerates thousands separators, quoted fields, and odd column order', () => {
    // PR sometimes wraps numbers in quotes with commas: "1,200"
    // and we want to accept the columns in any order.
    const csv = [
      'Competing Products,Keyword,Estimated Clicks,Search Volume',
      '"1,200",keto desserts,"450","8,900"',
      '900,low carb baking,310,5400',
    ].join('\n');

    const rows = parseReverseAsinCsv(csv);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      keyword: 'keto desserts',
      searchVolume: 8900,
      competingProducts: 1200,
      estimatedClicks: 450,
    });
  });

  it('rejects an empty CSV with ParseError', () => {
    expect(() => parseReverseAsinCsv('')).toThrow(ParseError);
    expect(() => parseReverseAsinCsv('   \n\n')).toThrow(ParseError);
  });

  it('rejects a CSV missing the Keyword column header', () => {
    const csv = 'Volume,Clicks\n1000,50';
    expect(() => parseReverseAsinCsv(csv)).toThrow(/Keyword/i);
  });

  it('drops rows with empty keyword text but keeps the rest', () => {
    const csv = [
      'Keyword,Search Volume',
      'good keyword,500',
      ',1000', // empty keyword — should be dropped, not throw
      'another keyword,300',
    ].join('\n');

    const rows = parseReverseAsinCsv(csv);

    expect(rows.map((r) => r.keyword)).toEqual(['good keyword', 'another keyword']);
  });

  it('falls back to 0 for non-numeric / dash / N/A numeric cells', () => {
    const csv = [
      'Keyword,Search Volume,Competing Products,Estimated Clicks',
      'mystery thriller,-,N/A,not-a-number',
    ].join('\n');

    const rows = parseReverseAsinCsv(csv);

    expect(rows[0]).toEqual({
      keyword: 'mystery thriller',
      searchVolume: 0,
      competingProducts: 0,
      estimatedClicks: 0,
    });
  });
});

describe('isAsinShape', () => {
  it('accepts well-formed ASINs', () => {
    expect(isAsinShape('B07KQRMS9F')).toBe(true);
    expect(isAsinShape('b07kqrms9f')).toBe(true); // case-insensitive
    expect(isAsinShape('1234567890')).toBe(true); // legacy ISBN-10
  });

  it('rejects malformed input', () => {
    expect(isAsinShape('')).toBe(false);
    expect(isAsinShape('B0')).toBe(false);
    expect(isAsinShape('B07KQRMS9F123')).toBe(false); // too long
    expect(isAsinShape('B07-KQR-9F')).toBe(false); // dashes
  });
});
