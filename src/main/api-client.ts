import { BrowserWindow, net } from 'electron';
import {
  ApiErrorCode,
  ApiRequestPayload,
  ApiResponse,
  AuthAuthenticatedEvent,
  AuthChangePasswordResult,
  AuthExpiredEvent,
  AuthLoginResult,
  AuthSetup2faResult,
  AuthSignupResult,
  AuthUserProfile,
  AuthVerify2faResult,
  IpcChannel,
} from '../shared/ipc';
import {
  clearToken,
  getTokens,
  readToken,
  rotateTokens,
  setTokens,
} from './auth-store';

const DEFAULT_API_BASE_URL = 'https://ads-tracker-production.up.railway.app';

// Все backend-запросы из main делаются через AbortSignal.timeout(REQUEST_TIMEOUT_MS).
// 10 секунд — компромисс между «реально медленный сервер на Railway free-tier
// просыпается ~5–7s» и «юзер не должен видеть бесконечный спиннер на офлайне».
const REQUEST_TIMEOUT_MS = 10_000;
// Phase R.7 — auth endpoints get the same timeout. We intentionally don't
// stretch this for login: a slow login is a worse UX than a fast retry button.
const AUTH_TIMEOUT_MS = 10_000;

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
 * Phase R.7 — push event when main has just stored a fresh token pair.
 * Renderer's AuthContext listens and flips to authenticated without polling.
 */
function emitAuthAuthenticated(payload: AuthAuthenticatedEvent): void {
  const windows = BrowserWindow.getAllWindows();
  for (const w of windows) {
    if (!w.isDestroyed()) {
      try {
        w.webContents.send(IpcChannel.AuthAuthenticated, payload);
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
 * Phase K: лениво триггерит refresh entitlements'а, когда сервер сообщает,
 * что фича закрыта (HTTP 403 + body `{reason:'tier_required',...}`).
 * Не дожидаемся, не пропускаем основной error envelope — это side-effect, не
 * blocker. Renderer уже получит TIER_REQUIRED код и сможет открыть UpgradeModal,
 * а свежие entitlements придут push-ом через EntitlementsChanged event.
 *
 * Lazy-require: чтобы избежать circular import entitlements.ts ↔ api-client.ts
 * (entitlements уже импортит performApiRequest сверху).
 */
function triggerEntitlementsRefresh(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ent = require('./entitlements') as typeof import('./entitlements');
    void ent.refresh().catch(() => {
      // ignore: refresh уже логирует свои ошибки
    });
  } catch {
    // ignore: модуль может быть не загружен в тестах
  }
}

/**
 * Распознать tier_required-ответ: 403 + body содержит `reason:'tier_required'`.
 * Тело может прийти как parsed object (когда server вернул JSON) или строкой
 * (когда вернул plain text). Только object-shape — настоящий tier-block.
 */
function isTierRequiredBody(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== 'object') return false;
  const obj = parsed as { reason?: unknown };
  return obj.reason === 'tier_required';
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

// =============================================================================
// Phase R.7 — refresh-token interceptor
// =============================================================================
//
// On 401, we try `POST /api/auth/refresh` with the stored refresh token. On
// success the new pair is stored and the caller retries the original request
// exactly once. On failure (no refresh token in store, refresh endpoint also
// 401s, or any transport error) we clear auth and emit auth:expired so the
// renderer routes back to LoginScreen.
//
// Concurrency: many requests can 401 simultaneously after a token expires.
// We collapse them onto a single in-flight refresh promise to avoid hammering
// /api/auth/refresh and to keep both halves of the pair consistent.

let inflightRefresh: Promise<boolean> | null = null;

/**
 * Hit the backend refresh endpoint. Returns true iff fresh tokens are now in
 * safeStorage. Caller is responsible for retrying the original request.
 *
 * Legacy single-token installs (no refresh token in store) short-circuit to
 * `false` — for those users we can't do silent refresh; renderer will redirect
 * to LoginScreen and they'll log in again.
 */
async function attemptRefresh(): Promise<boolean> {
  if (inflightRefresh) return inflightRefresh;

  inflightRefresh = (async () => {
    const tokens = await getTokens();
    if (!tokens.refreshToken) {
      // Legacy install or never logged in. No-op success/failure:
      // returning false makes the caller fall through to emit auth:expired.
      return false;
    }
    try {
      const res = await net.fetch(apiBaseUrl() + '/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refresh_token: tokens.refreshToken }),
        signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
      });
      if (!res.ok) {
        // Refresh token was rejected — server-side revoked or expired.
        // Caller will clear + emit auth:expired.
        return false;
      }
      const parsed = (await res.json().catch(() => null)) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      } | null;
      if (!parsed || typeof parsed.access_token !== 'string') {
        return false;
      }
      await rotateTokens(
        parsed.access_token,
        typeof parsed.expires_in === 'number' && Number.isFinite(parsed.expires_in)
          ? parsed.expires_in
          : 3600,
        typeof parsed.refresh_token === 'string' ? parsed.refresh_token : undefined,
      );
      return true;
    } catch {
      // Network / timeout — give up and let the 401 propagate.
      return false;
    } finally {
      // Always release the lock so the next 401 can try again later.
      inflightRefresh = null;
    }
  })();

  return inflightRefresh;
}

/**
 * Internal request executor. Used by both `performApiRequest` (with the 401
 * interceptor) and the auth helpers (which set `skipRefresh=true` so we don't
 * recurse into refresh during refresh).
 */
async function doFetch<T = unknown>(
  payload: ApiRequestPayload,
  opts: { skipRefresh?: boolean } = {},
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

    // === 401 interceptor with refresh-on-401 (Phase R.7) ===
    // Try to silently refresh the access token using the stored refresh token
    // and retry the original request exactly once. On failure (no refresh
    // token, refresh endpoint rejected, transport error) — clear + emit
    // auth:expired so renderer routes back to LoginScreen.
    if (response.status === 401 && !opts.skipRefresh) {
      const refreshed = await attemptRefresh();
      if (refreshed) {
        return doFetch<T>(payload, { skipRefresh: true });
      }
      try {
        await clearToken();
      } catch {
        // ignore
      }
      emitAuthExpired({ reason: 'token_invalid', path: payload.path });
    } else if (response.status === 401) {
      // Already inside a retry — don't loop. Just clean up and emit.
      try {
        await clearToken();
      } catch {
        // ignore
      }
      emitAuthExpired({ reason: 'token_invalid', path: payload.path });
    }

    // === 403 tier_required interceptor (Phase K) ===
    // Сервер закрыл фичу: `{reason:'tier_required',feature:'ai.advisor_panel'}`.
    // Триггерим non-blocking refresh entitlements (renderer мог иметь stale-cached),
    // и возвращаем typed code='TIER_REQUIRED'. Renderer ловит код по ApiError'у
    // и открывает UpgradeModal.
    const isTierRequired =
      response.status === 403 && isTierRequiredBody(parsed);
    if (isTierRequired) {
      triggerEntitlementsRefresh();
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
      code: isTierRequired ? 'TIER_REQUIRED' : statusToErrorCode(response.status),
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

export async function performApiRequest<T = unknown>(
  payload: ApiRequestPayload,
): Promise<ApiResponse<T>> {
  return doFetch<T>(payload, {});
}

// =============================================================================
// Phase R.7 — auth helpers
// =============================================================================
//
// These are thin wrappers around the backend `/api/auth/*` endpoints. They
// live in main so secrets (refresh token, partial token from 2FA flow) never
// cross the IPC boundary as renderer-readable strings — except the partial
// token which the renderer needs to send back with the TOTP code.
//
// Backend may not be wired yet when this code first ships (parallel agent is
// building the endpoints). The helpers handle 404 / network errors gracefully:
// the IPC handler maps them to `{ok: false, error: '...'}` so the renderer
// renders a clean error UI instead of an exception.

interface AuthFetchOptions {
  /** Send Authorization: Bearer <token> when calling protected endpoints. */
  withAccessToken?: boolean;
  /** Override the default timeout. */
  timeoutMs?: number;
}

/**
 * Generic POST to /api/auth/*. Returns parsed JSON or null + an error message.
 * Never throws — caller branches on `ok`.
 */
async function authPost<T = unknown>(
  path: string,
  body: unknown,
  opts: AuthFetchOptions = {},
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  if (!path.startsWith('/api/auth/')) {
    return { ok: false, status: 0, data: null, error: 'authPost: invalid path' };
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (opts.withAccessToken) {
    const token = await readToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  try {
    const res = await net.fetch(apiBaseUrl() + path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(opts.timeoutMs ?? AUTH_TIMEOUT_MS),
    });
    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (res.ok) {
      return { ok: true, status: res.status, data: (parsed as T) ?? null };
    }
    const errMessage =
      typeof parsed === 'object' && parsed !== null && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : typeof parsed === 'string' && parsed
        ? parsed
        : `HTTP ${res.status}`;
    return { ok: false, status: res.status, data: null, error: errMessage };
  } catch (err) {
    if (isTimeoutError(err)) {
      return { ok: false, status: 0, data: null, error: 'Request timed out' };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, data: null, error: message };
  }
}

/**
 * Generic GET helper for /api/auth/*, used by setup2fa.
 */
async function authGet<T = unknown>(
  path: string,
  opts: AuthFetchOptions = {},
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  if (!path.startsWith('/api/')) {
    return { ok: false, status: 0, data: null, error: 'authGet: invalid path' };
  }
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.withAccessToken) {
    const token = await readToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  try {
    const res = await net.fetch(apiBaseUrl() + path, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(opts.timeoutMs ?? AUTH_TIMEOUT_MS),
    });
    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (res.ok) {
      return { ok: true, status: res.status, data: (parsed as T) ?? null };
    }
    const errMessage =
      typeof parsed === 'object' && parsed !== null && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : typeof parsed === 'string' && parsed
        ? parsed
        : `HTTP ${res.status}`;
    return { ok: false, status: res.status, data: null, error: errMessage };
  } catch (err) {
    if (isTimeoutError(err)) {
      return { ok: false, status: 0, data: null, error: 'Request timed out' };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, data: null, error: message };
  }
}

/**
 * Persist a fresh token pair (after login / signup / verify2fa) and broadcast
 * the new authenticated state to all windows. Centralised so the three call
 * sites share the same write + emit semantics.
 */
async function persistAndAnnounce(
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  user: AuthUserProfile,
): Promise<void> {
  const safeExpires = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600;
  await setTokens(accessToken, refreshToken, safeExpires);
  emitAuthAuthenticated({
    user,
    accessExpiresAt: Date.now() + Math.floor(safeExpires * 1000),
  });
}

interface LoginBackendResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: AuthUserProfile;
  requires_2fa?: boolean;
  requires_2fa_setup?: boolean;
  partial_token?: string;
}

interface SignupBackendResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: AuthUserProfile;
  email_verified?: boolean;
}

interface ChangePasswordBackendResponse {
  ok?: boolean;
  all_sessions_revoked?: boolean;
}

interface Setup2faBackendResponse {
  secret?: string;
  otpauth_uri?: string;
}

/**
 * POST /api/auth/login with email + password. On success, persists the token
 * pair and emits auth:authenticated. Three branches:
 *
 *  - regular login: returns {ok:true, user}
 *  - 2FA required:  returns {ok:true, requires2fa:true, partialToken}
 *  - 2FA setup:     returns {ok:true, requiresSetup:true, partialToken}
 *
 * Tokens are persisted ONLY in the regular-login branch — the partial-token
 * branches don't grant access; renderer must call verify2fa next.
 */
export async function authLogin(
  email: string,
  password: string,
): Promise<AuthLoginResult> {
  const r = await authPost<LoginBackendResponse>('/api/auth/login', { email, password });
  if (!r.ok || !r.data) {
    return { ok: false, error: r.error || 'Login failed' };
  }
  const d = r.data;
  if (d.requires_2fa && typeof d.partial_token === 'string') {
    return { ok: true, requires2fa: true, partialToken: d.partial_token };
  }
  if (d.requires_2fa_setup && typeof d.partial_token === 'string') {
    return { ok: true, requiresSetup: true, partialToken: d.partial_token };
  }
  if (
    typeof d.access_token !== 'string' ||
    typeof d.refresh_token !== 'string' ||
    !d.user
  ) {
    return { ok: false, error: 'Malformed login response' };
  }
  await persistAndAnnounce(
    d.access_token,
    d.refresh_token,
    typeof d.expires_in === 'number' ? d.expires_in : 3600,
    d.user,
  );
  return { ok: true, user: d.user };
}

/**
 * POST /api/auth/verify-2fa with the partial token (from authLogin) and a
 * 6-digit TOTP code. On success: persists tokens, emits auth:authenticated.
 */
export async function authVerify2FA(
  partialToken: string,
  totpCode: string,
): Promise<AuthVerify2faResult> {
  const r = await authPost<LoginBackendResponse>('/api/auth/verify-2fa', {
    partial_token: partialToken,
    totp_code: totpCode,
  });
  if (!r.ok || !r.data) {
    return { ok: false, error: r.error || '2FA verification failed' };
  }
  const d = r.data;
  if (
    typeof d.access_token !== 'string' ||
    typeof d.refresh_token !== 'string' ||
    !d.user
  ) {
    return { ok: false, error: 'Malformed 2FA response' };
  }
  await persistAndAnnounce(
    d.access_token,
    d.refresh_token,
    typeof d.expires_in === 'number' ? d.expires_in : 3600,
    d.user,
  );
  return { ok: true, user: d.user };
}

/**
 * POST /api/auth/signup. Backend returns the same shape as login plus an
 * `email_verified: false` flag. We persist tokens immediately so the user
 * can start using the app; the "verify your email" banner is renderer's
 * concern.
 */
export async function authSignup(
  email: string,
  password: string,
  fullName?: string,
): Promise<AuthSignupResult> {
  const body: Record<string, unknown> = { email, password };
  if (typeof fullName === 'string' && fullName.length > 0) {
    body.full_name = fullName;
  }
  const r = await authPost<SignupBackendResponse>('/api/auth/signup', body);
  if (!r.ok || !r.data) {
    return { ok: false, error: r.error || 'Signup failed' };
  }
  const d = r.data;
  if (
    typeof d.access_token !== 'string' ||
    typeof d.refresh_token !== 'string' ||
    !d.user
  ) {
    return { ok: false, error: 'Malformed signup response' };
  }
  await persistAndAnnounce(
    d.access_token,
    d.refresh_token,
    typeof d.expires_in === 'number' ? d.expires_in : 3600,
    d.user,
  );
  return {
    ok: true,
    user: d.user,
    emailVerified: Boolean(d.email_verified),
  };
}

/**
 * POST /api/auth/logout — best-effort server-side revoke. Local tokens are
 * cleared regardless of the server response: we never want to leave a stale
 * pair on disk just because the network was down at sign-out time.
 */
export async function authLogout(): Promise<void> {
  const tokens = await getTokens();
  if (tokens.refreshToken) {
    // Fire-and-forget — we don't block sign-out on backend success.
    try {
      await authPost('/api/auth/logout', { refresh_token: tokens.refreshToken });
    } catch {
      // ignore
    }
  }
  await clearToken();
}

/**
 * POST /api/auth/forgot-password. Backend always returns 200 (it hides
 * whether the email exists). We mirror that contract — even on transport
 * failure we return {ok:true} so the UI shows the same "if it exists"
 * message and we don't enable user-enumeration via timing differences.
 */
export async function authForgotPassword(email: string): Promise<{ ok: true }> {
  try {
    await authPost('/api/auth/forgot-password', { email });
  } catch {
    // ignore
  }
  return { ok: true };
}

/**
 * POST /api/auth/change-password (requires Bearer auth). On success, backend
 * revokes all OTHER refresh tokens — current session keeps working. UI shows
 * a warning so the user knows their other devices are signed out.
 */
export async function authChangePassword(
  currentPassword: string,
  newPassword: string,
): Promise<AuthChangePasswordResult> {
  const r = await authPost<ChangePasswordBackendResponse>(
    '/api/auth/change-password',
    { current_password: currentPassword, new_password: newPassword },
    { withAccessToken: true },
  );
  if (!r.ok || !r.data) {
    return { ok: false, error: r.error || 'Password change failed' };
  }
  return { ok: true, allSessionsRevoked: Boolean(r.data.all_sessions_revoked) };
}

/**
 * GET /api/admin/2fa/setup — returns {secret, otpauth_uri}. We don't render
 * QR codes in main; renderer reads the otpauth_uri and either turns it into
 * a QR via a library or displays the text + secret as a fallback.
 */
export async function authSetup2FA(): Promise<AuthSetup2faResult> {
  const r = await authGet<Setup2faBackendResponse>('/api/admin/2fa/setup', {
    withAccessToken: true,
  });
  if (!r.ok || !r.data) {
    throw new Error(r.error || '2FA setup failed');
  }
  if (typeof r.data.secret !== 'string' || typeof r.data.otpauth_uri !== 'string') {
    throw new Error('Malformed 2FA setup response');
  }
  return { secret: r.data.secret, otpauthUri: r.data.otpauth_uri };
}
