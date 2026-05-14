import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { IpcChannel } from './shared/ipc';
import type {
  DesktopApi,
  ApiRequestPayload,
  ApiResponse,
  AuthExpiredEvent,
  MediaUploadPayload,
  MediaUploadResponse,
  DeepLinkEvent,
  LocalRoyaltyImportPayload,
  LocalRoyaltyParseResult,
  DialogOpenFileOptions,
  DialogOpenFileResult,
  UpdateStatus,
  AppLogPayload,
  AiSettings,
  AiTestKeyResult,
  AiStreamStartPayload,
  AiStreamChunk,
  AiGeneratePayload,
  AiGenerateResult,
  AutoNegState,
  AutoNegThresholds,
  AutoNegScanResult,
  WeeklyBriefing,
  BriefingRunResult,
} from './shared/ipc';
import type { Entitlements } from './shared/entitlements';

const api: DesktopApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IpcChannel.AppGetVersion),
    getApiBaseUrl: () => ipcRenderer.invoke(IpcChannel.AppGetApiBaseUrl),
    getLogPath: () => ipcRenderer.invoke(IpcChannel.AppGetLogPath) as Promise<string>,
    getGitCommit: () => ipcRenderer.invoke(IpcChannel.AppGetGitCommit) as Promise<string>,
  },
  auth: {
    getToken: () => ipcRenderer.invoke(IpcChannel.AuthGetToken),
    setToken: (token: string) => ipcRenderer.invoke(IpcChannel.AuthSetToken, token),
    clearToken: () => ipcRenderer.invoke(IpcChannel.AuthClearToken),
    // Push-event "сессия истекла" (main эмитит при 401 от backend).
    // AuthContext подписан на это и делает signOut + redirect на LoginScreen.
    onExpired: (handler) => {
      const wrapped = (_e: IpcRendererEvent, payload: AuthExpiredEvent) => handler(payload);
      ipcRenderer.on(IpcChannel.AuthExpired, wrapped);
      return () => ipcRenderer.off(IpcChannel.AuthExpired, wrapped);
    },
  },
  request: <T = unknown>(payload: ApiRequestPayload): Promise<ApiResponse<T>> =>
    ipcRenderer.invoke(IpcChannel.ApiRequest, payload),
  mediaUpload: <T = unknown>(payload: MediaUploadPayload): Promise<MediaUploadResponse<T>> =>
    ipcRenderer.invoke(IpcChannel.MediaUpload, payload),
  onDeepLink: (handler) => {
    const wrapped = (_e: IpcRendererEvent, payload: DeepLinkEvent) => handler(payload);
    ipcRenderer.on(IpcChannel.DeepLink, wrapped);
    return () => ipcRenderer.off(IpcChannel.DeepLink, wrapped);
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke(IpcChannel.ShellOpenExternal, url),
    showItemInFolder: (filePath: string) =>
      ipcRenderer.invoke(IpcChannel.ShellShowItemInFolder, filePath) as Promise<void>,
  },
  // OAuth CSRF state (Amazon Ads OAuth-флоу). Renderer сохраняет state перед
  // openExternal, читает (one-shot) после deeplink-callback'а.
  oauth: {
    writeState: (state: string) =>
      ipcRenderer.invoke(IpcChannel.OAuthStateWrite, state) as Promise<void>,
    consumeState: () =>
      ipcRenderer.invoke(IpcChannel.OAuthStateConsume) as Promise<string | null>,
  },
  localRoyalty: {
    listUploads: () => ipcRenderer.invoke(IpcChannel.LocalRoyaltyListUploads),
    listRecords: (uploadId: number) =>
      ipcRenderer.invoke(IpcChannel.LocalRoyaltyListRecords, uploadId),
    getSummary: (targetMonth: string) =>
      ipcRenderer.invoke(IpcChannel.LocalRoyaltyGetSummary, targetMonth),
    import: (payload: LocalRoyaltyImportPayload) =>
      ipcRenderer.invoke(IpcChannel.LocalRoyaltyImport, payload),
    delete: (uploadId: number) =>
      ipcRenderer.invoke(IpcChannel.LocalRoyaltyDelete, uploadId),
    filePath: () => ipcRenderer.invoke(IpcChannel.LocalRoyaltyFilePath) as Promise<string>,
    parseFile: (absPath: string) =>
      ipcRenderer.invoke(IpcChannel.LocalRoyaltyParseFile, absPath) as Promise<LocalRoyaltyParseResult>,
  },
  dialog: {
    openFile: (options?: DialogOpenFileOptions) =>
      ipcRenderer.invoke(IpcChannel.DialogOpenFile, options) as Promise<DialogOpenFileResult>,
  },
  update: {
    getStatus: () => ipcRenderer.invoke(IpcChannel.UpdateGetStatus) as Promise<UpdateStatus>,
    check: () => ipcRenderer.invoke(IpcChannel.UpdateCheck) as Promise<UpdateStatus>,
    quitAndInstall: () =>
      ipcRenderer.invoke(IpcChannel.UpdateQuitAndInstall) as Promise<void>,
    onChange: (handler) => {
      const wrapped = (_e: IpcRendererEvent, status: UpdateStatus) => handler(status);
      ipcRenderer.on(IpcChannel.UpdateChanged, wrapped);
      return () => ipcRenderer.off(IpcChannel.UpdateChanged, wrapped);
    },
  },
  log: {
    error: (message: string, ctx?: Record<string, unknown>) => {
      const payload: AppLogPayload = { level: 'error', message, ctx };
      return ipcRenderer.invoke(IpcChannel.AppLog, payload) as Promise<void>;
    },
    warn: (message: string, ctx?: Record<string, unknown>) => {
      const payload: AppLogPayload = { level: 'warn', message, ctx };
      return ipcRenderer.invoke(IpcChannel.AppLog, payload) as Promise<void>;
    },
    info: (message: string, ctx?: Record<string, unknown>) => {
      const payload: AppLogPayload = { level: 'info', message, ctx };
      return ipcRenderer.invoke(IpcChannel.AppLog, payload) as Promise<void>;
    },
    debug: (message: string, ctx?: Record<string, unknown>) => {
      const payload: AppLogPayload = { level: 'debug', message, ctx };
      return ipcRenderer.invoke(IpcChannel.AppLog, payload) as Promise<void>;
    },
  },
  ai: {
    // Phase J.3 Lane C — settings + test-key.
    getSettings: () =>
      ipcRenderer.invoke(IpcChannel.AiSettingsGet) as Promise<AiSettings>,
    setSettings: (settings: AiSettings) =>
      ipcRenderer.invoke(IpcChannel.AiSettingsSet, settings) as Promise<void>,
    testKey: (key: string, model?: string) =>
      ipcRenderer.invoke(IpcChannel.AiTestKey, key, model) as Promise<AiTestKeyResult>,
    // Phase J.7 Lane G — AI Advisor streaming.
    streamStart: (payload: AiStreamStartPayload) =>
      ipcRenderer.invoke(IpcChannel.AiStreamStart, payload) as Promise<void>,
    streamCancel: (streamId: string) =>
      ipcRenderer.invoke(IpcChannel.AiStreamCancel, streamId) as Promise<void>,
    onStreamChunk: (handler) => {
      const wrapped = (_e: IpcRendererEvent, chunk: AiStreamChunk) => handler(chunk);
      ipcRenderer.on(IpcChannel.AiStreamChunk, wrapped);
      return () => ipcRenderer.off(IpcChannel.AiStreamChunk, wrapped);
    },
    // Phase L Lane A — one-shot AI generation (Listing Studio, CmdK "Ask AI").
    generate: (payload: AiGeneratePayload) =>
      ipcRenderer.invoke(IpcChannel.AiGenerate, payload) as Promise<AiGenerateResult>,
  },
  // Phase K — entitlements (tier-gating skeleton). get() — sync read from
  // main's in-memory cache (заполняется на startup + login). onChange() —
  // push-event при каждом refresh из main, renderer ре-рендерит без polling'а.
  entitlements: {
    get: () =>
      ipcRenderer.invoke(IpcChannel.EntitlementsGet) as Promise<Entitlements>,
    refresh: () =>
      ipcRenderer.invoke(IpcChannel.EntitlementsRefresh) as Promise<Entitlements>,
    onChange: (handler) => {
      const wrapped = (_e: IpcRendererEvent, e: Entitlements) => handler(e);
      ipcRenderer.on(IpcChannel.EntitlementsChanged, wrapped);
      return () => ipcRenderer.off(IpcChannel.EntitlementsChanged, wrapped);
    },
  },
  // Phase L.2 Lane B — Auto-Negativator. Renderer вызывает getState() на mount
  // AutomationPage и подписывается на push'и через onStateChange — UI обновляется
  // когда главный процесс заканчивает scan().
  autoNeg: {
    getState: () =>
      ipcRenderer.invoke(IpcChannel.AutoNegGetState) as Promise<AutoNegState>,
    toggle: (enabled: boolean) =>
      ipcRenderer.invoke(IpcChannel.AutoNegToggle, enabled) as Promise<AutoNegState>,
    runNow: () =>
      ipcRenderer.invoke(IpcChannel.AutoNegRunNow) as Promise<AutoNegScanResult>,
    getSettings: () =>
      ipcRenderer.invoke(IpcChannel.AutoNegSettingsGet) as Promise<AutoNegThresholds>,
    setSettings: (thresholds: AutoNegThresholds) =>
      ipcRenderer.invoke(IpcChannel.AutoNegSettingsSet, thresholds) as Promise<AutoNegThresholds>,
    onStateChange: (handler) => {
      const wrapped = (_e: IpcRendererEvent, state: AutoNegState) => handler(state);
      ipcRenderer.on(IpcChannel.AutoNegStateChanged, wrapped);
      return () => ipcRenderer.off(IpcChannel.AutoNegStateChanged, wrapped);
    },
  },
  // Phase M.5 Lane E — Weekly Author Briefing. main schedules a Sunday 9 AM
  // local-time cron; renderer reads the latest briefing for the dashboard
  // card + full history for the dedicated page. Run-now forces an immediate
  // AI call (Pro-tier-gated in the UI; main accepts the call regardless and
  // surfaces "key not configured" if the AI key is missing).
  briefing: {
    getLast: () =>
      ipcRenderer.invoke(IpcChannel.BriefingGetLast) as Promise<WeeklyBriefing | null>,
    list: () =>
      ipcRenderer.invoke(IpcChannel.BriefingList) as Promise<WeeklyBriefing[]>,
    runNow: () =>
      ipcRenderer.invoke(IpcChannel.BriefingRunNow) as Promise<BriefingRunResult>,
    onChange: (handler) => {
      const wrapped = (_e: IpcRendererEvent, briefing: WeeklyBriefing) => handler(briefing);
      ipcRenderer.on(IpcChannel.BriefingChanged, wrapped);
      return () => ipcRenderer.off(IpcChannel.BriefingChanged, wrapped);
    },
  },
};

contextBridge.exposeInMainWorld('api', api);
