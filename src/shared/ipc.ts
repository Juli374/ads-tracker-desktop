// IPC контракт между main и renderer.
// Один источник правды для имён каналов и payload-типов.

export const IpcChannel = {
  AppGetVersion: 'app:getVersion',
  AppGetApiBaseUrl: 'app:getApiBaseUrl',
  AuthGetToken: 'auth:getToken',
  AuthSetToken: 'auth:setToken',
  AuthClearToken: 'auth:clearToken',
  ApiRequest: 'api:request',
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
}
