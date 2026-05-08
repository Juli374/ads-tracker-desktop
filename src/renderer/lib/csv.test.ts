import { describe, expect, it } from 'vitest';
import { csvEscape, toCsv } from './csv';

describe('csvEscape', () => {
  it('returns plain string when no special chars', () => {
    expect(csvEscape('hello')).toBe('hello');
    expect(csvEscape(123)).toBe('123');
  });

  it('quotes value containing comma', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
  });

  it('quotes value containing newline', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
    expect(csvEscape('cr\rlf')).toBe('"cr\rlf"');
  });

  it('escapes inner quote by doubling', () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });

  it('handles null and undefined as empty', () => {
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
  });

  it('coerces non-string values', () => {
    expect(csvEscape(true)).toBe('true');
    expect(csvEscape(0)).toBe('0');
  });
});

describe('toCsv', () => {
  it('returns just header when rows empty', () => {
    expect(toCsv([], ['a', 'b'])).toBe('a,b');
  });

  it('joins header and rows with newlines', () => {
    const csv = toCsv(
      [
        { a: 1, b: 2 },
        { a: 3, b: 4 },
      ],
      ['a', 'b'],
    );
    expect(csv).toBe('a,b\n1,2\n3,4');
  });

  it('escapes values that need quoting', () => {
    const csv = toCsv([{ name: 'Smith, John', note: 'has "quote"' }], [
      'name',
      'note',
    ]);
    expect(csv).toBe('name,note\n"Smith, John","has ""quote"""');
  });

  it('drops missing columns as empty', () => {
    const csv = toCsv([{ a: 1 }] as Array<Record<string, unknown>>, ['a', 'b']);
    expect(csv).toBe('a,b\n1,');
  });
});
