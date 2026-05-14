// Phase L.2 Lane B — Auto-Negativator nightly scanner.
//
// Архитектура.
// ---------------------------------------------------------------------------
// Scheduler крутится в main процессе. Каждый «ночной» запуск (03:00 local time
// в timezone юзера) делает следующее:
//   1. GET /api/search-terms?attribution=14d — собирает 2-недельные данные.
//   2. Применяет 3 правила:
//      (a) Zero-sale rule: clicks ≥ minClicks И orders == 0 → recommend pause.
//      (b) High-ACOS rule: orders ≥ minOrdersForAcos И ACOS > target × mult →
//          recommend negative.
//      (c) High-spend zero-conversion: spend > target_spend × 1.0 И orders == 0
//          (защита от случая когда clicks < minClicks но spend огромный из-за
//          дорогих кликов на ASIN-targets).
//   3. Для каждой подходящей строки POST /api/automation/recommendations
//      с типизированным payload'ом. Если backend вернёт 404 / 501 — сохраним
//      в `local-db.pending_recommendations` (TODO в будущей итерации; пока
//      просто помечаем как skipped и логируем).
//   4. Обновляем `auto_negativator` row в local-db (lastRunAt, count, error).
//   5. Эмитим `AutoNegStateChanged` push-событие во все окна.
//
// Тестируемость.
// ---------------------------------------------------------------------------
// Чтобы scan() можно было тестировать без electron-а, класс принимает factory
// для HTTP-клиента (`fetchFn`) и часов (`nowFn`). В production wiring передаём
// performApiRequest и Date.now; в тестах — vi.fn(). Конструктор НЕ запускает
// таймер автоматически — `start()` нужно вызвать явно (для боев) или передать
// `{autoStart: false}` (в тестах). Sticky pattern из entitlements.ts.

import type { BrowserWindow as ElectronBrowserWindow } from 'electron';
import {
  AutoNegScanResult,
  AutoNegState,
  AutoNegThresholds,
  ApiRequestPayload,
  ApiResponse,
  IpcChannel,
} from '../../shared/ipc';

/** Shape of a single search-term row we pull from /api/search-terms. */
export interface ScanSearchTerm {
  id: number;
  searchTerm: string;
  campaignId?: string;
  campaignName?: string;
  localCampaignId?: number;
  bookId?: number | null;
  bookTitle?: string | null;
  marketplace?: string;
  matchType?: string;
  termType?: 'keyword' | 'asin' | string;
  impressions: number;
  clicks: number;
  cost: number;
  sales: number;
  orders: number;
  acos: number;
  // Optional «target ACOS» from backend — если backend не отдаёт, fall back на
  // hard-coded 30% (см. TARGET_ACOS_FALLBACK ниже).
  targetAcos?: number;
}

/**
 * Recommendation payload, POST'имый в /api/automation/recommendations. Shape
 * совпадает с тем, что AutomationPage ожидает увидеть в response (см.
 * src/renderer/api/automation.ts → Recommendation interface). Backend
 * принимает snake_case; renderer трансформирует обратно в camelCase.
 */
export interface AutoNegRecommendationDraft {
  type: 'negative_keyword';
  rule_code: 'auto-neg-zero-sale' | 'auto-neg-high-acos' | 'auto-neg-high-spend-no-orders';
  subject_id: number;
  campaign_id?: number;
  search_term: string;
  match_type: 'Exact' | 'Phrase' | 'Broad';
  reason: string;
  confidence: number; // 0..1
  suggested_action: 'add_negative' | 'pause';
  metrics_snapshot: {
    impressions: number;
    clicks: number;
    spend: number;
    sales: number;
    orders: number;
    acos: number;
  };
  marketplace?: string;
}

/**
 * Inject-points for the scanner. Defaults используют main-process helpers
 * (performApiRequest, BrowserWindow), но тесты передают stubs.
 */
export interface AutoNegDeps {
  /** Async HTTP call. Defaults to performApiRequest in production. */
  fetchFn: <T = unknown>(payload: ApiRequestPayload) => Promise<ApiResponse<T>>;
  /** Read state from local-db. */
  readState: () => {
    enabled: boolean;
    thresholds: AutoNegThresholds;
    lastRunAt: string | null;
    lastRecommendationCount: number;
    lastError: string | null;
  };
  /** Mutate local-db state with a partial update. */
  writeState: (partial: {
    enabled?: boolean;
    thresholds?: AutoNegThresholds;
    lastRunAt?: string | null;
    lastRecommendationCount?: number;
    lastError?: string | null;
  }) => void;
  /** Clock. Tests can freeze. */
  nowFn?: () => number;
  /** Push state-change events. Defaults to BrowserWindow.getAllWindows(). */
  emitChange?: (state: AutoNegState) => void;
}

/** Hard fallback when backend doesn't ship a `targetAcos` field. */
const TARGET_ACOS_FALLBACK = 30;

/**
 * Minimum spend (in marketplace currency, dollars) that triggers the high-spend
 * rule even when clicks < minClicks. Hard-coded for now — could be a threshold
 * later, but in practice >$5 with zero orders is always a problem.
 */
const HIGH_SPEND_FLOOR = 5;

/**
 * Compute the next 03:00 local time after `now`. If `now` is itself before
 * 03:00 → same-day 03:00; otherwise next-day. Pure function; tests cover.
 */
export function nextRunTimestamp(now: number): number {
  const d = new Date(now);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 3, 0, 0, 0);
  if (target.getTime() <= now) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime();
}

/**
 * Apply rules to a single search-term row. Returns drafts to POST (or empty if
 * the row passes all checks). Pure function; the bulk of the test coverage
 * lives here.
 */
export function evaluateSearchTerm(
  term: ScanSearchTerm,
  thresholds: AutoNegThresholds,
): AutoNegRecommendationDraft[] {
  const drafts: AutoNegRecommendationDraft[] = [];

  // Type-coerce some legacy backend fields (response can sometimes return
  // string-encoded numbers).
  const clicks = Number(term.clicks) || 0;
  const orders = Number(term.orders) || 0;
  const spend = Number(term.cost) || 0;
  const sales = Number(term.sales) || 0;
  const acos = Number(term.acos) || 0;
  const impressions = Number(term.impressions) || 0;
  const targetAcos = term.targetAcos && term.targetAcos > 0 ? term.targetAcos : TARGET_ACOS_FALLBACK;

  // Если у нас нет campaign id или search-term — backend не сможет создать
  // negative, skip.
  if (!term.searchTerm || term.searchTerm.length === 0) return drafts;

  const baseMetrics = {
    impressions,
    clicks,
    spend,
    sales,
    orders,
    acos,
  };

  // Match type: term-type 'asin' → Exact (ASIN), keyword → Exact. Broad
  // negatives слишком агрессивны для авто-режима, скипаем.
  const matchType: AutoNegRecommendationDraft['match_type'] =
    term.termType === 'asin' ? 'Exact' : 'Exact';

  const campaignIdNum =
    typeof term.localCampaignId === 'number'
      ? term.localCampaignId
      : undefined;

  // === Rule (a): Zero-sale ===
  if (clicks >= thresholds.minClicks && orders === 0) {
    drafts.push({
      type: 'negative_keyword',
      rule_code: 'auto-neg-zero-sale',
      subject_id: term.id,
      campaign_id: campaignIdNum,
      search_term: term.searchTerm,
      match_type: matchType,
      reason: `${clicks} clicks, 0 orders — wasted spend $${spend.toFixed(2)}`,
      confidence: 0.85,
      suggested_action: 'add_negative',
      metrics_snapshot: baseMetrics,
      marketplace: term.marketplace,
    });
    // Don't double-flag the same row with two rules; zero-sale wins.
    return drafts;
  }

  // === Rule (c): high-spend zero-conversion (fires even when clicks low) ===
  // Этот case покрывает дорогие ASIN-targets с парой кликов и zero orders, где
  // правило (a) пропустит из-за minClicks, но потерь много.
  if (spend >= HIGH_SPEND_FLOOR && orders === 0 && clicks > 0) {
    drafts.push({
      type: 'negative_keyword',
      rule_code: 'auto-neg-high-spend-no-orders',
      subject_id: term.id,
      campaign_id: campaignIdNum,
      search_term: term.searchTerm,
      match_type: matchType,
      reason: `$${spend.toFixed(2)} spent with 0 orders (${clicks} clicks)`,
      confidence: 0.75,
      suggested_action: 'add_negative',
      metrics_snapshot: baseMetrics,
      marketplace: term.marketplace,
    });
    return drafts;
  }

  // === Rule (b): ACOS bleed ===
  // Орудуем только когда orders ≥ minOrdersForAcos — иначе ACOS статистически
  // зашумлён и false-positive risk высокий.
  if (orders >= thresholds.minOrdersForAcos && acos > targetAcos * thresholds.minAcosMultiplier) {
    drafts.push({
      type: 'negative_keyword',
      rule_code: 'auto-neg-high-acos',
      subject_id: term.id,
      campaign_id: campaignIdNum,
      search_term: term.searchTerm,
      match_type: matchType,
      reason: `ACOS ${acos.toFixed(0)}% > target ${targetAcos.toFixed(0)}% × ${thresholds.minAcosMultiplier} (${orders} orders, $${spend.toFixed(2)} spend)`,
      confidence: 0.7,
      suggested_action: 'add_negative',
      metrics_snapshot: baseMetrics,
      marketplace: term.marketplace,
    });
  }

  return drafts;
}

/**
 * Auto-Negativator scanner. Singleton in main process — create once, call
 * start() after entitlement check passes.
 */
export class AutoNegativator {
  private deps: AutoNegDeps;
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<AutoNegScanResult> | null = null;
  private nextRunAtMs: number | null = null;

  constructor(deps: AutoNegDeps) {
    this.deps = deps;
  }

  private now(): number {
    return this.deps.nowFn ? this.deps.nowFn() : Date.now();
  }

  /** Snapshot of state for IPC handlers. */
  getState(): AutoNegState {
    const s = this.deps.readState();
    return {
      enabled: s.enabled,
      lastRunAt: s.lastRunAt,
      lastRecommendationCount: s.lastRecommendationCount,
      nextRunAt: this.nextRunAtMs ? new Date(this.nextRunAtMs).toISOString() : null,
      lastError: s.lastError,
    };
  }

  /** Update thresholds (persisted via writeState). */
  setThresholds(thresholds: AutoNegThresholds): AutoNegThresholds {
    const validated: AutoNegThresholds = {
      minClicks: clampPositive(thresholds.minClicks, 1, 1000, 10),
      minAcosMultiplier: clampPositive(thresholds.minAcosMultiplier, 1.0, 10, 1.5),
      minOrdersForAcos: clampPositive(thresholds.minOrdersForAcos, 0, 100, 2),
    };
    this.deps.writeState({ thresholds: validated });
    this.emitState();
    return validated;
  }

  getThresholds(): AutoNegThresholds {
    return this.deps.readState().thresholds;
  }

  /**
   * Enable/disable scheduler. On enable → schedule next 03:00 run. On disable
   * → clear the timer. Persist enabled flag through writeState.
   */
  toggle(enabled: boolean): AutoNegState {
    this.deps.writeState({ enabled });
    if (enabled) {
      this.scheduleNext();
    } else {
      this.clearTimer();
    }
    this.emitState();
    return this.getState();
  }

  /**
   * Boot-time start. Reads persisted `enabled` flag — only schedules if true.
   * Safe to call when enabled=false (no-op).
   */
  start(): void {
    const state = this.deps.readState();
    if (state.enabled) {
      this.scheduleNext();
    }
  }

  /** Stop scheduler and abort any pending timer (lifecycle / tests). */
  stop(): void {
    this.clearTimer();
  }

  /**
   * Force a scan immediately. Returns the scan result. Safe to call даже
   * когда scheduler не активен (но respects in-flight protection).
   */
  async runNow(): Promise<AutoNegScanResult> {
    if (this.inFlight) {
      return this.inFlight;
    }
    this.inFlight = this.scan().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /** The actual scan logic. */
  private async scan(): Promise<AutoNegScanResult> {
    const result: AutoNegScanResult = {
      added: 0,
      inspected: 0,
      skipped: 0,
      errors: [],
    };

    // 14-day window. Date math is local — backend treats date_from/date_to as
    // calendar dates.
    const now = new Date(this.now());
    const fmt = (d: Date): string => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const dateTo = fmt(now);
    const from = new Date(now);
    from.setDate(from.getDate() - 14);
    const dateFrom = fmt(from);

    try {
      const res = await this.deps.fetchFn<{ items: ScanSearchTerm[] }>({
        method: 'GET',
        path: '/api/search-terms',
        query: {
          date_from: dateFrom,
          date_to: dateTo,
          per_page: 500,
          sort_by: 'cost',
          sort_order: 'desc',
        },
      });

      if (!res.ok || !res.data || typeof res.data !== 'object') {
        const errMsg = res.error ?? `HTTP ${res.status}`;
        result.errors.push(`search-terms fetch failed: ${errMsg}`);
        this.deps.writeState({
          lastRunAt: new Date(this.now()).toISOString(),
          lastError: errMsg,
        });
        this.emitState();
        this.scheduleNext();
        return result;
      }

      const items = Array.isArray(res.data.items) ? res.data.items : [];
      result.inspected = items.length;

      const thresholds = this.deps.readState().thresholds;
      const drafts: AutoNegRecommendationDraft[] = [];
      for (const term of items) {
        for (const draft of evaluateSearchTerm(term, thresholds)) {
          drafts.push(draft);
        }
      }

      // POST each draft. If the backend endpoint doesn't exist (404/501),
      // count it as skipped — desktop scaffold can later persist locally.
      for (const draft of drafts) {
        try {
          const postRes = await this.deps.fetchFn<{ id: number }>({
            method: 'POST',
            path: '/api/automation/recommendations',
            body: draft,
          });
          if (postRes.ok) {
            result.added += 1;
          } else if (postRes.status === 404 || postRes.status === 501) {
            // Backend endpoint not deployed yet — quietly skip; the recommendation
            // is well-formed, would be persisted if backend supported POST.
            result.skipped += 1;
          } else if (postRes.status === 409) {
            // Duplicate / already exists — backend de-duped; skip silently.
            result.skipped += 1;
          } else {
            result.skipped += 1;
            result.errors.push(
              `POST recommendation for "${draft.search_term}" failed: HTTP ${postRes.status} ${postRes.error ?? ''}`.trim(),
            );
          }
        } catch (err) {
          result.skipped += 1;
          result.errors.push(
            `POST recommendation threw: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      this.deps.writeState({
        lastRunAt: new Date(this.now()).toISOString(),
        lastRecommendationCount: result.added,
        lastError: result.errors.length > 0 ? result.errors[0] : null,
      });
      this.emitState();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(message);
      this.deps.writeState({
        lastRunAt: new Date(this.now()).toISOString(),
        lastError: message,
      });
      this.emitState();
    } finally {
      this.scheduleNext();
    }

    return result;
  }

  private scheduleNext(): void {
    this.clearTimer();
    const state = this.deps.readState();
    if (!state.enabled) {
      this.nextRunAtMs = null;
      return;
    }
    const nextMs = nextRunTimestamp(this.now());
    this.nextRunAtMs = nextMs;
    const delay = Math.max(1000, nextMs - this.now());
    // setTimeout on >24d clamps in Node. Our delay is ≤24h, so safe.
    this.timer = setTimeout(() => {
      void this.runNow().catch(() => {
        // ignore — scan() already records errors in state.
      });
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private emitState(): void {
    const state = this.getState();
    if (this.deps.emitChange) {
      try {
        this.deps.emitChange(state);
      } catch {
        // ignore: emitter throwing shouldn't crash the scanner
      }
    }
  }
}

function clampPositive(
  value: number,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Default emit-change helper that fans out to all renderer windows. Lazy-imported
 * `electron` so the module remains test-runnable in pure node.
 */
export function defaultEmitChange(
  BrowserWindow: typeof ElectronBrowserWindow | null,
): (state: AutoNegState) => void {
  return (state) => {
    if (!BrowserWindow) return;
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        try {
          win.webContents.send(IpcChannel.AutoNegStateChanged, state);
        } catch {
          // ignore: окно могло быть закрыто между isDestroyed и send
        }
      }
    }
  };
}
