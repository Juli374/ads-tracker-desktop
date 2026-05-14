// IPC контракт между main и renderer.
// Один источник правды для имён каналов и payload-типов.

import type { Entitlements } from './entitlements';

export const IpcChannel = {
  AppGetVersion: 'app:getVersion',
  AppGetApiBaseUrl: 'app:getApiBaseUrl',
  // Build-time git short SHA, injected by webpack DefinePlugin (`process.env.GIT_COMMIT`).
  // Falls back to 'unknown' on shallow clones or non-git checkouts.
  AppGetGitCommit: 'app:getGitCommit',
  AuthGetToken: 'auth:getToken',
  AuthSetToken: 'auth:setToken',
  AuthClearToken: 'auth:clearToken',
  // Pub/sub event: main → renderer когда сервер вернул 401 (токен протух).
  // Renderer слушает и автоматически делает signOut + редирект на LoginScreen.
  AuthExpired: 'auth:expired',
  ApiRequest: 'api:request',
  MediaUpload: 'media:upload',
  // Pub/sub event: main → renderer когда пришёл deeplink ads-tracker-desktop://...
  DeepLink: 'app:deepLink',
  // Открыть URL во внешнем браузере (для OAuth-флоу).
  ShellOpenExternal: 'shell:openExternal',
  // OAuth state CSRF-protection: renderer генерирует state, шлёт в main, main
  // хранит в safeStorage. После deeplink-callback'а — renderer consume'ит и
  // сверяет с тем, что пришло в URL. Не совпало — отказ.
  OAuthStateWrite: 'oauth:state:write',
  OAuthStateConsume: 'oauth:state:consume',
  // Локальный royalty store (public-release scaffold). Все каналы синхронные
  // через ipcMain.handle (read из JSON быстрый, не блокирует event-loop в renderer).
  LocalRoyaltyListUploads: 'local:royalty:listUploads',
  LocalRoyaltyListRecords: 'local:royalty:listRecords',
  LocalRoyaltyGetSummary: 'local:royalty:getSummary',
  LocalRoyaltyImport: 'local:royalty:import',
  LocalRoyaltyDelete: 'local:royalty:delete',
  LocalRoyaltyFilePath: 'local:royalty:filePath',
  // Phase J.4 Lane D: parse a KDP xlsx/csv file in main and return rows for review.
  LocalRoyaltyParseFile: 'local:royalty:parseFile',
  // Phase J.4 Lane D: open native file picker (for importing xlsx/csv royalty).
  DialogOpenFile: 'dialog:openFile',
  // Auto-update (electron-updater + GitHub Releases). В dev / unpackaged build
  // апдейтер выключен и возвращает state='idle', enabled=false. В packaged build
  // main подписан на события electron-updater и эмитит UpdateChanged каждый раз,
  // когда state меняется — renderer слушает и перерисовывается без polling'а.
  UpdateGetStatus: 'update:getStatus',
  UpdateCheck: 'update:check',
  UpdateQuitAndInstall: 'update:quitAndInstall',
  // Pub/sub: main → renderer при каждом изменении state (checking → available →
  // downloading → downloaded → error). Полезная нагрузка — UpdateStatus.
  UpdateChanged: 'update:changed',
  // Phase I.2 Lane B: renderer logs flow into main's electron-log file transport.
  // Payload is scrubbed in main before write (defense in depth).
  AppLog: 'app:log',
  // Phase I.2 Lane B: reveal a file in OS file manager. Path is whitelisted
  // to logs/userData in the handler — no arbitrary fs access.
  ShellShowItemInFolder: 'shell:showItemInFolder',
  // Phase I.2 Lane B: renderer fetches the absolute log file path so the
  // Settings → Application tab can render it + reveal it.
  AppGetLogPath: 'app:getLogPath',
  // Phase J.3 Lane C: AI settings (Claude API key, model slots, brand voice).
  // Persisted in local-db (NOT Railway — personal-use only). Test channel
  // performs a real fetch to the Anthropic API in main (using the supplied
  // key, never the user's own).
  AiSettingsGet: 'ai:settings:get',
  AiSettingsSet: 'ai:settings:set',
  AiTestKey: 'ai:testKey',
  // Phase J.7 Lane G: AI Advisor streaming — renderer запускает stream, main
  // фетчит SSE и шлёт chunks обратно через AiStreamChunk push-event.
  AiStreamStart: 'ai:stream:start',
  AiStreamCancel: 'ai:stream:cancel',
  AiStreamChunk: 'ai:stream:chunk',
  // Phase L Lane A: one-shot AI generation (non-streaming). Renderer вызывает
  // `ai:generate` с {task, asin, currentText, guidance}, main собирает system
  // prompt + fetches Anthropic Messages API, возвращает text + rationale.
  // Используется Listing Studio и Command Palette "Ask AI".
  AiGenerate: 'ai:generate',
  // Phase K: tier-gating skeleton. main фетчит /api/me/entitlements,
  // кэширует в safeStorage (`entitlements.bin`), и пушит изменения в renderer.
  // Renderer слушает onChange и пересчитывает feature gates без polling'а.
  EntitlementsGet: 'entitlements:get',
  EntitlementsRefresh: 'entitlements:refresh',
  EntitlementsChanged: 'entitlements:changed',
  // Phase L.2 Lane B — Auto-Negativator. main process scheduler сканирует
  // search-term reports каждую ночь (03:00 local) и POST'ит pending
  // recommendations в /api/automation/recommendations. Renderer:
  //   - getState() — текущее состояние scanner'а (enabled, lastRunAt, lastCount)
  //   - toggle(enabled) — включить/выключить scheduler
  //   - runNow() — форсированный scan-сейчас (для UI кнопки)
  //   - getSettings() / setSettings(thresholds) — пороги для правил.
  // Pub/sub: AutoNegStateChanged каждый раз когда scanner состояние меняется,
  // чтобы UI ре-рендерился без polling'а.
  AutoNegGetState: 'auto-neg:state',
  AutoNegToggle: 'auto-neg:toggle',
  AutoNegRunNow: 'auto-neg:runNow',
  AutoNegSettingsGet: 'auto-neg:settings:get',
  AutoNegSettingsSet: 'auto-neg:settings:set',
  AutoNegStateChanged: 'auto-neg:stateChanged',
  // Phase M.5 Lane E — Weekly Author Briefing. main schedules a Sunday 9 AM
  // local-time cron; on fire it pulls last-7-days metrics, runs them through
  // Anthropic, persists to local-db, and emits a native notification.
  // Renderer reads via getLast/list and can trigger an ad-hoc run via runNow.
  BriefingGetLast: 'briefing:getLast',
  BriefingList: 'briefing:list',
  BriefingRunNow: 'briefing:runNow',
  /** main → renderer push: a new briefing landed. Renderer refreshes its view. */
  BriefingChanged: 'briefing:changed',
} as const;

export type IpcChannelValue = typeof IpcChannel[keyof typeof IpcChannel];

export interface AppInfo {
  version: string;
  platform: NodeJS.Platform;
  isPackaged: boolean;
}

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface ApiRequestPayload {
  method: ApiMethod;
  // Path относительно API base URL, например "/api/metrics/summary/by-book".
  path: string;
  query?: Record<string, string | number | boolean | string[] | undefined>;
  body?: unknown;
}

/**
 * Машинно-читаемые коды ошибок API. Используются renderer'ом для UX-веток
 * (timeout → retry-screen, tier_required → upgrade modal, etc).
 *
 * Не путать со статусом HTTP — `code` отражает категорию ошибки,
 * `status` — то, что сказал сервер (или 0 при сетевых проблемах).
 */
export type ApiErrorCode =
  | 'TIMEOUT'           // AbortSignal.timeout сработал (10s)
  | 'NETWORK'           // net.fetch упал до получения ответа
  | 'UNAUTHORIZED'      // 401 — токен протух / неверен
  | 'TIER_REQUIRED'     // 403 с reason:'tier_required' (Phase K)
  | 'SERVER';           // прочие 4xx/5xx

export interface ApiResponse<T = unknown> {
  status: number;
  ok: boolean;
  data: T | null;
  // Когда ok=false: текст ошибки от сервера или сетевое сообщение.
  error?: string;
  // Когда ok=false: машинно-читаемый код. Renderer ветвится по нему.
  code?: ApiErrorCode;
}

// === Multipart upload ===

/** A single file to send as multipart/form-data. */
export interface MediaUploadFile {
  /** FormData field name (e.g. "file", "cover"). */
  field: string;
  /** Original filename exposed to the server (e.g. "cover.jpg"). */
  name: string;
  /** Base64-encoded file content (no data-URL prefix). */
  base64: string;
  /** MIME type, e.g. "image/jpeg". */
  contentType: string;
}

export interface MediaUploadPayload {
  /** API path, must start with /api/. */
  path: string;
  files: MediaUploadFile[];
  /** Extra text fields appended to FormData. */
  formFields?: Record<string, string>;
}

export interface MediaUploadResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

// === Deeplink ===

// Полезная нагрузка событий deeplink. Renderer декодирует строкой URL.
export interface DeepLinkEvent {
  url: string;
}

// === Auth lifecycle (push events main → renderer) ===

/**
 * Событие "сессия истекла" — main эмитит при получении 401 от backend.
 * Renderer слушает в AuthContext, делает signOut + редирект на LoginScreen.
 * `reason` отражает что именно случилось (для логов/UX-варианта тоста).
 */
export interface AuthExpiredEvent {
  reason: 'token_invalid' | 'token_revoked' | 'unknown';
  // Путь, на котором сервер ответил 401 — для дебага.
  path?: string;
}

// === OAuth CSRF state ===
// Renderer генерирует random state, шлёт write → main хранит в safeStorage.
// После deeplink-callback'а — renderer вызывает consume → main возвращает
// сохранённый state и **сразу** очищает (one-shot). Renderer сравнивает с
// тем, что пришло в URL, и только при совпадении завершает OAuth.

// === Local royalty (зеркалит shape main/local-db/royalty.ts) ===
export interface LocalRoyaltyUpload {
  id: number;
  account_id: number;
  account_name?: string;
  marketplace: string;
  target_month: string;
  uploaded_at: string;
  source_filename?: string;
  total_units: number;
  total_royalty: number;
  total_revenue: number;
  currency?: string;
}

export interface LocalRoyaltyRecord {
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

export interface LocalRoyaltyMonthSummary {
  target_month: string;
  totals: { units: number; royalty: number; revenue: number };
  by_marketplace: Array<{ marketplace: string; units: number; royalty: number; revenue: number }>;
}

export interface LocalRoyaltyImportPayload {
  account_id: number;
  account_name?: string;
  marketplace: string;
  target_month: string;
  source_filename?: string;
  records: Array<{
    asin?: string;
    book_title?: string;
    units: number;
    royalty: number;
    revenue: number;
    currency?: string;
  }>;
}

export interface LocalRoyaltyParseResult {
  records: LocalRoyaltyImportPayload['records'];
  warnings: string[];
  format: 'monthly-royalty' | 'sales-dashboard' | 'unknown';
  /** Absolute path that was parsed; useful as `source_filename` fallback. */
  source_path: string;
}

// === Native dialog ===
export interface DialogOpenFileOptions {
  /** Window title shown in the picker. */
  title?: string;
  /** File-extension filters (without the leading dot). */
  filters?: Array<{ name: string; extensions: string[] }>;
}

export interface DialogOpenFileResult {
  /** Absolute path; null if the user cancelled. */
  path: string | null;
}

// === Auto-update ===
export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

/**
 * Состояние авто-апдейтера. Один shape для всех событий electron-updater:
 *   checking-for-update    → state='checking'
 *   update-available       → state='available', version
 *   update-not-available   → state='not-available'
 *   download-progress      → state='downloading', progress_percent
 *   update-downloaded      → state='downloaded', version
 *   error                  → state='error', error
 *
 * `enabled` отражает доступность системы апдейтера. В dev / non-packaged
 * билде апдейтер не инициализируется → `enabled: false`, `state: 'idle'`.
 */
export interface UpdateStatus {
  state: UpdateState;
  // Версия доступного / скачанного обновления.
  version?: string;
  // Версия текущего инсталла (`app.getVersion()`).
  current_version?: string;
  // Процент скачивания, 0–100, только при state='downloading'.
  progress_percent?: number;
  // Человекочитаемое сообщение для UI (state-specific hint, e.g. scaffold notice).
  message?: string;
  // Текст ошибки electron-updater при state='error'. Не путать с `message`.
  error?: string;
  // Включён ли апдейтер. false в dev (`!app.isPackaged`) → UI рисует disabled-state.
  enabled: boolean;
}

// === AI settings (Phase J.3 Lane C) ===

/**
 * 4 model "slots" the renderer dispatches Anthropic calls through. Each slot
 * holds a model id string (e.g. 'claude-opus-4-7'). Defaults are wired in
 * main when nothing is persisted yet.
 *
 * - completion: long-form text generation (book descriptions, ad copy).
 * - vision:    multimodal (cover analysis).
 * - fast:      lightweight calls (classification, quick checks).
 * - advisor:   AI Advisor recommendations (most expensive call).
 */
export interface AiModelSlots {
  completion: string;
  vision: string;
  fast: string;
  advisor: string;
}

/** Brand-voice profile fed into prompts to keep tone consistent. */
export interface AiBrandVoice {
  pov: string;          // "first-person" | "third-person" | free text
  toneWords: string[];  // e.g. ["confident", "warm", "playful"]
  bannedWords: string[];// hard-banned words (compliance/style)
}

export interface AiSettings {
  /** Anthropic API key (sk-ant-…). Empty string when not configured. */
  claudeKey: string;
  models: AiModelSlots;
  brandVoice: AiBrandVoice;
}

export interface AiTestKeyResult {
  ok: boolean;
  /** HTTP status from Anthropic, or 0 on network failure. */
  status: number;
  /** Error message when ok=false. */
  error?: string;
}

// === AI generation (Phase L Lane A) ===

/**
 * One-shot AI generation task taxonomy. Listing Studio drives the first five
 * (`title`/`subtitle`/`description`/`bullets`/`aPlus`); Command Palette uses
 * `ask` for the free-form "Ask AI" entry. Each task gets a distinct system
 * prompt in the main handler.
 */
export type AiGenerateTask =
  | 'title'
  | 'subtitle'
  | 'description'
  | 'bullets'
  | 'aPlus'
  | 'ask';

export interface AiGeneratePayload {
  task: AiGenerateTask;
  /** ASIN being optimised. Omit for `ask` task. */
  asin?: string;
  /** Existing text to rewrite (current title / subtitle / description / etc.). */
  currentText?: string;
  /** Author guidance, e.g. "focus on thriller readers, avoid clichés". */
  guidance?: string;
  /** Free-form prompt for `task='ask'`. Ignored otherwise. */
  prompt?: string;
  /**
   * Optional context blob for `task='ask'`: page slug, active filters, etc.
   * Surfaced into the system prompt so AI can reason about what user is viewing.
   */
  context?: Record<string, string | number | boolean | null | undefined>;
}

export interface AiGenerateResult {
  /** Final AI-generated text (joined from all text content blocks). */
  text: string;
  /**
   * Optional short explanation of why the AI made these choices. Some tasks
   * (Listing Studio) emit it as a trailing `Rationale:` line and we split.
   */
  rationale?: string;
  /** Model id that produced the result. */
  model: string;
}

// === Logging (Phase I.2 Lane B) ===
export type AppLogLevel = 'error' | 'warn' | 'info' | 'debug';

/** Payload for renderer → main log forwarding. */
export interface AppLogPayload {
  level: AppLogLevel;
  message: string;
  ctx?: Record<string, unknown>;
}


// === AI Advisor streaming ===

export interface AiStreamStartPayload {
  /** Unique stream id; renderer-controlled. */
  streamId: string;
  /** Path under /api/. Must start with /api/. */
  path: string;
  /** Request body (will be JSON.stringified). */
  body: unknown;
}

export type AiStreamChunkType = 'text_delta' | 'done' | 'error' | 'tool_use' | string;

export interface AiStreamChunk {
  streamId: string;
  /** Parsed JSON payload from the SSE `data:` line, or { type: 'error', message } on failure. */
  data: { type: AiStreamChunkType; [k: string]: unknown };
}

// === Auto-Negativator (Phase L.2 Lane B) ===

/**
 * Per-rule thresholds for the nightly scanner. Pure numbers, persisted in
 * local-db (NOT Railway — desktop-only feature, нет смысла гонять на server).
 *
 * - `minClicks`: minimum clicks for the zero-sales rule to fire.
 *   ≥ N clicks + 0 orders → recommend pause/negative.
 * - `minAcosMultiplier`: ACOS > targetACOS * mult → recommend pause/negative.
 *   Используется вместе с `minOrdersForAcos` чтобы не палить shaky terms
 *   с 1–2 orders где ACOS статистически зашумлён.
 * - `minOrdersForAcos`: minimum orders before ACOS rule activates.
 */
export interface AutoNegThresholds {
  minClicks: number;
  minAcosMultiplier: number;
  minOrdersForAcos: number;
}

export const DEFAULT_AUTO_NEG_THRESHOLDS: AutoNegThresholds = {
  minClicks: 10,
  minAcosMultiplier: 1.5,
  minOrdersForAcos: 2,
};

/**
 * Snapshot of scanner state, returned by `getState()` and pushed via
 * `AutoNegStateChanged` whenever lastRunAt / lastRecommendationCount changes.
 *
 * - `enabled`: true когда scheduler активен (юзер включил toggle).
 * - `lastRunAt`: ISO timestamp of the most recent scan (null if never run).
 * - `lastRecommendationCount`: how many pending recommendations были добавлены
 *   в последнем run'е (для KPI badge).
 * - `nextRunAt`: ISO timestamp следующего запланированного scan'а — UI
 *   показывает "Next scan in 4h 12m".
 * - `lastError`: текстовая ошибка из последнего run'а если он провалился.
 */
export interface AutoNegState {
  enabled: boolean;
  lastRunAt: string | null;
  lastRecommendationCount: number;
  nextRunAt: string | null;
  lastError: string | null;
}

/**
 * Result of a single scan() call. Возвращается из `runNow()` и используется
 * внутренне scheduler'ом для эмита state-change'ей. `errors` — список
 * текстовых ошибок (например, search-terms API упал) — НЕ блокирующих.
 */
export interface AutoNegScanResult {
  /** How many recommendations the scanner added during this run. */
  added: number;
  /** How many search-terms were inspected. */
  inspected: number;
  /** How many candidates were skipped because backend rejected POST (already exists, etc). */
  skipped: number;
  /** Non-blocking errors (e.g. search-terms API timeout). */
  errors: string[];
}

// === Weekly Briefing (Phase M.5 Lane E) ===

/**
 * Single weekly briefing record. Mirrors `WeeklyBriefingRow` from local-db
 * with all fields renderer-safe (no internal-only fields).
 *
 * - `period_from` / `period_to`: YYYY-MM-DD strings — the 7-day window the
 *   briefing summarises.
 * - `content`: AI-generated text. Markdown-flavoured (headings, bullets);
 *   the renderer applies a tiny inline transformer to render basic markdown.
 * - `error`: present when generation failed. UI surfaces it inline so the
 *   user knows to fix the AI key / retry.
 */
export interface WeeklyBriefing {
  id: number;
  generated_at: string;
  period_from: string;
  period_to: string;
  content: string;
  error?: string;
  model?: string;
}

/** Result of a `runNow()` request. `briefing` is null when generation failed. */
export interface BriefingRunResult {
  briefing: WeeklyBriefing | null;
  error?: string;
}

// API, который выставляется в renderer через contextBridge как window.api
export interface DesktopApi {
  app: {
    getInfo(): Promise<AppInfo>;
    getApiBaseUrl(): Promise<string>;
    /** Phase I.2 Lane B: absolute path to ads-tracker.log. */
    getLogPath(): Promise<string>;
    /**
     * Build-time git short SHA. Injected by webpack DefinePlugin via
     * `process.env.GIT_COMMIT`. Returns `'unknown'` on shallow clones or
     * checkouts where `git rev-parse` fails at build time.
     */
    getGitCommit(): Promise<string>;
  };
  auth: {
    getToken(): Promise<string | null>;
    setToken(token: string): Promise<void>;
    clearToken(): Promise<void>;
    /**
     * Подписка на push-event "сессия истекла" (main эмитит при получении 401
     * от backend). Возвращает unsubscribe. AuthContext делает signOut +
     * редирект на LoginScreen + показывает тост "Сессия истекла".
     */
    onExpired(handler: (event: AuthExpiredEvent) => void): () => void;
  };
  request<T = unknown>(payload: ApiRequestPayload): Promise<ApiResponse<T>>;
  mediaUpload<T = unknown>(payload: MediaUploadPayload): Promise<MediaUploadResponse<T>>;
  // Подписка на deeplink-события. Возвращает unsubscribe.
  onDeepLink(handler: (event: DeepLinkEvent) => void): () => void;
  shell: {
    // Открыть https-URL в системном браузере (для OAuth-флоу).
    openExternal(url: string): Promise<void>;
    /**
     * Phase I.2 Lane B: reveal a file in OS file manager.
     * Whitelisted to <logs>/ and <userData>/ subtrees in the main handler.
     */
    showItemInFolder(filePath: string): Promise<void>;
  };
  /**
   * OAuth CSRF state: write/consume через safeStorage в main.
   * One-shot: consume возвращает saved state и сразу его очищает.
   */
  oauth: {
    /** Сохранить random state перед запуском OAuth-флоу. */
    writeState(state: string): Promise<void>;
    /** Прочитать и очистить сохранённый state. Возвращает null, если ничего не было. */
    consumeState(): Promise<string | null>;
  };
  // Public-release scaffold: локальное хранилище royalty.
  localRoyalty: {
    listUploads(): Promise<LocalRoyaltyUpload[]>;
    listRecords(uploadId: number): Promise<LocalRoyaltyRecord[]>;
    getSummary(targetMonth: string): Promise<LocalRoyaltyMonthSummary>;
    import(payload: LocalRoyaltyImportPayload): Promise<{ upload_id: number; records_added: number }>;
    delete(uploadId: number): Promise<{ deleted: number }>;
    filePath(): Promise<string>;
    /** Read + parse a KDP report file from disk. Throws on failure. */
    parseFile(absPath: string): Promise<LocalRoyaltyParseResult>;
  };
  dialog: {
    /** Native open-file picker. Returns `{ path: null }` on cancel. */
    openFile(options?: DialogOpenFileOptions): Promise<DialogOpenFileResult>;
  };
  update: {
    getStatus(): Promise<UpdateStatus>;
    check(): Promise<UpdateStatus>;
    /**
     * Перезапустить app + установить скачанное обновление. Вызывать только
     * когда state='downloaded'. В dev / non-packaged билде — no-op.
     */
    quitAndInstall(): Promise<void>;
    /**
     * Подписка на push-обновления state. Возвращает unsubscribe.
     * Эмитится из main каждый раз, когда меняется state (через события
     * electron-updater). Renderer перерисовывает UI без polling'а.
     */
    onChange(handler: (status: UpdateStatus) => void): () => void;
  };
  /**
   * Phase I.2 Lane B: forward renderer log lines into the main file transport.
   * Payload is scrubbed of well-known token shapes in the main handler.
   */
  log: {
    error(message: string, ctx?: Record<string, unknown>): Promise<void>;
    warn(message: string, ctx?: Record<string, unknown>): Promise<void>;
    info(message: string, ctx?: Record<string, unknown>): Promise<void>;
    debug(message: string, ctx?: Record<string, unknown>): Promise<void>;
  };
  /**
   * Phase J.3 Lane C: AI settings (Claude API key + model slots + brand voice)
   * persisted in local-db. testKey performs a real Anthropic /v1/messages
   * request from main using the *supplied* key (the renderer's input — never
   * silently using a different one) and returns ok/status/error.
   */
  ai: {
    // Phase J.3 Lane C — settings + test-key.
    getSettings(): Promise<AiSettings>;
    setSettings(settings: AiSettings): Promise<void>;
    testKey(key: string, model?: string): Promise<AiTestKeyResult>;
    // Phase J.7 Lane G — AI Advisor SSE streaming.
    /** Start an SSE stream. Returns immediately; chunks arrive via onStreamChunk. */
    streamStart(payload: AiStreamStartPayload): Promise<void>;
    /** Cancel an in-flight stream. */
    streamCancel(streamId: string): Promise<void>;
    /** Subscribe to chunk events. Returns unsubscribe. */
    onStreamChunk(handler: (chunk: AiStreamChunk) => void): () => void;
    /**
     * Phase L Lane A — one-shot AI generation (Listing Studio, Command Palette).
     * Main composes a task-specific system prompt and (for Listing Studio tasks)
     * fetches book metadata, then calls Anthropic. Returns text + rationale.
     *
     * Throws if Claude key not configured. Renderer surfaces the error verbatim
     * ("Claude API key not configured — set in Settings → AI") so the user
     * knows where to fix it.
     */
    generate(payload: AiGeneratePayload): Promise<AiGenerateResult>;
  };
  /**
   * Phase K — tier-gating skeleton. Renderer получает entitlements от main:
   * initial — через `get()`, последующие изменения — через `onChange()` push.
   * `refresh()` форсит немедленный GET /api/me/entitlements (например после
   * login). Если backend ещё не выкатан /api/me/entitlements (404) — main
   * вернёт `EMPTY_ENTITLEMENTS`. Через env `ADS_TRACKER_FORCE_TIER=pro|business`
   * — main игнорит сервер и подсовывает synthetic snapshot (dev / QA).
   */
  entitlements: {
    get(): Promise<Entitlements>;
    refresh(): Promise<Entitlements>;
    onChange(handler: (entitlements: Entitlements) => void): () => void;
  };
  /**
   * Phase L.2 Lane B — Auto-Negativator. Background scanner in main process
   * that walks search-term reports every 24h (03:00 local) and POSTs pending
   * recommendations to /api/automation/recommendations.
   *
   * - `getState()` — current scanner state (enabled, lastRunAt, lastError, ...).
   * - `toggle(enabled)` — enable/disable scheduler. Toggling on schedules the
   *    next 03:00 run; toggling off cancels the timer.
   * - `runNow()` — force a scan right now (UI «Run scan now» button).
   *   Returns the scan result so the panel can show "+12 recommendations added".
   * - `getSettings()` / `setSettings(thresholds)` — persisted thresholds.
   * - `onStateChange(handler)` — push subscription. Main emits whenever the
   *    scanner state changes (after a run, after a toggle, after an error).
   */
  autoNeg: {
    getState(): Promise<AutoNegState>;
    toggle(enabled: boolean): Promise<AutoNegState>;
    runNow(): Promise<AutoNegScanResult>;
    getSettings(): Promise<AutoNegThresholds>;
    setSettings(thresholds: AutoNegThresholds): Promise<AutoNegThresholds>;
    onStateChange(handler: (state: AutoNegState) => void): () => void;
  };
  /**
   * Phase M.5 Lane E — Weekly Author Briefing. Background scheduler runs
   * every Sunday 9 AM local time, pulls last-7-days metrics, calls Anthropic
   * with a strict-format prompt, and stores the result locally. Renderer:
   *
   * - `getLast()` — most recent briefing (or null when none ever generated).
   * - `list()` — full history (bounded to BRIEFING_HISTORY_CAP records).
   * - `runNow()` — force a briefing right now (e.g. user clicked "Run new").
   *   Resolves with the new briefing or an error string.
   * - `onChange(handler)` — push subscription. Main emits whenever a new
   *   briefing lands so the dashboard card auto-refreshes.
   */
  briefing: {
    getLast(): Promise<WeeklyBriefing | null>;
    list(): Promise<WeeklyBriefing[]>;
    runNow(): Promise<BriefingRunResult>;
    onChange(handler: (briefing: WeeklyBriefing) => void): () => void;
  };
}
