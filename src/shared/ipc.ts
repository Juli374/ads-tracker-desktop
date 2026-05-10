// IPC контракт между main и renderer.
// Один источник правды для имён каналов и payload-типов.

export const IpcChannel = {
  AppGetVersion: 'app:getVersion',
  AppGetApiBaseUrl: 'app:getApiBaseUrl',
  AuthGetToken: 'auth:getToken',
  AuthSetToken: 'auth:setToken',
  AuthClearToken: 'auth:clearToken',
  ApiRequest: 'api:request',
  MediaUpload: 'media:upload',
  // Pub/sub event: main → renderer когда пришёл deeplink ads-tracker-desktop://...
  DeepLink: 'app:deepLink',
  // Открыть URL во внешнем браузере (для OAuth-флоу).
  ShellOpenExternal: 'shell:openExternal',
  // Локальный royalty store (public-release scaffold). Все каналы синхронные
  // через ipcMain.handle (read из JSON быстрый, не блокирует event-loop в renderer).
  LocalRoyaltyListUploads: 'local:royalty:listUploads',
  LocalRoyaltyListRecords: 'local:royalty:listRecords',
  LocalRoyaltyGetSummary: 'local:royalty:getSummary',
  LocalRoyaltyImport: 'local:royalty:import',
  LocalRoyaltyDelete: 'local:royalty:delete',
  LocalRoyaltyFilePath: 'local:royalty:filePath',
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

export interface ApiResponse<T = unknown> {
  status: number;
  ok: boolean;
  data: T | null;
  // Когда ok=false: текст ошибки от сервера или сетевое сообщение.
  error?: string;
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
  };
  request<T = unknown>(payload: ApiRequestPayload): Promise<ApiResponse<T>>;
  mediaUpload<T = unknown>(payload: MediaUploadPayload): Promise<MediaUploadResponse<T>>;
  // Подписка на deeplink-события. Возвращает unsubscribe.
  onDeepLink(handler: (event: DeepLinkEvent) => void): () => void;
  shell: {
    // Открыть https-URL в системном браузере (для OAuth-флоу).
    openExternal(url: string): Promise<void>;
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
}
