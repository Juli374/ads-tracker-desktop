// Phase M.5 Lane E — Weekly Author Briefing scheduler + composer.
//
// Architecture
// ---------------------------------------------------------------------------
// The WeeklyBriefer class lives in main and is responsible for three things:
//
//   1. Scheduling. Cron-style fire on Sunday 9 AM local time. We use
//      `setTimeout` recursively (re-schedule from inside the firing callback)
//      rather than `setInterval`, because we want the *clock-aligned* drift
//      to stay tight even after the app sleeps/wakes for a few hours (laptop
//      lid closed → reopen on Sunday afternoon → fire immediately because the
//      next-run timestamp is already in the past).
//
//   2. Composing the digest. Pulls last-7-days of:
//        - GET /api/metrics/summary/by-book        — per-book totals
//        - GET /api/metrics/summary/top-performers — winners/losers
//        - GET /api/alerts                         — outstanding alerts
//      …then flattens them into a single JSON-ish blob that we hand to the
//      LLM. We keep the prompt deterministic (sorted, bounded counts) so
//      Anthropic's prompt caching can amortise the system text across runs.
//
//   3. Generating + persisting. Calls the injected `aiGenerateFn`, stores the
//      result in local-db via `appendBriefing`, then notifies (native
//      Electron Notification + push event to all renderers).
//
// Testability
// ---------------------------------------------------------------------------
// All side-effects are injected: fetchFn (HTTP), aiGenerateFn (Anthropic),
// nowFn (clock), notifyFn (native Notification), emitChange (BrowserWindow
// push), appendBriefing/getBriefings (local-db). Tests stub them. The
// scheduler is opt-in via `start({ autoStart: false })`-equivalent — we don't
// auto-schedule on construct.
//
// Email integration
// ---------------------------------------------------------------------------
// PLACEHOLDER. The briefing content is composed and notified locally. To wire
// real email delivery (SendGrid / Resend / etc) plug the call into
// `notifyFn`: extend the Deps with an optional `emailFn(briefing)` and call
// it from `runWeeklyBrief` after the Notification fires. Design doc:
// `docs/electron-migration/email-integration.md`.

import type { WeeklyBriefingRow } from '../local-db';
import type {
  ApiRequestPayload,
  ApiResponse,
  WeeklyBriefing,
  BriefingRunResult,
} from '../../shared/ipc';

/** Minimal shape we read from `/api/metrics/summary/by-book`. */
export interface BriefBookRow {
  book_id: number;
  title: string;
  marketplace?: string | null;
  cost?: number;
  sales?: number;
  orders?: number;
  acos?: number;
  royalty?: number;
  profit?: number;
}

/** Top-performers shape. Mirrors what /api/metrics/summary/top-performers returns. */
export interface BriefTopMover {
  id: number;
  title?: string;
  name?: string;
  profit?: number;
  spend?: number;
  sales?: number;
  acos?: number;
}

/**
 * Alert row. The real /api/alerts response has many fields; we only care about
 * the human-readable bits for the digest.
 */
export interface BriefAlert {
  id?: number;
  severity?: string;
  message?: string;
  title?: string;
  type?: string;
}

/**
 * What the AI sees. Stable shape so prompt caching can kick in across runs;
 * the only thing changing week-to-week is the numbers.
 */
export interface BriefingDigest {
  period_from: string;
  period_to: string;
  totals: {
    spend: number;
    sales: number;
    orders: number;
    royalty: number;
    profit: number;
  };
  top_books: BriefBookRow[];
  bottom_books: BriefBookRow[];
  top_movers: { winners: BriefTopMover[]; losers: BriefTopMover[] };
  alerts: BriefAlert[];
}

/**
 * Tone-of-voice fed into the system prompt. Brand voice from
 * `local-db.ai_settings.brandVoice` plugs in here; if M.2 wired a richer
 * profile, swap this shape there too — for M.5 we accept a minimal subset.
 */
export interface BriefingBrandVoice {
  pov?: string;
  toneWords?: string[];
  bannedWords?: string[];
}

/** AI invocation closure. Receives the composed user-turn text + system prompt. */
export type BriefingAiGenerateFn = (opts: {
  system: string;
  user: string;
  cacheSystem: boolean;
}) => Promise<{ text: string; model?: string }>;

/** Native notification closure. Tests pass a stub; production wires Electron Notification. */
export type BriefingNotifyFn = (briefing: WeeklyBriefing) => void;

/** Append the row to local-db and return the stored snapshot (with assigned id). */
export type BriefingAppendFn = (
  row: Omit<WeeklyBriefingRow, 'id'>,
) => WeeklyBriefingRow;

/** Read history; sorted newest-first. */
export type BriefingListFn = () => WeeklyBriefingRow[];

/** Read the brand voice slice (optional — fine to return undefined). */
export type BriefingBrandVoiceFn = () => BriefingBrandVoice | undefined;

export interface BrieferDeps {
  fetchFn: <T = unknown>(payload: ApiRequestPayload) => Promise<ApiResponse<T>>;
  aiGenerateFn: BriefingAiGenerateFn;
  nowFn?: () => number;
  notifyFn?: BriefingNotifyFn;
  /** Push state change event to renderers (defaults to no-op in tests). */
  emitChange?: (briefing: WeeklyBriefing) => void;
  appendBriefing: BriefingAppendFn;
  listBriefings: BriefingListFn;
  readBrandVoice?: BriefingBrandVoiceFn;
}

/**
 * Compute next-fire timestamp. Schedule policy: Sunday at 09:00 local time.
 * Implementation detail: we use the local-date math (getDay/getHours), so the
 * Briefer respects the user's timezone — a UTC user gets it at 09:00 UTC, an
 * America/Los_Angeles user at 09:00 PT, etc. No DST guard needed because
 * `Date#setHours` accepts the daylight-saving offset automatically.
 */
export function nextBriefingTimestamp(now: number): number {
  const d = new Date(now);
  const dayOfWeek = d.getDay(); // 0 = Sunday
  // Build a candidate at TODAY 09:00 local.
  const candidate = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    9, // 9 AM local
    0,
    0,
    0,
  );
  // If today is Sunday and we're still before 9 AM → fire today.
  if (dayOfWeek === 0 && candidate.getTime() > now) {
    return candidate.getTime();
  }
  // Otherwise advance to the next Sunday at 9 AM.
  const daysUntilSunday = (7 - dayOfWeek) % 7 || 7;
  candidate.setDate(candidate.getDate() + daysUntilSunday);
  return candidate.getTime();
}

/** Format a Date as YYYY-MM-DD using local time. */
function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Coerce a possibly-string number from backend into a finite number, default 0. */
function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/**
 * Compose the "data blob" we feed to Anthropic. Keeps the shape stable
 * (sorted, bounded) so prompt caching has a chance.
 */
export function composeDigest(
  byBook: BriefBookRow[],
  top: { winners: BriefTopMover[]; losers: BriefTopMover[] },
  alerts: BriefAlert[],
  periodFrom: string,
  periodTo: string,
): BriefingDigest {
  const totals = byBook.reduce(
    (acc, b) => {
      acc.spend += num(b.cost);
      acc.sales += num(b.sales);
      acc.orders += num(b.orders);
      acc.royalty += num(b.royalty);
      acc.profit += num(b.profit);
      return acc;
    },
    { spend: 0, sales: 0, orders: 0, royalty: 0, profit: 0 },
  );

  // Top books = highest profit. Bottom books = lowest profit. Cap each list
  // at 5 entries so the prompt stays bounded.
  const ranked = byBook
    .slice()
    .map((b) => ({ ...b, profit: num(b.profit), spend: num(b.cost), orders: num(b.orders) }));
  ranked.sort((a, b) => num(b.profit) - num(a.profit));
  const top_books = ranked.slice(0, 5);
  const bottom_books = ranked
    .slice()
    .sort((a, b) => num(a.profit) - num(b.profit))
    .slice(0, 5);

  return {
    period_from: periodFrom,
    period_to: periodTo,
    totals,
    top_books,
    bottom_books,
    top_movers: {
      winners: (top.winners ?? []).slice(0, 5),
      losers: (top.losers ?? []).slice(0, 5),
    },
    alerts: (alerts ?? []).slice(0, 10),
  };
}

/**
 * Compose the system prompt. Static across runs (so it can be prompt-cached
 * by Anthropic). Brand voice plugs in optionally.
 */
export function buildBriefingSystemPrompt(brandVoice?: BriefingBrandVoice): string {
  const voiceParts: string[] = [];
  if (brandVoice?.pov) voiceParts.push(`POV: ${brandVoice.pov}`);
  if (brandVoice?.toneWords && brandVoice.toneWords.length > 0) {
    voiceParts.push(`Tone: ${brandVoice.toneWords.slice(0, 6).join(', ')}`);
  }
  if (brandVoice?.bannedWords && brandVoice.bannedWords.length > 0) {
    voiceParts.push(`Avoid: ${brandVoice.bannedWords.slice(0, 12).join(', ')}`);
  }
  const voiceLine = voiceParts.length > 0 ? `\nBrand voice — ${voiceParts.join(' | ')}` : '';

  return (
    'You are a KDP author assistant. Write a 250-word weekly briefing based on the provided digest. ' +
    'Structure your reply with EXACTLY these three sections, in this order:\n' +
    '\n' +
    '1. Top movers — books or campaigns that performed best this week.\n' +
    '2. Underperforming campaigns/keywords — what is bleeding spend and why.\n' +
    '3. Suggested actions (max 5) — concrete next steps the author should take.\n' +
    '\n' +
    'Use plain text with section headings (e.g. "Top movers:" on its own line). ' +
    'Bullet items with "- ". Be specific about numbers (e.g. spend, ACOS, orders). ' +
    'Stay under 280 words total. Never invent metrics — only reference what is in the digest. ' +
    'If the digest is empty (no books / no alerts), say so plainly and suggest connecting an Amazon Ads account.' +
    voiceLine
  );
}

/**
 * Compose the user-turn message. The digest goes in as JSON so the model can
 * grep it deterministically.
 */
export function buildBriefingUserMessage(digest: BriefingDigest): string {
  return [
    `Period: ${digest.period_from} → ${digest.period_to}`,
    '',
    'Digest (JSON):',
    JSON.stringify(digest, null, 2),
  ].join('\n');
}

/**
 * Singleton-style scheduler. Construct once with deps; call `start()` after
 * boot. `stop()` clears the timer (lifecycle / tests).
 */
export class WeeklyBriefer {
  private deps: BrieferDeps;
  private timer: NodeJS.Timeout | null = null;
  private nextRunAtMs: number | null = null;
  private inFlight: Promise<BriefingRunResult> | null = null;

  constructor(deps: BrieferDeps) {
    this.deps = deps;
  }

  private now(): number {
    return this.deps.nowFn ? this.deps.nowFn() : Date.now();
  }

  /** ISO timestamp for the next scheduled run. Renderer shows it as "Next: Sunday 9 AM". */
  getNextRunAt(): string | null {
    return this.nextRunAtMs ? new Date(this.nextRunAtMs).toISOString() : null;
  }

  /** Snapshot of the latest stored briefing (or null when none ever ran). */
  getLastBriefing(): WeeklyBriefing | null {
    const all = this.deps.listBriefings();
    if (all.length === 0) return null;
    const sorted = all.slice().sort((a, b) => b.generated_at.localeCompare(a.generated_at));
    return rowToBriefing(sorted[0]);
  }

  /** Full history (newest-first). */
  list(): WeeklyBriefing[] {
    return this.deps.listBriefings()
      .slice()
      .sort((a, b) => b.generated_at.localeCompare(a.generated_at))
      .map(rowToBriefing);
  }

  /** Boot-time start: schedules the next Sunday-9-AM run. Idempotent. */
  start(): void {
    this.scheduleNext();
  }

  /** Lifecycle / test cleanup. */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.nextRunAtMs = null;
  }

  /**
   * Force a briefing right now. De-duped against concurrent calls so the user
   * can mash the "Run now" button without spawning N parallel Anthropic calls.
   */
  async runNow(): Promise<BriefingRunResult> {
    if (this.inFlight) {
      return this.inFlight;
    }
    this.inFlight = this.runOnce().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /**
   * The actual run. Pulls metrics → composes digest → calls AI → persists.
   * Errors are caught and stored as a record with `error` set so the renderer
   * surfaces them (instead of vanishing into the void).
   */
  private async runOnce(): Promise<BriefingRunResult> {
    const nowMs = this.now();
    const now = new Date(nowMs);
    const periodTo = fmtDate(now);
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    const periodFrom = fmtDate(from);

    try {
      // --- Pull metrics in parallel ---
      const baseQuery = {
        date_from: periodFrom,
        date_to: periodTo,
        attribution: '7d',
      };
      const [byBookRes, topRes, alertsRes] = await Promise.all([
        this.deps.fetchFn<{ books?: BriefBookRow[] }>({
          method: 'GET',
          path: '/api/metrics/summary/by-book',
          query: baseQuery,
        }),
        this.deps.fetchFn<{
          books?: { winners?: BriefTopMover[]; losers?: BriefTopMover[] };
          campaigns?: { winners?: BriefTopMover[]; losers?: BriefTopMover[] };
        }>({
          method: 'GET',
          path: '/api/metrics/summary/top-performers',
          query: { ...baseQuery, limit: 5 },
        }),
        this.deps.fetchFn<{ alerts?: BriefAlert[] }>({
          method: 'GET',
          path: '/api/alerts',
          query: baseQuery,
        }),
      ]);

      const byBook = (byBookRes.ok && byBookRes.data?.books) ? byBookRes.data.books : [];
      const top = topRes.ok && topRes.data
        ? {
            winners: topRes.data.books?.winners ?? topRes.data.campaigns?.winners ?? [],
            losers: topRes.data.books?.losers ?? topRes.data.campaigns?.losers ?? [],
          }
        : { winners: [], losers: [] };
      const alerts = (alertsRes.ok && alertsRes.data?.alerts) ? alertsRes.data.alerts : [];

      const digest = composeDigest(byBook, top, alerts, periodFrom, periodTo);

      // --- Compose prompt + call AI ---
      const brandVoice = this.deps.readBrandVoice?.();
      const system = buildBriefingSystemPrompt(brandVoice);
      const user = buildBriefingUserMessage(digest);

      const aiResult = await this.deps.aiGenerateFn({
        system,
        user,
        cacheSystem: true,
      });

      // --- Persist + notify ---
      const row = this.deps.appendBriefing({
        generated_at: new Date(nowMs).toISOString(),
        period_from: periodFrom,
        period_to: periodTo,
        content: aiResult.text,
        model: aiResult.model,
      });
      const briefing = rowToBriefing(row);
      this.dispatch(briefing);
      this.scheduleNext();
      return { briefing };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Persist the failure too so the renderer can show "last attempt failed".
      const row = this.deps.appendBriefing({
        generated_at: new Date(nowMs).toISOString(),
        period_from: periodFrom,
        period_to: periodTo,
        content: '',
        error: message,
      });
      const briefing = rowToBriefing(row);
      this.dispatch(briefing);
      this.scheduleNext();
      return { briefing, error: message };
    }
  }

  /** Push to renderers + fire native notification. */
  private dispatch(briefing: WeeklyBriefing): void {
    if (this.deps.emitChange) {
      try {
        this.deps.emitChange(briefing);
      } catch {
        // ignore — emitter throwing must not crash the briefer
      }
    }
    if (this.deps.notifyFn && !briefing.error) {
      try {
        this.deps.notifyFn(briefing);
      } catch {
        // ignore — notification system unreliable on some Linux DEs
      }
    }
  }

  private scheduleNext(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const next = nextBriefingTimestamp(this.now());
    this.nextRunAtMs = next;
    // Node's setTimeout clamps at ~24.8 days (2^31-1 ms). Sunday-9-AM is
    // always < 7 days away, so this is comfortably within range.
    const delay = Math.max(1000, next - this.now());
    this.timer = setTimeout(() => {
      void this.runNow().catch(() => {
        // ignore — runOnce already records errors in storage
      });
    }, delay);
  }
}

/** Strip the local-db `WeeklyBriefingRow` to the renderer-safe `WeeklyBriefing`. */
function rowToBriefing(row: WeeklyBriefingRow): WeeklyBriefing {
  return {
    id: row.id,
    generated_at: row.generated_at,
    period_from: row.period_from,
    period_to: row.period_to,
    content: row.content,
    error: row.error,
    model: row.model,
  };
}
