// Локальное хранилище для данных, которые НЕ должны уходить на Railway:
// в первую очередь royalty (Amazon TOS запрещает третьим лицам хранить
// чужие royalty). Сейчас — JSON-файл в app.getPath('userData'); архитектура
// такая, что свопнуть на better-sqlite3 (или sql.js) — это поменять реализацию
// `LocalStore`, не трогая ни IPC, ни renderer.
//
// Важные инварианты:
// - Все мутации идут через atomic write (write-temp → rename), чтобы краш в
//   середине записи не оставлял повреждённый файл.
// - Чтение обёрнуто в try/catch с дефолтом — если файл повреждён, подставляем
//   пустой стейт и логируем (не падаем).
// - Schema-versioned: top-level поле `version` для будущих миграций.
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { AutoNegThresholds, DEFAULT_AUTO_NEG_THRESHOLDS } from '../../shared/ipc';

// Schema v3 adds `auto_negativator` row (Phase L.2 Lane B). Migration from v2
// is forward-only and additive — old uploads/ai_settings/etc остаются on disk.
// Schema v4 adds `weekly_briefings` table (Phase M.5 Lane E) — array of past
// AI-generated weekly briefing records. Forward-only: existing v3 installs
// migrate to an empty briefings list on first read.
export const SCHEMA_VERSION = 4;

// Phase J.3 Lane C — AI settings (Claude API key, model slots, brand voice).
// Stored locally because the personal-use first track does not push secrets to
// Railway. The renderer reads the raw plaintext through an explicit IPC
// (`ai:settings:get`); we never auto-inject the key into HTML or window state.
export interface AiSettingsRow {
  claudeKey: string;
  models: {
    completion: string;
    vision: string;
    fast: string;
    advisor: string;
  };
  brandVoice: {
    pov: string;
    toneWords: string[];
    bannedWords: string[];
    /**
     * Phase M.2 — Per-series overrides. Map of series_name → partial override.
     * Sparse: missing series → use base profile as-is. Merge semantics live
     * in `src/main/ai/brandVoice.ts`.
     */
    seriesOverrides?: Record<string, {
      pov?: string;
      toneWords?: string[];
      bannedWords?: string[];
    }>;
  };
}

export const DEFAULT_AI_SETTINGS: AiSettingsRow = {
  claudeKey: '',
  models: {
    completion: 'claude-opus-4-7',
    vision: 'claude-opus-4-7',
    fast: 'claude-haiku-4-5',
    advisor: 'claude-opus-4-7',
  },
  brandVoice: {
    pov: '',
    toneWords: [],
    bannedWords: [],
  },
};

export interface RoyaltyUploadRow {
  id: number;
  account_id: number;
  account_name?: string;
  marketplace: string;
  target_month: string; // YYYY-MM
  uploaded_at: string;  // ISO
  source_filename?: string;
  total_units: number;
  total_royalty: number;
  total_revenue: number;
  currency?: string;
}

export interface RoyaltyRecordRow {
  id: number;
  upload_id: number;
  asin?: string;
  book_title?: string;
  marketplace: string;
  target_month: string;
  units: number;
  royalty: number;
  revenue: number;
  currency?: string;
}

/**
 * Phase L.2 Lane B — Auto-Negativator persisted state. Stored locally because
 * scheduler runs in main process and needs to survive app restarts (so toggle
 * + thresholds are sticky across boots). `lastRunAt` / `lastRecommendationCount`
 * are diagnostics for the panel ("Last scan: 03:00 — 12 recommendations added").
 */
export interface AutoNegRow {
  enabled: boolean;
  thresholds: AutoNegThresholds;
  lastRunAt: string | null;
  lastRecommendationCount: number;
  lastError: string | null;
}

export const DEFAULT_AUTO_NEG: AutoNegRow = {
  enabled: false,
  thresholds: DEFAULT_AUTO_NEG_THRESHOLDS,
  lastRunAt: null,
  lastRecommendationCount: 0,
  lastError: null,
};

/**
 * Phase M.5 Lane E — single record of an AI-generated weekly briefing. Stored
 * locally because the briefing content itself can mention royalty / KDP-only
 * numbers that we do not want to push to Railway (TOS-aligned: same reason
 * `royalty_*` lives here). The renderer fetches the latest one for the dashboard
 * card and the full list for the briefing page.
 *
 * - `id` is monotonically increasing (`next_briefing_id`).
 * - `period_from` / `period_to` are ISO date strings (YYYY-MM-DD) — the window
 *   the briefing summarises. Stored as strings (not Date) so JSON round-trips
 *   cleanly.
 * - `content` is the raw AI output text (markdown-flavoured plain text). May
 *   include `# Heading` / `- bullets`; the renderer can render it as
 *   monospace-friendly markdown via a tiny inline transformer.
 * - `error` is set when generation failed (no AI key, network failure, etc).
 *   In that case `content` will be empty, and the UI shows the error instead.
 */
export interface WeeklyBriefingRow {
  id: number;
  generated_at: string;
  period_from: string;
  period_to: string;
  content: string;
  /** Set only when generation failed; UI shows it inline. */
  error?: string;
  /** Model id that produced the briefing (for diagnostics / future caching). */
  model?: string;
}

export interface LocalDbState {
  version: number;
  royalty_uploads: RoyaltyUploadRow[];
  royalty_records: RoyaltyRecordRow[];
  // counter'ы для autoincrement-ID
  next_upload_id: number;
  next_record_id: number;
  // Phase J.3 Lane C — AI settings (single row).
  ai_settings: AiSettingsRow;
  // Phase L.2 Lane B — Auto-Negativator persisted state (single row).
  auto_negativator: AutoNegRow;
  // Phase M.5 Lane E — weekly briefings (array of past records). Bounded by
  // BRIEFING_HISTORY_CAP to keep the JSON file from growing unbounded.
  weekly_briefings: WeeklyBriefingRow[];
  next_briefing_id: number;
  // Phase N — Telemetry consent. Defaults to false (opt-in). Persisted so the
  // user doesn't see the consent prompt on every boot.
  telemetry_consent?: boolean;
}

/**
 * Phase M.5 Lane E — soft cap on how many briefings we keep on disk. ~6 months
 * worth at weekly cadence; older entries get evicted FIFO when a new briefing
 * lands. The renderer never paginates this list (full list is small), so the
 * cap is more about disk hygiene than UI performance.
 */
export const BRIEFING_HISTORY_CAP = 26;

const EMPTY_STATE: LocalDbState = {
  version: SCHEMA_VERSION,
  royalty_uploads: [],
  royalty_records: [],
  next_upload_id: 1,
  next_record_id: 1,
  ai_settings: DEFAULT_AI_SETTINGS,
  auto_negativator: DEFAULT_AUTO_NEG,
  weekly_briefings: [],
  next_briefing_id: 1,
};

/**
 * Phase M.2 — defensively coerce on-disk seriesOverrides. Drops rows that
 * aren't plain objects; preserves any object with at least one valid field.
 * Returns `undefined` when there's nothing usable so callers can stay sparse.
 */
function sanitiseSeriesOverrides(
  raw: unknown,
): AiSettingsRow['brandVoice']['seriesOverrides'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: NonNullable<AiSettingsRow['brandVoice']['seriesOverrides']> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key !== 'string' || key.length === 0) continue;
    if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
    const v = val as Record<string, unknown>;
    const override: { pov?: string; toneWords?: string[]; bannedWords?: string[] } = {};
    if (typeof v.pov === 'string') override.pov = v.pov;
    if (Array.isArray(v.toneWords)) {
      override.toneWords = v.toneWords.filter((w): w is string => typeof w === 'string');
    }
    if (Array.isArray(v.bannedWords)) {
      override.bannedWords = v.bannedWords.filter((w): w is string => typeof w === 'string');
    }
    if (override.pov !== undefined || override.toneWords || override.bannedWords) {
      out[key] = override;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function dbFilePath(): string {
  // app.getPath('userData') обычно ~/Library/Application Support/Ads Tracker.
  // Для тестов / случаев когда app не доступен — fallback на os.tmpdir().
  let base: string;
  try {
    base = app.getPath('userData');
  } catch {
    base = path.join(os.tmpdir(), 'ads-tracker-desktop');
  }
  return path.join(base, 'local-db.json');
}

function readState(): LocalDbState {
  const file = dbFilePath();
  if (!fs.existsSync(file)) return { ...EMPTY_STATE };
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as Partial<LocalDbState>;
    // Sanity-check + миграция дефолтами. v1 → v2 added ai_settings:
    // fall back to DEFAULT_AI_SETTINGS, keep royalty rows unchanged.
    const ai = parsed.ai_settings;
    const aiSettings: AiSettingsRow =
      ai && typeof ai === 'object'
        ? {
            claudeKey: typeof ai.claudeKey === 'string' ? ai.claudeKey : '',
            models: {
              completion:
                typeof ai.models?.completion === 'string'
                  ? ai.models.completion
                  : DEFAULT_AI_SETTINGS.models.completion,
              vision:
                typeof ai.models?.vision === 'string'
                  ? ai.models.vision
                  : DEFAULT_AI_SETTINGS.models.vision,
              fast:
                typeof ai.models?.fast === 'string'
                  ? ai.models.fast
                  : DEFAULT_AI_SETTINGS.models.fast,
              advisor:
                typeof ai.models?.advisor === 'string'
                  ? ai.models.advisor
                  : DEFAULT_AI_SETTINGS.models.advisor,
            },
            brandVoice: {
              pov: typeof ai.brandVoice?.pov === 'string' ? ai.brandVoice.pov : '',
              toneWords: Array.isArray(ai.brandVoice?.toneWords)
                ? ai.brandVoice.toneWords.filter((w): w is string => typeof w === 'string')
                : [],
              bannedWords: Array.isArray(ai.brandVoice?.bannedWords)
                ? ai.brandVoice.bannedWords.filter((w): w is string => typeof w === 'string')
                : [],
              // Phase M.2 — seriesOverrides forward-compat: filter rows that
              // aren't plain objects, coerce field types defensively. Missing
              // on disk → leave undefined (cheaper than empty object every read).
              seriesOverrides: sanitiseSeriesOverrides(ai.brandVoice?.seriesOverrides),
            },
          }
        : { ...DEFAULT_AI_SETTINGS };
    // v2 → v3: auto_negativator. Existing installations don't have this row,
    // so we substitute DEFAULT_AUTO_NEG with sanity-checks on each field type.
    const autoNegRaw = (parsed as { auto_negativator?: unknown }).auto_negativator;
    let autoNegSettings: AutoNegRow = { ...DEFAULT_AUTO_NEG };
    if (autoNegRaw && typeof autoNegRaw === 'object') {
      const an = autoNegRaw as Partial<AutoNegRow>;
      const t = an.thresholds && typeof an.thresholds === 'object' ? an.thresholds : null;
      autoNegSettings = {
        enabled: typeof an.enabled === 'boolean' ? an.enabled : DEFAULT_AUTO_NEG.enabled,
        thresholds: {
          minClicks:
            typeof t?.minClicks === 'number' && Number.isFinite(t.minClicks) && t.minClicks > 0
              ? t.minClicks
              : DEFAULT_AUTO_NEG.thresholds.minClicks,
          minAcosMultiplier:
            typeof t?.minAcosMultiplier === 'number' &&
            Number.isFinite(t.minAcosMultiplier) &&
            t.minAcosMultiplier > 0
              ? t.minAcosMultiplier
              : DEFAULT_AUTO_NEG.thresholds.minAcosMultiplier,
          minOrdersForAcos:
            typeof t?.minOrdersForAcos === 'number' &&
            Number.isFinite(t.minOrdersForAcos) &&
            t.minOrdersForAcos >= 0
              ? t.minOrdersForAcos
              : DEFAULT_AUTO_NEG.thresholds.minOrdersForAcos,
        },
        lastRunAt: typeof an.lastRunAt === 'string' ? an.lastRunAt : null,
        lastRecommendationCount:
          typeof an.lastRecommendationCount === 'number' && Number.isFinite(an.lastRecommendationCount)
            ? an.lastRecommendationCount
            : 0,
        lastError: typeof an.lastError === 'string' ? an.lastError : null,
      };
    }
    // v3 → v4: weekly_briefings. Filter to well-shaped records on read so a
    // corrupted entry can't crash the renderer. `next_briefing_id` defaults
    // to (max-id + 1) when missing — handles installs that v4-migrated but
    // never wrote the counter.
    const briefingsRaw = (parsed as { weekly_briefings?: unknown }).weekly_briefings;
    let weeklyBriefings: WeeklyBriefingRow[] = [];
    if (Array.isArray(briefingsRaw)) {
      for (const row of briefingsRaw) {
        if (!row || typeof row !== 'object') continue;
        const r = row as Partial<WeeklyBriefingRow>;
        if (
          typeof r.id !== 'number' ||
          typeof r.generated_at !== 'string' ||
          typeof r.period_from !== 'string' ||
          typeof r.period_to !== 'string' ||
          typeof r.content !== 'string'
        ) {
          continue;
        }
        weeklyBriefings.push({
          id: r.id,
          generated_at: r.generated_at,
          period_from: r.period_from,
          period_to: r.period_to,
          content: r.content,
          error: typeof r.error === 'string' ? r.error : undefined,
          model: typeof r.model === 'string' ? r.model : undefined,
        });
      }
      // Apply cap defensively — if the file was hand-edited beyond cap,
      // keep the most recent N.
      if (weeklyBriefings.length > BRIEFING_HISTORY_CAP) {
        weeklyBriefings = weeklyBriefings
          .slice()
          .sort((a, b) => a.generated_at.localeCompare(b.generated_at))
          .slice(weeklyBriefings.length - BRIEFING_HISTORY_CAP);
      }
    }
    const rawNextBriefingId = (parsed as { next_briefing_id?: unknown }).next_briefing_id;
    const nextBriefingId =
      typeof rawNextBriefingId === 'number' && Number.isFinite(rawNextBriefingId) && rawNextBriefingId > 0
        ? rawNextBriefingId
        : weeklyBriefings.length > 0
          ? Math.max(...weeklyBriefings.map((b) => b.id)) + 1
          : 1;

    return {
      version: parsed.version ?? SCHEMA_VERSION,
      royalty_uploads: Array.isArray(parsed.royalty_uploads) ? parsed.royalty_uploads : [],
      royalty_records: Array.isArray(parsed.royalty_records) ? parsed.royalty_records : [],
      next_upload_id: parsed.next_upload_id ?? 1,
      next_record_id: parsed.next_record_id ?? 1,
      ai_settings: aiSettings,
      auto_negativator: autoNegSettings,
      weekly_briefings: weeklyBriefings,
      next_briefing_id: nextBriefingId,
      // Phase N — telemetry consent. Default false → opt-in.
      telemetry_consent: typeof parsed.telemetry_consent === 'boolean' ? parsed.telemetry_consent : false,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[local-db] corrupted file, using empty state:', err);
    return { ...EMPTY_STATE };
  }
}

function writeState(state: LocalDbState): void {
  const file = dbFilePath();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp`;
  // Crash-safe запись: write → fsync → close → rename. Без fsync rename
  // может пройти раньше реального flush, и при power-loss остаётся .tmp с
  // нулевыми байтами (security-finding #7).
  const buf = Buffer.from(JSON.stringify(state, null, 2), 'utf8');
  const fd = fs.openSync(tmp, 'w', 0o600);
  try {
    fs.writeSync(fd, buf, 0, buf.length, 0);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

// Простой fluent-store. Транзакция = mutate + write один раз.
export const localStore = {
  read(): LocalDbState {
    return readState();
  },

  mutate(update: (state: LocalDbState) => void): LocalDbState {
    const state = readState();
    update(state);
    writeState(state);
    return state;
  },

  reset(): void {
    writeState({ ...EMPTY_STATE });
  },

  filePath(): string {
    return dbFilePath();
  },
};
