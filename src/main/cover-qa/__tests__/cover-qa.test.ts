import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { analyzeCover, computeTopHalfContrast, computeLuminanceRange } from '../index';

/**
 * Build a PNG buffer of the requested size with a simple two-band gradient
 * (top half = bright, bottom half = dark). The contrast between the halves
 * is enough to clear the thumbnail-legibility heuristic.
 */
async function buildPngBuffer(width: number, height: number): Promise<Buffer> {
  const channels = 3 as const;
  const data = Buffer.alloc(width * height * channels);
  const half = Math.floor(height / 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      // Top half is white-ish with a horizontal gradient, bottom half is dark
      // with a different gradient. Gives non-zero luminance range AND a clear
      // top-vs-whole-image delta.
      if (y < half) {
        data[i] = 240;
        data[i + 1] = 240;
        data[i + 2] = 240;
        if (x % 2 === 0) {
          data[i] = 30;
          data[i + 1] = 30;
          data[i + 2] = 30;
        }
      } else {
        data[i] = 20;
        data[i + 1] = 20;
        data[i + 2] = 20;
      }
    }
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

/**
 * Build a flat one-colour PNG of `(width, height)`. Used as a low-quality
 * fixture: same size as `buildPngBuffer`, but the gradient is removed so the
 * title-band contrast check fails.
 */
async function buildFlatPng(width: number, height: number, rgb = 128): Promise<Buffer> {
  const channels = 3 as const;
  const data = Buffer.alloc(width * height * channels, rgb);
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

describe('analyzeCover', () => {
  it('passes a 1600×2560 cover (KDP ideal) with no errors', async () => {
    const buf = await buildPngBuffer(1600, 2560);
    const report = await analyzeCover(buf);

    expect(report.width).toBe(1600);
    expect(report.height).toBe(2560);
    // Tall covers report long/short, so 2560 / 1600 = 1.6.
    expect(report.aspectRatio).toBeCloseTo(1.6, 2);
    expect(report.format).toBe('png');

    // No `error` severities should be present.
    const errors = report.checks.filter((c) => c.severity === 'error' && !c.passed);
    expect(errors).toEqual([]);

    // Dimensions check should pass.
    const dim = report.checks.find((c) => c.id === 'dimensions.ebook');
    expect(dim?.passed).toBe(true);
  });

  it('rejects low-resolution covers with an error', async () => {
    const buf = await buildPngBuffer(600, 960);
    const report = await analyzeCover(buf);

    const dim = report.checks.find((c) => c.id === 'dimensions.ebook');
    expect(dim).toBeDefined();
    expect(dim?.passed).toBe(false);
    expect(dim?.severity).toBe('error');
    expect(dim?.message).toMatch(/too small|below/i);
  });

  it('warns about a weird aspect ratio', async () => {
    // Square is well outside 1.5:1..1.7:1.
    const buf = await buildPngBuffer(2000, 2000);
    const report = await analyzeCover(buf);

    const aspect = report.checks.find((c) => c.id === 'aspectRatio');
    expect(aspect).toBeDefined();
    expect(aspect?.passed).toBe(false);
    // Outside the valid band ⇒ error severity (the spec is strict here).
    expect(aspect?.severity).toBe('error');
  });

  it('warns when the title band is flat (low contrast)', async () => {
    // Flat 1600×2560 → dimensions pass, but title-band range is 0.
    const buf = await buildFlatPng(1600, 2560);
    const report = await analyzeCover(buf);

    const titleBand = report.checks.find((c) => c.id === 'titleBand.contrast');
    expect(titleBand).toBeDefined();
    expect(titleBand?.passed).toBe(false);
    expect(titleBand?.severity).toBe('warning');
  });

  it('throws on empty / non-buffer input', async () => {
    await expect(analyzeCover(Buffer.alloc(0))).rejects.toThrow(/non-empty/);
    // @ts-expect-error — exercising the type guard
    await expect(analyzeCover(undefined)).rejects.toThrow(/non-empty/);
  });

  it('exposes sharp metadata in the report (width/height/format/colorSpace)', async () => {
    const buf = await buildPngBuffer(1800, 2880);
    const report = await analyzeCover(buf);

    expect(report.width).toBe(1800);
    expect(report.height).toBe(2880);
    expect(report.format).toBe('png');
    expect(report.colorSpace.length).toBeGreaterThan(0);
    expect(report.fileSize).toBe(buf.length);
  });
});

describe('helper functions', () => {
  it('computeLuminanceRange returns 0 for a flat buffer', () => {
    const buf = Buffer.from([100, 100, 100, 100, 100, 100, 100, 100, 100]);
    expect(computeLuminanceRange(buf, 3)).toBe(0);
  });

  it('computeLuminanceRange returns ~255 for black→white', () => {
    const buf = Buffer.from([0, 0, 0, 255, 255, 255]);
    const range = computeLuminanceRange(buf, 3);
    expect(range).toBeGreaterThan(254);
  });

  it('computeTopHalfContrast separates bright top from dark bottom', () => {
    // 2×2 image, channels=3. Top row bright, bottom row dark.
    const buf = Buffer.from([
      255, 255, 255,
      255, 255, 255,
      0, 0, 0,
      0, 0, 0,
    ]);
    const delta = computeTopHalfContrast(buf, 2, 2, 3);
    // top mean ≈ 255, all mean ≈ 127.5 ⇒ delta ≈ 127.5
    expect(delta).toBeGreaterThan(100);
  });
});
