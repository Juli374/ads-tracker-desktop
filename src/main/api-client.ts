import { net } from 'electron';
import { ApiRequestPayload, ApiResponse } from '../shared/ipc';
import { readToken } from './auth-store';

const DEFAULT_API_BASE_URL = 'https://ads-tracker-production.up.railway.app';

function apiBaseUrl(): string {
  return (process.env.ADS_TRACKER_API_URL?.trim() || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
}

function buildUrl(path: string, query?: ApiRequestPayload['query']): string {
  const normalised = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(apiBaseUrl() + normalised);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, String(item));
      } else {
        url.searchParams.append(key, String(value));
      }
    }
  }
  return url.toString();
}

export async function performApiRequest<T = unknown>(
  payload: ApiRequestPayload,
): Promise<ApiResponse<T>> {
  const url = buildUrl(payload.path, payload.query);
  const headers: Record<string, string> = { Accept: 'application/json' };

  const token = await readToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let body: string | undefined;
  if (payload.body !== undefined && payload.method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(payload.body);
  }

  try {
    const response = await net.fetch(url, {
      method: payload.method,
      headers,
      body,
    });
    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (response.ok) {
      return { status: response.status, ok: true, data: parsed as T };
    }
    const errMessage =
      typeof parsed === 'object' && parsed !== null && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : typeof parsed === 'string'
        ? parsed
        : `HTTP ${response.status}`;
    return { status: response.status, ok: false, data: null, error: errMessage };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 0, ok: false, data: null, error: message };
  }
}
