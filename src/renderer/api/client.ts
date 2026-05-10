import type { ApiErrorCode, ApiRequestPayload, ApiResponse } from '../../shared/ipc';

export class ApiError extends Error {
  status: number;
  /**
   * Машинно-читаемый код ошибки, проброшенный из main:
   * 'TIMEOUT' | 'NETWORK' | 'UNAUTHORIZED' | 'TIER_REQUIRED' | 'SERVER'.
   * undefined для legacy-ответов (если main не выставил код, значит просто SERVER).
   */
  code?: ApiErrorCode;
  constructor(message: string, status: number, code?: ApiErrorCode) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'ApiError';
  }
}

async function call<T>(payload: ApiRequestPayload): Promise<T> {
  const res: ApiResponse<T> = await window.api.request<T>(payload);
  if (!res.ok) {
    throw new ApiError(
      res.error || `Request failed (HTTP ${res.status})`,
      res.status,
      res.code,
    );
  }
  return res.data as T;
}

export const apiClient = {
  get<T>(path: string, query?: ApiRequestPayload['query']): Promise<T> {
    return call<T>({ method: 'GET', path, query });
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return call<T>({ method: 'POST', path, body });
  },
  put<T>(path: string, body?: unknown): Promise<T> {
    return call<T>({ method: 'PUT', path, body });
  },
  del<T>(path: string): Promise<T> {
    return call<T>({ method: 'DELETE', path });
  },
};
