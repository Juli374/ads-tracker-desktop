// IPC контракт между main и renderer.
// Один источник правды для имён каналов и payload-типов.

export const IpcChannel = {
  AppGetVersion: 'app:getVersion',
  AppGetApiBaseUrl: 'app:getApiBaseUrl',
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
  // Auto-update placeholder: renderer запрашивает статус, main отдаёт 'idle' до подключения electron-updater.
  UpdateGetStatus: 'update:getStatus',
  UpdateCheck: 'update:check',
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

// === Auto-update ===
export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateStatus {
  state: UpdateState;
  version?: string;       // версия доступного обновления, если есть
  current_version?: string;
  progress_percent?: number;
  message?: string;
  // Включится ли реальная проверка. Сейчас всегда false до подключения electron-updater.
  enabled: boolean;
}


// API, который выставляется в renderer через contextBridge как window.api
export interface DesktopApi {
  app: {
    getInfo(): Promise<AppInfo>;
    getApiBaseUrl(): Promise<string>;
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
  };
  update: {
    getStatus(): Promise<UpdateStatus>;
    check(): Promise<UpdateStatus>;
  };
}
