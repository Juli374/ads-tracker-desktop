/**
 * Cover QA — local image analyser for KDP cover uploads.
 *
 * Runs in the Electron main process so we can use the native `sharp` binary
 * (libvips) without exposing Node APIs to the renderer. The public surface is
 * `analyzeCover(buffer)`. The IPC handler in `ipc-handlers.ts` wraps this
 * with path/base64 plumbing.
 *
 * Heuristics & thresholds were chosen from public KDP guidelines:
 *   - ebook cover: ≥ 1600 px on the shortest side (KDP recommends ≥ 2560×1600)
 *   - print cover (6×9 in @300 dpi): ≥ 1800×2700 px
 *   - aspect ratio: 1.5:1 .. 1.7:1 (ideal 1.6:1, e.g. 1600×2560)
 *   - file size: < 100 KB ⇒ likely low quality; > 50 MB exceeds KDP's hard cap
 *   - colour space: ebook expects sRGB; CMYK is print-only
 *
 * Tier-free: this feature is shipped to all users (Start tier) for virality.
 */
import sharp from 'sharp';

export type CoverCheckSeverity = 'error' | 'warning' | 'info';

export interface CoverQACheck {
  id: string;
  passed: boolean;
  severity: CoverCheckSeverity;
  message: string;
  suggestion?: string;
}

export interface CoverQAReport {
  width: number;
  height: number;
  aspectRatio: number;
  /** Always 0 for ebook-only PNG/JPEG — sharp does not return DPI for most web images. */
  dpi: number;
  format: string;
  colorSpace: string;
  fileSize: number;
  checks: CoverQACheck[];
}

export interface AnalyzeCoverOptions {
  /** Target use-case influences which dimension/colour-space checks fire. Defaults to "ebook". */
  target?: 'ebook' | 'print';
}

// === thresholds (named constants to keep tests readable) ===
const MIN_EBOOK_SHORT_SIDE = 1600;
const RECOMMENDED_EBOOK_SHORT_SIDE = 2560;
const MIN_PRINT_WIDTH = 1800;
const MIN_PRINT_HEIGHT = 2700;
const MIN_ASPECT = 1.5;
const MAX_ASPECT = 1.7;
const IDEAL_ASPECT = 1.6;
const MIN_FILE_SIZE = 100 * 1024;        // 100 KB
const MAX_FILE_SIZE = 50 * 1024 * 1024;  // 50 MB
const THUMBNAIL_WIDTH = 280;
const THUMBNAIL_HEIGHT = 448;
const LOW_CONTRAST_THRESHOLD = 25;       // empirical LAB-lightness range below which titles disappear

/**
 * Analyse a cover image and return a `CoverQAReport`.
 *
 * The function accepts the raw image bytes as a Buffer (so the caller — the
 * IPC handler — controls whether they came from a file path or a base64
 * payload). All checks are pure functions of those bytes plus the optional
 * target use-case.
 */
export async function analyzeCover(
  buffer: Buffer,
  options: AnalyzeCoverOptions = {},
): Promise<CoverQAReport> {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('analyzeCover: buffer must be a non-empty Buffer');
  }
  const target = options.target ?? 'ebook';

  const image = sharp(buffer, { failOn: 'none' });
  const meta = await image.metadata();

  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const fileSize = buffer.length;
  const format = meta.format ?? 'unknown';
  const dpi = meta.density ?? 0;
  // `sharp` exposes colour space via `meta.space` ('srgb', 'cmyk', etc.).
  const colorSpace = meta.space ?? 'unknown';
  // KDP describes covers as "1.6:1" (tall:wide), so compute the ratio of the
  // long side to the short side. This makes the check direction-agnostic.
  const aspectRatio =
    width > 0 && height > 0
      ? Math.max(width, height) / Math.min(width, height)
      : 0;
  const shortSide = Math.min(width, height);

  const checks: CoverQACheck[] = [];

  // --- 1. Minimum dimensions --------------------------------------------------
  if (target === 'print') {
    const ok = width >= MIN_PRINT_WIDTH && height >= MIN_PRINT_HEIGHT;
    checks.push({
      id: 'dimensions.print',
      passed: ok,
      severity: ok ? 'info' : 'error',
      message: ok
        ? `Print dimensions OK: ${width}×${height}`
        : `Print cover should be at least ${MIN_PRINT_WIDTH}×${MIN_PRINT_HEIGHT} px (got ${width}×${height})`,
      suggestion: ok ? undefined : 'Render the cover at 300 DPI for a 6×9 in trim.',
    });
  } else {
    const ok = shortSide >= MIN_EBOOK_SHORT_SIDE;
    const recommended = shortSide >= RECOMMENDED_EBOOK_SHORT_SIDE;
    checks.push({
      id: 'dimensions.ebook',
      passed: ok,
      severity: ok ? (recommended ? 'info' : 'warning') : 'error',
      message: ok
        ? recommended
          ? `Dimensions OK: ${width}×${height}`
          : `Dimensions acceptable but below the KDP ideal of ${RECOMMENDED_EBOOK_SHORT_SIDE} px on the shortest side (got ${shortSide} px)`
        : `Cover is too small: shortest side ${shortSide} px is below the ${MIN_EBOOK_SHORT_SIDE} px minimum`,
      suggestion: ok ? undefined : `Re-export at ≥ ${RECOMMENDED_EBOOK_SHORT_SIDE} px on the shortest side.`,
    });
  }

  // --- 2. Aspect ratio --------------------------------------------------------
  const aspectOk = aspectRatio >= MIN_ASPECT && aspectRatio <= MAX_ASPECT;
  const closeToIdeal = Math.abs(aspectRatio - IDEAL_ASPECT) <= 0.05;
  checks.push({
    id: 'aspectRatio',
    passed: aspectOk,
    severity: aspectOk ? (closeToIdeal ? 'info' : 'warning') : 'error',
    message: aspectOk
      ? `Aspect ratio ${aspectRatio.toFixed(2)}:1 is inside KDP's valid range (${MIN_ASPECT}–${MAX_ASPECT})`
      : `Aspect ratio ${aspectRatio.toFixed(2)}:1 is outside KDP's valid range (${MIN_ASPECT}–${MAX_ASPECT})`,
    suggestion: aspectOk
      ? closeToIdeal
        ? undefined
        : `For best results crop closer to ${IDEAL_ASPECT}:1 (e.g. 1600×2560).`
      : 'Resize the canvas so height/width sits between 1.5 and 1.7.',
  });

  // --- 3. File size -----------------------------------------------------------
  if (fileSize > MAX_FILE_SIZE) {
    checks.push({
      id: 'fileSize.tooLarge',
      passed: false,
      severity: 'error',
      message: `File is ${(fileSize / (1024 * 1024)).toFixed(1)} MB — exceeds KDP's 50 MB upload cap`,
      suggestion: 'Re-export with stronger JPEG compression or as a PNG.',
    });
  } else if (fileSize < MIN_FILE_SIZE) {
    checks.push({
      id: 'fileSize.tooSmall',
      passed: false,
      severity: 'warning',
      message: `File is only ${(fileSize / 1024).toFixed(0)} KB — possibly over-compressed or low-resolution`,
      suggestion: 'Use higher quality JPEG (90+) or a PNG export.',
    });
  } else {
    checks.push({
      id: 'fileSize',
      passed: true,
      severity: 'info',
      message: `File size OK: ${(fileSize / 1024).toFixed(0)} KB`,
    });
  }

  // --- 4. Colour space --------------------------------------------------------
  const space = colorSpace.toLowerCase();
  const isCmyk = space.includes('cmyk');
  const isSrgb = space === 'srgb' || space === 'rgb' || space.includes('rgb');
  if (target === 'ebook' && isCmyk) {
    checks.push({
      id: 'colorSpace.ebook',
      passed: false,
      severity: 'warning',
      message: 'Ebook covers should be sRGB — CMYK colours will shift on Amazon detail pages',
      suggestion: 'Convert to sRGB before exporting.',
    });
  } else if (target === 'print' && !isCmyk) {
    checks.push({
      id: 'colorSpace.print',
      passed: false,
      severity: 'warning',
      message: 'Print covers usually expect CMYK — RGB colours will be re-mapped at print time',
      suggestion: 'Convert to CMYK in your DTP tool.',
    });
  } else {
    checks.push({
      id: 'colorSpace',
      passed: true,
      severity: 'info',
      message: `Colour space OK: ${colorSpace}${isSrgb ? ' (sRGB)' : ''}`,
    });
  }

  // --- 5. Thumbnail legibility -----------------------------------------------
  // Resize to KDP catalogue thumbnail and compare luminance of top half (where
  // titles usually live) vs the whole image. A small delta means the title
  // sinks into the background at small sizes.
  let thumbLuminanceContrast = 0;
  try {
    const thumb = await image
      .clone()
      .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    thumbLuminanceContrast = computeTopHalfContrast(
      thumb.data,
      thumb.info.width,
      thumb.info.height,
      thumb.info.channels,
    );
  } catch {
    // Ignore — some exotic formats (e.g. CMYK TIFFs) cannot be resized to raw.
    thumbLuminanceContrast = NaN;
  }
  if (Number.isFinite(thumbLuminanceContrast)) {
    const thumbOk = thumbLuminanceContrast >= 10;
    checks.push({
      id: 'thumbnail.legibility',
      passed: thumbOk,
      severity: thumbOk ? 'info' : 'warning',
      message: thumbOk
        ? `Thumbnail legibility OK (top-half contrast ${thumbLuminanceContrast.toFixed(1)})`
        : `Title may be hard to read at thumbnail size (top-half contrast only ${thumbLuminanceContrast.toFixed(1)})`,
      suggestion: thumbOk ? undefined : 'Add a contrasting overlay or larger title typography.',
    });
  }

  // --- 6. Low-contrast warning in the title band -----------------------------
  let titleBandRange = NaN;
  try {
    // Top-third raw pixels at original resolution → compute luminance range.
    const topThirdHeight = Math.max(1, Math.floor(height / 3));
    const topThird = await image
      .clone()
      .extract({ left: 0, top: 0, width, height: topThirdHeight })
      .raw()
      .toBuffer({ resolveWithObject: true });
    titleBandRange = computeLuminanceRange(
      topThird.data,
      topThird.info.channels,
    );
  } catch {
    titleBandRange = NaN;
  }
  if (Number.isFinite(titleBandRange)) {
    const passed = titleBandRange >= LOW_CONTRAST_THRESHOLD;
    checks.push({
      id: 'titleBand.contrast',
      passed,
      severity: passed ? 'info' : 'warning',
      message: passed
        ? `Title band contrast OK (luminance range ${titleBandRange.toFixed(1)})`
        : `Title band looks flat — luminance range only ${titleBandRange.toFixed(1)} (≥ ${LOW_CONTRAST_THRESHOLD} recommended)`,
      suggestion: passed
        ? undefined
        : 'Bold the title or add a darker drop-shadow so it stands out from the artwork.',
    });
  }

  return {
    width,
    height,
    aspectRatio: Number(aspectRatio.toFixed(3)),
    dpi,
    format,
    colorSpace,
    fileSize,
    checks,
  };
}

// === Internal helpers (exported for unit tests only) ========================

/**
 * Compute |avgLuminance(top half) − avgLuminance(whole image)|. Works on raw
 * RGB or RGBA pixels.
 */
export function computeTopHalfContrast(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
): number {
  if (width <= 0 || height <= 0 || channels < 3) return 0;
  const half = Math.floor(height / 2);
  let topSum = 0;
  let topCount = 0;
  let allSum = 0;
  let allCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const lum = luminance(data[i], data[i + 1], data[i + 2]);
      allSum += lum;
      allCount++;
      if (y < half) {
        topSum += lum;
        topCount++;
      }
    }
  }
  if (topCount === 0 || allCount === 0) return 0;
  return Math.abs(topSum / topCount - allSum / allCount);
}

/**
 * Compute the (max − min) luminance across the buffer. Used as a cheap
 * "is there contrast?" probe for the title band.
 */
export function computeLuminanceRange(data: Buffer, channels: number): number {
  if (channels < 3 || data.length === 0) return 0;
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += channels) {
    const lum = luminance(data[i], data[i + 1], data[i + 2]);
    if (lum < min) min = lum;
    if (lum > max) max = lum;
  }
  return max - min;
}

/** Rec. 709 luminance. */
function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
