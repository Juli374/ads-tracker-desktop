import { net } from 'electron';
import { ApiRequestPayload, ApiResponse } from '../shared/ipc';
import { readToken } from './auth-store';

const DEFAULT_API_BASE_URL = 'https://ads-tracker-production.up.railway.app';

function apiBaseUrl(): string {
  return (process.env.ADS_TRACKER_API_URL?.trim() || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
}

// Защита от path-injection: renderer не должен мочь обратиться к произвольным
// хостам. Все наши endpoint'ы — под /api/. Path не содержит scheme/host.
function validatePath(path: string): string {
  if (typeof path !== 'string' || path.length === 0) {
    throw new Error('api:request: path must be a non-empty string');
  }
  // Защита от authority-override через protocol-relative или backslash-схем.
  if (path.includes('://') || path.includes('\\') || path.includes('@')) {
    throw new Error('api:request: path must not contain "://", "\\", or "@"');
  }
  // Все наши endpoint'ы под /api/. Нормализуем leading slash.
  const normalised = path.startsWith('/') ? path : `/${path}`;
  if (!normalised.startsWith('/api/')) {
    throw new Error('api:request: path must start with /api/');
  }
  return normalised;
}

function buildUrl(path: string, query?: ApiRequestPayload['query']): string {
  const normalised = validatePath(path);
  const url = new URL(apiBaseUrl() + normalised);
  // Защита от smuggling host через `path = '//evil.com/x'` (после нормализации
  // путь начинается с `/api/`, но проверяем пост-фактум host тоже).
  const expectedHost = new URL(apiBaseUrl()).host;
  if (url.host !== expectedHost) {
    throw new Error(
      `api:request: host mismatch (got ${url.host}, expected ${expectedHost})`,
    );
  }
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
