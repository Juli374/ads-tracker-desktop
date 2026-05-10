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
  UpdateStatus,
  AppLogPayload,
} from './shared/ipc';

const api: DesktopApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IpcChannel.AppGetVersion),
    getApiBaseUrl: () => ipcRenderer.invoke(IpcChannel.AppGetApiBaseUrl),
    getLogPath: () => ipcRenderer.invoke(IpcChannel.AppGetLogPath) as Promise<string>,
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
};

contextBridge.exposeInMainWorld('api', api);
