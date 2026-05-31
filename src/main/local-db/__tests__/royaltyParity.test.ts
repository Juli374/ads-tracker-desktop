import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseCanonical } from '../xlsxParser';

/**
 * Parser-parity test.
 *
 * Feeds the synthetic 4-sheet KDP fixture (kdp_royalty_sample.xlsx, generated
 * by generate_kdp_fixture.js) through the DESKTOP canonical parser and asserts
 * a deep-equal match against expected_canonical.json — the reference output of
 * the backend parser (ads-tracker/backend/services/royalty_import_service.py).
 *
 * The fixture exercises: MARKETPLACE_MAP conversions + unmapped passthrough,
 * comma-decimal numbers, 'N/A' / '-' values, refunds, dual-date filtering
 * (order_date -> sales, royalty_date -> royalties), out-of-month drops, empty
 * rows, and zero KENP reads. If this passes, the desktop parser matches the
 * backend field-for-field for the target month 2026-04.
 */

const FIXTURE_DIR = path.join(__dirname, 'fixtures');

function loadFixtureBuffer(): Buffer {
  return fs.readFileSync(path.join(FIXTURE_DIR, 'kdp_royalty_sample.xlsx'));
}

function loadExpected(): Record<string, unknown> {
  const raw = fs.readFileSync(
    path.join(FIXTURE_DIR, 'expected_canonical.json'),
    'utf8',
  );
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  // `_meta` is documentation, not parser output.
  delete parsed._meta;
  return parsed;
}

describe('royalty parser parity (desktop ↔ backend canonical)', () => {
  const TARGET_YEAR = 2026;
  const TARGET_MONTH = 4;

  it('parses the 4-sheet fixture identically to expected_canonical.json', () => {
    const buf = loadFixtureBuffer();
    const result = parseCanonical(buf, TARGET_YEAR, TARGET_MONTH, null);
    const expected = loadExpected();

    // Round-trip through JSON so undefined/null and number formatting (-7.0 ===
    // -7) normalise the same way the backend's JSON output does.
    const actualJson = JSON.parse(JSON.stringify(result));
    expect(actualJson).toEqual(expected);
  });

  it('matches per-bucket record counts from the fixture meta', () => {
    const buf = loadFixtureBuffer();
    const result = parseCanonical(buf, TARGET_YEAR, TARGET_MONTH, null);
    expect(result.ebook_royalties).toHaveLength(5);
    expect(result.paperback_sales).toHaveLength(3);
    expect(result.paperback_royalties).toHaveLength(3);
    expect(result.hardcover_sales).toHaveLength(2);
    expect(result.hardcover_royalties).toHaveLength(2);
    expect(result.kenp_reads).toHaveLength(3);
  });

  it('drops out-of-month rows and skips empty rows', () => {
    const buf = loadFixtureBuffer();
    const result = parseCanonical(buf, TARGET_YEAR, TARGET_MONTH, null);
    // eBook has a March row + an empty row in the fixture; only 5 survive.
    for (const r of result.ebook_royalties) {
      expect(r.royalty_date?.startsWith('2026-04')).toBe(true);
    }
    // KENP: zero-read in-month row is kept, out-of-month dropped.
    expect(result.kenp_reads.some((r) => r.kenp_read === 0)).toBe(true);
  });

  it('converts marketplaces and passes unmapped domains through verbatim', () => {
    const buf = loadFixtureBuffer();
    const result = parseCanonical(buf, TARGET_YEAR, TARGET_MONTH, null);
    expect(result.ebook_royalties.map((r) => r.marketplace)).toContain('USA');
    // 'Amazon.zz' is not in MARKETPLACE_MAP -> passed through unchanged.
    expect(result.ebook_royalties.map((r) => r.marketplace)).toContain(
      'Amazon.zz',
    );
  });
});
