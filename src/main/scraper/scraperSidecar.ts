// Bundled scraper sidecar — main-process child-process driver.
//
// Locates the PyInstaller-built "amazon-scraper-sidecar" binary that ships
// inside the packaged app under resources/ (forge.config `extraResource`),
// spawns it, writes "ASIN|MARKETPLACE" lines to stdin, reads the JSON results
// array from stdout, and parses it.
//
// The sidecar is `amazon-scrapers/scrape_cli.py` frozen with PyInstaller. Its
// contract (see that file's docstring):
//   - stdin : one "ASIN|MARKETPLACE" line per target (US/UK/DE/FR/ES/IT/CA/AU/NL,
//             case-insensitive; comma also accepted as a separator). Blank lines
//             and lines starting with '#' are ignored.
//   - stdout: exactly one JSON array of
//             {asin, marketplace, bsr, bsr_category, rating, review_count, error}
//             — `marketplace` comes back as the lowercase scraper code
//             (com/uk/de/...) regardless of the label we sent in.
//   - exit  : 0 on a completed run. We are nonetheless robust to a non-zero exit
//             and to partial / noisy stdout (PyInstaller bootloader chatter,
//             stray warnings) — we extract the LAST top-level JSON array we can
//             find rather than trusting the whole stream to be clean JSON.
//
// Pure main-process module. No IPC, no preload. Mirrors the conventions of the
// other main/* modules: small typed surface, electron-log via ../logger, never
// throws into the caller's hot path without a typed result.

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';
import { logger } from '../logger';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * One scraped row, exactly as the sidecar prints it. `marketplace` is the
 * lowercase scraper code (com/uk/de/fr/es/it/ca/au/nl). A row with a non-null
 * `error` failed to scrape and must NOT be stored by the backend.
 */
export interface SidecarResult {
  asin: string;
  marketplace: string;
  bsr: number | null;
  bsr_category: string | null;
  rating: number | null;
  review_count: number | null;
  error: string | null;
}

export interface RunSidecarOptions {
  /** "ASIN|MARKETPLACE" lines to feed on stdin (already account-scoped). */
  targets: string[];
  /**
   * Hard ceiling for the whole run. The Python side uses polite 2–5s delays per
   * ASIN, so a large batch legitimately takes minutes. Default scales with the
   * batch size; pass an explicit value to override. On timeout we kill the child
   * and return whatever rows it had already flushed.
   */
  timeoutMs?: number;
  /**
   * Test / advanced override for the binary location. When unset we resolve the
   * per-OS path under resources/ (packaged) or the repo checkout (dev).
   */
  binaryPathOverride?: string;
}

export interface RunSidecarResult {
  results: SidecarResult[];
  /** Process exit code, or null if it was killed (timeout / signal). */
  exitCode: number | null;
  /** True when the run was aborted by the timeout guard. */
  timedOut: boolean;
  /** Populated when we could not spawn / parse at all. results is [] then. */
  error?: string;
}

// -----------------------------------------------------------------------------
// Binary resolution
// -----------------------------------------------------------------------------

// PyInstaller emits a bare executable named after the spec (`amazon-scraper-sidecar`,
// + `.exe` on Windows). We ship it via forge.config `extraResource`, so in a
// packaged app it lands directly in the platform resources dir:
//   macOS   : KDPBook.app/Contents/Resources/<dir>/amazon-scraper-sidecar
//   Windows : resources/<dir>/amazon-scraper-sidecar.exe
//   Linux   : resources/<dir>/amazon-scraper-sidecar
// `process.resourcesPath` points at that Resources/ dir in a packaged build.
//
// We keep the binaries under a per-OS subfolder so a single extraResource list
// can carry all three platforms without name collisions; only the matching
// OS folder is actually present in a given build, but resolving defensively
// across a few candidate layouts keeps this robust to how the binary is staged.
const SIDECAR_BASENAME = 'amazon-scraper-sidecar';

function platformDir(): string {
  // win32 | darwin | linux — matches the folder names the packaging step uses.
  return process.platform;
}

function exeName(): string {
  return process.platform === 'win32' ? `${SIDECAR_BASENAME}.exe` : SIDECAR_BASENAME;
}

/**
 * Build the ordered list of locations to probe for the sidecar binary, most
 * specific first. We try both a per-OS subfolder and a flat layout so the
 * binary resolves whether packaging nests by platform or not, and we cover the
 * dev checkout (running `npm start`, where `process.resourcesPath` is Electron's
 * own resources dir and our binary is NOT there).
 */
export function sidecarCandidatePaths(): string[] {
  const exe = exeName();
  const osDir = platformDir();
  const candidates: string[] = [];

  // 1) Packaged: <resources>/scraper-sidecar/<os>/<exe> and flat variants.
  //    `process.resourcesPath` is defined in packaged builds.
  const resources = process.resourcesPath;
  if (resources) {
    candidates.push(path.join(resources, 'scraper-sidecar', osDir, exe));
    candidates.push(path.join(resources, 'scraper-sidecar', exe));
    candidates.push(path.join(resources, osDir, exe));
    candidates.push(path.join(resources, exe));
  }

  // 2) Dev (`npm start`): the binary is built into the repo. Resolve relative to
  //    app.getAppPath() (…/ads-tracker-desktop) up to the sibling amazon-scrapers
  //    checkout, plus an in-repo `resources/` staging dir if the dev built there.
  //    These are best-effort; missing ones are simply skipped by existsSync.
  try {
    const appPath = app.getAppPath();
    candidates.push(path.join(appPath, 'resources', 'scraper-sidecar', osDir, exe));
    candidates.push(path.join(appPath, 'resources', 'scraper-sidecar', exe));
    // Sibling repo layout: KDP-business/amazon-scrapers/dist/<os>/<exe>
    const businessRoot = path.resolve(appPath, '..');
    candidates.push(path.join(businessRoot, 'amazon-scrapers', 'dist', osDir, exe));
    candidates.push(path.join(businessRoot, 'amazon-scrapers', 'dist', exe));
  } catch {
    // app.getAppPath() can throw very early in boot — ignore; packaged paths cover prod.
  }

  // 3) Explicit env override for power users / CI smoke tests.
  const envPath = process.env.SCRAPER_SIDECAR_PATH?.trim();
  if (envPath) candidates.unshift(envPath);

  return candidates;
}

/**
 * Return the first candidate path that exists on disk, or null. Logs the probe
 * set at debug level so a packaging mistake is diagnosable from the app log.
 */
export function resolveSidecarBinary(override?: string): string | null {
  if (override) {
    return fs.existsSync(override) ? override : null;
  }
  const candidates = sidecarCandidatePaths();
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      // ignore unreadable candidate
    }
  }
  logger.warn('[scraper-sidecar] binary not found in any candidate path', {
    candidates,
    platform: process.platform,
  });
  return null;
}

// -----------------------------------------------------------------------------
// stdout parsing
// -----------------------------------------------------------------------------

/**
 * Extract the results array from the sidecar's stdout. The happy path is "the
 * whole buffer is the JSON array", but PyInstaller bootloaders and stray library
 * warnings can prepend noise, so we fall back to scanning for the last balanced
 * top-level `[ … ]` and parsing that. Returns null when nothing parseable is
 * found.
 */
export function parseSidecarStdout(stdout: string): SidecarResult[] | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;

  // Fast path: clean JSON array.
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed as SidecarResult[];
    } catch {
      // fall through to the scanner
    }
  }

  // Robust path: the sidecar prints the array LAST, but a PyInstaller bootloader
  // could in theory flush a line before AND/OR after it. So we try every ']'
  // from the end of the buffer: for each, walk back to its matching '[' (string-
  // and escape-aware) and attempt to parse that balanced slice. First slice that
  // parses to an array wins. This tolerates noise on both sides of the JSON.
  for (let close = trimmed.length - 1; close >= 0; close--) {
    if (trimmed[close] !== ']') continue;
    const open = matchingOpenBracket(trimmed, close);
    if (open === -1) continue;
    try {
      const parsed = JSON.parse(trimmed.slice(open, close + 1));
      if (Array.isArray(parsed)) return parsed as SidecarResult[];
    } catch {
      // Not a valid array ending here — keep scanning earlier ']' positions.
    }
  }
  return null;
}

/**
 * Given the index of a ']' in `s`, return the index of its matching top-level
 * '[' (depth 0), or -1 if unbalanced. Walks backwards, ignoring brackets that
 * appear inside double-quoted strings (with backslash-escape handling).
 */
function matchingOpenBracket(s: string, closeIdx: number): number {
  let depth = 0;
  let inString = false;
  for (let i = closeIdx; i >= 0; i--) {
    const ch = s[i];
    if (inString) {
      // Walking backwards: a quote ends the string region unless it is escaped.
      // Determine escaping by counting the run of preceding backslashes.
      if (ch === '"') {
        let backslashes = 0;
        let j = i - 1;
        while (j >= 0 && s[j] === '\\') {
          backslashes++;
          j--;
        }
        if (backslashes % 2 === 0) inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === ']') depth++;
    else if (ch === '[') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Defensive normalisation of a raw parsed row into a typed SidecarResult.
 * Coerces the numeric fields, defaults missing ones to null. Rows missing an
 * `asin` are dropped (they can't be stored). This protects the POST body from a
 * sidecar that drifts its output shape.
 */
function normaliseRow(raw: unknown): SidecarResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const asin = typeof r.asin === 'string' ? r.asin.trim().toUpperCase() : '';
  const marketplace = typeof r.marketplace === 'string' ? r.marketplace.trim().toLowerCase() : '';
  if (!asin || !marketplace) return null;

  const num = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return null;
  };
  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.length > 0 ? v : null;

  return {
    asin,
    marketplace,
    bsr: num(r.bsr),
    bsr_category: str(r.bsr_category),
    rating: num(r.rating),
    review_count: num(r.review_count),
    error: str(r.error),
  };
}

// -----------------------------------------------------------------------------
// Run
// -----------------------------------------------------------------------------

// Per-ASIN budget: the sidecar sleeps 2–5s between ASINs and a single product
// fetch can take a few seconds, so we allow a generous slice each, on top of a
// fixed floor that covers PyInstaller cold-start.
const PER_TARGET_BUDGET_MS = 20_000;
const BASE_BUDGET_MS = 30_000;
const MAX_BUDGET_MS = 60 * 60 * 1000; // never wait more than an hour

function defaultTimeout(targetCount: number): number {
  return Math.min(MAX_BUDGET_MS, BASE_BUDGET_MS + targetCount * PER_TARGET_BUDGET_MS);
}

/**
 * Spawn the sidecar, feed targets on stdin, collect stdout, parse results.
 * Never throws — every failure mode resolves to a RunSidecarResult with
 * `results: []` and an `error` string, so the scheduler can log and move on.
 */
export async function runSidecar(options: RunSidecarOptions): Promise<RunSidecarResult> {
  const targets = (options.targets ?? []).map((t) => t.trim()).filter(Boolean);
  if (targets.length === 0) {
    return { results: [], exitCode: 0, timedOut: false };
  }

  const binary = resolveSidecarBinary(options.binaryPathOverride);
  if (!binary) {
    return {
      results: [],
      exitCode: null,
      timedOut: false,
      error: 'sidecar binary not found (see app log for probed paths)',
    };
  }

  const timeoutMs = options.timeoutMs ?? defaultTimeout(targets.length);

  return new Promise<RunSidecarResult>((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const finish = (res: RunSidecarResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(res);
    };

    let child;
    try {
      child = spawn(binary, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        // Run from the binary's own directory: a one-file PyInstaller build is
        // self-contained, but this keeps any relative resource lookups sane.
        cwd: path.dirname(binary),
        windowsHide: true,
      });
    } catch (err) {
      return finish({
        results: [],
        exitCode: null,
        timedOut: false,
        error: `spawn failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    const timer = setTimeout(() => {
      timedOut = true;
      logger.warn('[scraper-sidecar] run exceeded timeout — killing child', {
        timeoutMs,
        targetCount: targets.length,
      });
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
    }, timeoutMs);
    // Don't let the timer hold the event loop / app open.
    if (typeof timer.unref === 'function') timer.unref();

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      // Bounded: don't let a chatty sidecar balloon memory. Keep the tail.
      stderr = (stderr + chunk).slice(-8192);
    });

    child.on('error', (err) => {
      finish({
        results: [],
        exitCode: null,
        timedOut,
        error: `child error: ${err instanceof Error ? err.message : String(err)}`,
      });
    });

    child.on('close', (code) => {
      const parsed = parseSidecarStdout(stdout);
      if (parsed === null) {
        finish({
          results: [],
          exitCode: code,
          timedOut,
          error:
            timedOut
              ? 'timed out before sidecar produced parseable output'
              : `could not parse sidecar stdout (exit=${code}); stderr tail: ${stderr.trim().slice(-500)}`,
        });
        return;
      }
      const results: SidecarResult[] = [];
      for (const raw of parsed) {
        const row = normaliseRow(raw);
        if (row) results.push(row);
      }
      finish({ results, exitCode: code, timedOut });
    });

    // Feed targets then close stdin so the sidecar's stdin read returns EOF.
    try {
      child.stdin?.write(targets.join('\n') + '\n');
      child.stdin?.end();
    } catch (err) {
      // If the child died before we could write, `close`/`error` will settle.
      logger.warn('[scraper-sidecar] failed to write stdin', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
