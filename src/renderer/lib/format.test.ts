import { describe, expect, it } from 'vitest';
import { fmtMoney, fmtNumber, fmtPct, symbolFor, fmtMoneyPrecise } from './format';

describe('symbolFor', () => {
  it('returns symbol for known ISO code', () => {
    expect(symbolFor('USD')).toBe('$');
    expect(symbolFor('EUR')).toBe('€');
    expect(symbolFor('GBP')).toBe('£');
    expect(symbolFor('JPY')).toBe('¥');
  });

  it('returns the input for unknown symbol unchanged', () => {
    expect(symbolFor('$')).toBe('$');
    expect(symbolFor('€')).toBe('€');
  });

  it('returns $ as fallback for undefined or null', () => {
    expect(symbolFor()).toBe('$');
    expect(symbolFor(null)).toBe('$');
    expect(symbolFor(undefined)).toBe('$');
  });
});

describe('fmtNumber', () => {
  it('formats integers without decimals by default', () => {
    expect(fmtNumber(1234)).toBe('1,234');
    expect(fmtNumber(1000000)).toBe('1,000,000');
  });

  it('respects max digits param', () => {
    expect(fmtNumber(1234.567, 2)).toBe('1,234.57');
  });

  it('handles zero and negatives', () => {
    expect(fmtNumber(0)).toBe('0');
    expect(fmtNumber(-1234)).toBe('-1,234');
  });
});

describe('fmtMoney', () => {
  it('prepends symbol to formatted number', () => {
    expect(fmtMoney(1234.56, 'USD')).toBe('$1,235');
    expect(fmtMoney(1234, 'EUR')).toBe('€1,234');
  });

  it('uses $ when currency missing', () => {
    expect(fmtMoney(100)).toBe('$100');
  });

  it('handles negative values with leading minus', () => {
    expect(fmtMoney(-1234, 'USD')).toBe('-$1,234');
  });

  it('handles zero', () => {
    expect(fmtMoney(0)).toBe('$0');
  });
});

describe('fmtMoneyPrecise', () => {
  it('always shows two decimals', () => {
    expect(fmtMoneyPrecise(1234, 'USD')).toBe('$1,234.00');
    expect(fmtMoneyPrecise(0.1, 'USD')).toBe('$0.10');
  });
});

describe('fmtPct', () => {
  it('formats with 1 decimal by default', () => {
    expect(fmtPct(12.345)).toBe('12.3%');
    expect(fmtPct(0)).toBe('0.0%');
    expect(fmtPct(100)).toBe('100.0%');
  });

  it('respects digit override', () => {
    expect(fmtPct(12.345, 2)).toBe('12.35%');
    expect(fmtPct(12.345, 0)).toBe('12%');
  });

  it('handles negative percent', () => {
    expect(fmtPct(-5.5)).toBe('-5.5%');
  });

  it('returns em-dash for null/undefined/NaN/Infinity', () => {
    expect(fmtPct(null)).toBe('—');
    expect(fmtPct(undefined)).toBe('—');
    expect(fmtPct(NaN)).toBe('—');
    expect(fmtPct(Infinity)).toBe('—');
    expect(fmtPct(-Infinity)).toBe('—');
  });
});

describe('safe fallbacks', () => {
  it('fmtNumber returns em-dash on invalid', () => {
    expect(fmtNumber(null)).toBe('—');
    expect(fmtNumber(undefined)).toBe('—');
    expect(fmtNumber(NaN)).toBe('—');
  });

  it('fmtMoney returns em-dash on invalid', () => {
    expect(fmtMoney(null)).toBe('—');
    expect(fmtMoney(undefined, 'USD')).toBe('—');
    expect(fmtMoney(NaN, 'EUR')).toBe('—');
  });

  it('fmtMoneyPrecise returns em-dash on invalid', () => {
    expect(fmtMoneyPrecise(null)).toBe('—');
    expect(fmtMoneyPrecise(undefined)).toBe('—');
  });
});
