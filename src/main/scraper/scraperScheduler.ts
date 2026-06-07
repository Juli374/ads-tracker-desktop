// Scraper scheduler — runs the bundled sidecar on a timer and syncs to backend.
//
// Architecture (mirrors src/main/automation/auto-negativator.ts and
// src/main/briefing/briefer.ts):
//
//   The ScraperScheduler class lives in the main process. One cycle does:
//     1. GET  /api/scrape/targets   — the signed-in user's ACTIVE ASINs+marketplaces,
//        account-scoped server-side. Shape: {"targets": ["B0..|US", "B0..|DE", ...]}
//     2. Feed those lines to the PyInstaller sidecar (scraperSidecar.runSidecar),
//        which scrapes BSR + rating + review_count on the USER's machine/IP and
//        returns the results JSON array.
//     3. POST /api/scrape/results  — {"results": [...]} (non-error rows only are
//        stored by the backend, stamped with the user's account_id). Response:
//        {"stored": N, "skipped": M}.
//
//   Scheduling: one run shortly after launch (default ~30s, to let the window
//   settle and auth land), then every INTERVAL (default 6h) WHILE THE APP IS
//   OPEN. We use a recursive setTimeout (re-armed from inside the firing
//   callback) rather than setInterval so a long-running cycle never overlaps the
//   next tick, and so a laptop that slept past a tick fires once on wake instead
//   of replaying missed ticks. NOTE: this only runs while the app is running —
//   there is no background daemon / OS scheduler here (that is a separate
//   product decision; see README).
//
// Testability: all side effects are injected — fetchFn (HTTP), runFn (sidecar),
// nowFn (clock), emitChange (renderer push). Tests stub them. The constructor
// does NOT start the timer; call start() explicitly (production) and the timer
// fires the first cycle after `initialDelayMs`.
//
// Auth: fetchFn defaults to performApiRequest, which attaches the signed-in
// user's Bearer token (src/main/api-client.ts) and transparently handles
// refresh-on-401. We never touch the token here.

import type { BrowserWindow as ElectronBrowserWindow } from 'electron';
import type { ApiRequestPayload, ApiResponse } from '../../shared/ipc';
import { logger } from '../logger';
import type { SidecarResult, RunSidecarResult } from './scraperSidecar';

// -----------------------------------------------------------------------------
// Tunables
// -----------------------------------------------------------------------------

/** Default cadence between cycles while the app is open. */
export const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
/** Default delay from start() to the first cycle. */
export const DEFAULT_INITIAL_DELAY_MS = 30_000; // 30 seconds
/** Hard cap on how many targets we feed the sidecar in one cycle (politeness / runtime). */
const MAX_TARGETS_PER_CYCLE = 500;

// -----------------------------------------------------------------------------
// Public state shape (for IPC / tests, if a settings surface is added later)
// -----------------------------------------------------------------------------

export interface ScraperSyncState {
  /** ISO timestamp of the last completed cycle (success or handled failure). */
  lastRunAt: string | null;
  /** ISO timestamp of the next scheduled cycle, or null when stopped. */
  nextRunAt: string | null;
  /** Targets received from the backend on the last cycle. */
  lastTargetCount: number;
  /** Rows the backend reported it stored on the last cycle. */
  lastStored: number;
  /** Rows skipped (errored rows + backend-side de-dupe) on the last cycle. */
  lastSkipped: number;
  /** First error of the last cycle, or null. */
  lastError: string | null;
}

export interface ScraperCycleResult {
  targetCount: number;
  scrapedCount: number;
  errorRows: number;
  stored: number;
  skipped: number;
  error?: string;
}

// Backend response shapes (kept narrow on purpose).
interface TargetsResponse {
  targets?: string[];
}
interface ResultsResponse {
  stored?: number;
  skipped?: number;
}

export interface ScraperSchedulerDeps {
  /** HTTP call. Defaults to performApiRequest (proxy-aware net.fetch + Bearer auth). */
  fetchFn: <T = unknown>(payload: ApiRequestPayload) => Promise<ApiResponse<T>>;
  /** Run the sidecar over "ASIN|MARKETPLACE" lines. Defaults to runSidecar. */
  runFn: (targets: string[]) => Promise<RunSidecarResult>;
  /** Clock. Tests can freeze. */
  nowFn?: () => number;
  /** Push state-change events to renderers. Defaults to no-op. */
  emitChange?: (state: ScraperSyncState) => void;
  /** Cadence override (ms). Default 6h. */
  intervalMs?: number;
  /** First-cycle delay override (ms). Default 30s. */
  initialDelayMs?: number;
}

// -----------------------------------------------------------------------------
// Scheduler
// -----------------------------------------------------------------------------

export class ScraperScheduler {
  private deps: ScraperSchedulerDeps;
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<ScraperCycleResult> | null = null;
  private nextRunAtMs: number | null = null;
  private started = false;

  private state: ScraperSyncState = {
    lastRunAt: null,
    nextRunAt: null,
    lastTargetCount: 0,
    lastStored: 0,
    lastSkipped: 0,
    lastError: null,
  };

  constructor(deps: ScraperSchedulerDeps) {
    this.deps = deps;
  }

  private now(): number {
    return this.deps.nowFn ? this.deps.nowFn() : Date.now();
  }

  private get intervalMs(): number {
    const v = this.deps.intervalMs;
    return typeof v === 'number' && v > 0 ? v : DEFAULT_INTERVAL_MS;
  }

  private get initialDelayMs(): number {
    const v = this.deps.initialDelayMs;
    return typeof v === 'number' && v >= 0 ? v : DEFAULT_INITIAL_DELAY_MS;
  }

  /** Snapshot for IPC handlers / a future Settings surface. */
  getState(): ScraperSyncState {
    return {
      ...this.state,
      nextRunAt: this.nextRunAtMs ? new Date(this.nextRunAtMs).toISOString() : null,
    };
  }

  /**
   * Boot-time start. Idempotent — repeat calls are a no-op once started. Arms
   * the first cycle after `initialDelayMs`; each cycle re-arms the next at
   * `intervalMs`. Safe to call right after the window is created and the user is
   * signed in.
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    logger.info('[scraper-sync] scheduler started', {
      intervalMs: this.intervalMs,
      initialDelayMs: this.initialDelayMs,
    });
    this.armNext(this.initialDelayMs);
  }

  /** Stop the scheduler and cancel any pending timer (sign-out / lifecycle / tests). */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.nextRunAtMs = null;
    this.started = false;
  }

  /**
   * Run one cycle immediately, de-duped against a concurrent run (the timer or a
   * "Sync now" button can't spawn two overlapping sidecar runs). Returns the
   * cycle result. Re-arms the interval timer on completion.
   */
  async runNow(): Promise<ScraperCycleResult> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.runCycle().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private armNext(delayMs: number): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const delay = Math.max(1000, delayMs);
    this.nextRunAtMs = this.now() + delay;
    this.timer = setTimeout(() => {
      void this.runNow().catch(() => {
        // runCycle records its own errors in state; nothing to do here.
      });
    }, delay);
    // Never hold the app open just for the scraper timer.
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  /** GET targets -> sidecar -> POST results. Never throws; records errors in state. */
  private async runCycle(): Promise<ScraperCycleResult> {
    const result: ScraperCycleResult = {
      targetCount: 0,
      scrapedCount: 0,
      errorRows: 0,
      stored: 0,
      skipped: 0,
    };

    try {
      // --- 1) Fetch account-scoped targets ---
      const targetsRes = await this.deps.fetchFn<TargetsResponse>({
        method: 'GET',
        path: '/api/scrape/targets',
      });

      if (!targetsRes.ok || !targetsRes.data) {
        const msg = targetsRes.error ?? `HTTP ${targetsRes.status}`;
        result.error = `targets fetch failed: ${msg}`;
        logger.warn('[scraper-sync] targets fetch failed', {
          status: targetsRes.status,
          code: targetsRes.code,
          error: targetsRes.error,
        });
        this.finishCycle(result);
        return result;
      }

      const rawTargets = Array.isArray(targetsRes.data.targets) ? targetsRes.data.targets : [];
      const targets = rawTargets
        .filter((t): t is string => typeof t === 'string' && t.includes('|'))
        .map((t) => t.trim())
        .slice(0, MAX_TARGETS_PER_CYCLE);
      result.targetCount = targets.length;

      if (targets.length === 0) {
        logger.info('[scraper-sync] no active targets for this account — nothing to scrape');
        this.finishCycle(result);
        return result;
      }

      logger.info('[scraper-sync] cycle start', { targetCount: targets.length });

      // --- 2) Run the sidecar on the user's machine ---
      const run = await this.deps.runFn(targets);
      if (run.error && run.results.length === 0) {
        result.error = `sidecar failed: ${run.error}`;
        logger.warn('[scraper-sync] sidecar produced no results', {
          error: run.error,
          exitCode: run.exitCode,
          timedOut: run.timedOut,
        });
        this.finishCycle(result);
        return result;
      }
      if (run.timedOut) {
        logger.warn('[scraper-sync] sidecar timed out; syncing partial results', {
          partial: run.results.length,
        });
      }

      const rows: SidecarResult[] = run.results;
      result.scrapedCount = rows.length;
      result.errorRows = rows.filter((r) => r.error != null).length;

      // --- 3) POST results (send everything; backend skips error rows) ---
      const postRes = await this.deps.fetchFn<ResultsResponse>({
        method: 'POST',
        path: '/api/scrape/results',
        body: { results: rows },
      });

      if (!postRes.ok || !postRes.data) {
        const msg = postRes.error ?? `HTTP ${postRes.status}`;
        result.error = `results post failed: ${msg}`;
        logger.warn('[scraper-sync] results POST failed', {
          status: postRes.status,
          code: postRes.code,
          error: postRes.error,
          rowsSent: rows.length,
        });
        this.finishCycle(result);
        return result;
      }

      result.stored = typeof postRes.data.stored === 'number' ? postRes.data.stored : 0;
      result.skipped = typeof postRes.data.skipped === 'number' ? postRes.data.skipped : 0;
      logger.info('[scraper-sync] cycle done', {
        targets: result.targetCount,
        scraped: result.scrapedCount,
        errorRows: result.errorRows,
        stored: result.stored,
        skipped: result.skipped,
      });
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      logger.error('[scraper-sync] cycle threw', { error: result.error });
    }

    this.finishCycle(result);
    return result;
  }

  /** Update state, push to renderers, and re-arm the interval timer. */
  private finishCycle(result: ScraperCycleResult): void {
    this.state = {
      lastRunAt: new Date(this.now()).toISOString(),
      nextRunAt: null, // filled by getState() from nextRunAtMs
      lastTargetCount: result.targetCount,
      lastStored: result.stored,
      lastSkipped: result.skipped,
      lastError: result.error ?? null,
    };
    // Re-arm BEFORE emitting so getState() reports the fresh nextRunAt.
    this.armNext(this.intervalMs);
    this.emit();
  }

  private emit(): void {
    if (!this.deps.emitChange) return;
    try {
      this.deps.emitChange(this.getState());
    } catch {
      // A throwing emitter must never crash the scheduler.
    }
  }
}

// -----------------------------------------------------------------------------
// Production singleton wiring (mirrors automation/index.ts + briefing/index.ts)
// -----------------------------------------------------------------------------

let instance: ScraperScheduler | null = null;

/**
 * Production wiring. Idempotent — repeat calls return the same instance.
 *
 * HTTP   = performApiRequest (Bearer auth + refresh-on-401), lazy-required so
 *          this module stays unit-test-runnable in pure node.
 * Sidecar = runSidecar (per-OS bundled binary).
 * Push    = BrowserWindow fan-out via IpcChannel — see README for the (optional)
 *          IPC wiring if a Settings surface is added. Defaults to no-op so the
 *          scheduler works with ZERO renderer/preload changes.
 */
export function getScraperScheduler(): ScraperScheduler {
  if (instance) return instance;

  // Lazy require to avoid pulling electron/api-client into pure-node test runs.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { performApiRequest } = require('../api-client') as typeof import('../api-client');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { runSidecar } = require('./scraperSidecar') as typeof import('./scraperSidecar');

  const deps: ScraperSchedulerDeps = {
    fetchFn: performApiRequest,
    runFn: (targets) => runSidecar({ targets }),
    // emitChange intentionally omitted — no renderer surface required for v1.
    // To add one: pass `emitChange: defaultEmitChange(BrowserWindow)` (below)
    // and a matching IpcChannel.ScraperSyncChanged. See README §"Optional IPC".
  };

  instance = new ScraperScheduler(deps);
  return instance;
}

/** Tests only — replace the singleton (or reset to null). Stops the old one. */
export function setInstance(next: ScraperScheduler | null): void {
  if (instance && instance !== next) {
    instance.stop();
  }
  instance = next;
}

/**
 * Optional renderer fan-out helper, parity with
 * src/main/automation/auto-negativator.ts#defaultEmitChange. Only needed if you
 * wire a Settings/status surface (see README §"Optional IPC"). Pass the real
 * `BrowserWindow` and an `IpcChannel` string. Lazy-imports nothing — caller
 * supplies BrowserWindow so this stays test-friendly.
 */
export function defaultEmitChange(
  BrowserWindow: typeof ElectronBrowserWindow | null,
  channel: string,
): (state: ScraperSyncState) => void {
  return (state) => {
    if (!BrowserWindow) return;
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        try {
          win.webContents.send(channel, state);
        } catch {
          // ignore: window may have closed between the check and the send
        }
      }
    }
  };
}
