import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import {
  IpcChannel,
  DesktopApi,
  ApiRequestPayload,
  ApiResponse,
  DeepLinkEvent,
  LocalRoyaltyImportPayload,
  UpdateStatus,
} from './shared/ipc';

const api: DesktopApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IpcChannel.AppGetVersion),
    getApiBaseUrl: () => ipcRenderer.invoke(IpcChannel.AppGetApiBaseUrl),
  },
  auth: {
    getToken: () => ipcRenderer.invoke(IpcChannel.AuthGetToken),
    setToken: (token: string) => ipcRenderer.invoke(IpcChannel.AuthSetToken, token),
    clearToken: () => ipcRenderer.invoke(IpcChannel.AuthClearToken),
  },
  request: <T = unknown>(payload: ApiRequestPayload): Promise<ApiResponse<T>> =>
    ipcRenderer.invoke(IpcChannel.ApiRequest, payload),
  onDeepLink: (handler) => {
    const wrapped = (_e: IpcRendererEvent, payload: DeepLinkEvent) => handler(payload);
    ipcRenderer.on(IpcChannel.DeepLink, wrapped);
    return () => ipcRenderer.off(IpcChannel.DeepLink, wrapped);
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke(IpcChannel.ShellOpenExternal, url),
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
  },
};

contextBridge.exposeInMainWorld('api', api);
