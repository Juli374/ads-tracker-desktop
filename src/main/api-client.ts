import { BrowserWindow, net } from 'electron';
import {
  ApiErrorCode,
  ApiRequestPayload,
  ApiResponse,
  AuthExpiredEvent,
  IpcChannel,
} from '../shared/ipc';
import { clearToken, readToken } from './auth-store';

const DEFAULT_API_BASE_URL = 'https://ads-tracker-production.up.railway.app';

// Все backend-запросы из main делаются через AbortSignal.timeout(REQUEST_TIMEOUT_MS).
// 10 секунд — компромисс между «реально медленный сервер на Railway free-tier
// просыпается ~5–7s» и «юзер не должен видеть бесконечный спиннер на офлайне».
const REQUEST_TIMEOUT_MS = 10_000;

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

/**
 * Эмитит push-event `auth:expired` во все открытые окна.
 * Renderer (AuthContext) подписан и делает signOut + redirect.
 *
 * Защита от спама: эмитим только если есть активные окна. Внутри renderer'а
 * AuthContext дополнительно дебаунсит — но первый эмит всегда срабатывает,
 * иначе юзер останется на authenticated-странице с протухшим токеном.
 */
function emitAuthExpired(payload: AuthExpiredEvent): void {
  const windows = BrowserWindow.getAllWindows();
  for (const w of windows) {
    if (!w.isDestroyed()) {
      try {
        w.webContents.send(IpcChannel.AuthExpired, payload);
      } catch {
        // ignore: окно могло быть закрыто между isDestroyed() и send()
      }
    }
  }
}

/**
 * Маппит HTTP-статус в машинно-читаемый код ошибки.
 * 0 → NETWORK (net.fetch упал до получения статуса).
 * AbortError ловится отдельно в performApiRequest и возвращает TIMEOUT.
 */
function statusToErrorCode(status: number): ApiErrorCode {
  if (status === 0) return 'NETWORK';
  if (status === 401) return 'UNAUTHORIZED';
  return 'SERVER';
}

/**
 * Распознаём AbortError по DOMException (Electron / web fetch) и по Node-style
 * `err.name === 'AbortError'`. AbortSignal.timeout() в Node 20+ кидает
 * `DOMException: signal timed out` с name='TimeoutError'.
 */
function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === 'AbortError') return true;
  if (err.name === 'TimeoutError') return true;
  // Fallback: некоторые runtime'ы не выставляют name корректно.
  const msg = err.message?.toLowerCase() ?? '';
  return msg.includes('timed out') || msg.includes('aborted');
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
      // Пользователь не должен ждать дольше REQUEST_TIMEOUT_MS на любом
      // запросе. Если backend на Railway просыпается дольше — увидит TIMEOUT
      // и сможет повторить вручную.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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

    // === 401 interceptor ===
    // Сервер сказал "токен невалиден" — чистим локальный токен в auth-store
    // и пушим event'ом в renderer, чтобы AuthContext редиректнул на Login.
    // Делаем это ДО возврата error-envelope: renderer всё равно увидит
    // ошибку запроса, но дополнительно получит push-event и переключит UI.
    if (response.status === 401) {
      try {
        await clearToken();
      } catch {
        // ignore: даже если файл не удалился, всё равно эмитим — UI
        // отправит юзера на LoginScreen, а следующий setToken перезапишет.
      }
      emitAuthExpired({ reason: 'token_invalid', path: payload.path });
    }

    const errMessage =
      typeof parsed === 'object' && parsed !== null && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : typeof parsed === 'string'
        ? parsed
        : `HTTP ${response.status}`;
    return {
      status: response.status,
      ok: false,
      data: null,
      error: errMessage,
      code: statusToErrorCode(response.status),
    };
  } catch (err) {
    // Таймаут от AbortSignal.timeout — отдельная категория для UX
    // (LoginScreen рисует retry-screen, обычные страницы — error toast).
    if (isTimeoutError(err)) {
      return {
        status: 0,
        ok: false,
        data: null,
        error: `Request timed out after ${REQUEST_TIMEOUT_MS}ms`,
        code: 'TIMEOUT',
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { status: 0, ok: false, data: null, error: message, code: 'NETWORK' };
  }
}
