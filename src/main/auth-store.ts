import { app, safeStorage } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';

// Источники токена, по приоритету:
// 1. ENV ADS_TRACKER_API_TOKEN (для CI/тестов)
// 2. ENV ADS_TRACKER_PERSONAL_TOKEN (для owner-сборки — экспортируется в
//    local-env.sh, gitignored)
// 3. Encrypted via safeStorage (production)
// 4. Plain-file fallback (unsigned dev — при отсутствии keychain)
// Если ни один источник не дал токен — возвращаем null, юзер увидит LoginScreen.

const TOKEN_FILE_ENC = 'auth-token.bin';
const TOKEN_FILE_PLAIN = 'auth-token.txt';
// Phase R.7 — refresh token (длиннее живёт, отдельный файл). Plain-фолбэк нужен
// чтобы unsigned dev DMG не ломался когда safeStorage недоступен.
const REFRESH_TOKEN_FILE_ENC = 'auth-refresh-token.bin';
const REFRESH_TOKEN_FILE_PLAIN = 'auth-refresh-token.txt';
// Phase R.7 — expiry timestamp (epoch ms) для access token. Хранится plain'ом:
// это не секрет, а информация когда access протух (UI может проактивно
// рефрешнуть до 401).
const ACCESS_EXPIRES_FILE = 'auth-access-expires.txt';
// OAuth CSRF state — храним отдельным файлом, чтобы не смешивать lifecycle
// с auth-token (юзер мог быть уже залогинен, когда стартует OAuth Amazon Ads).
const OAUTH_STATE_FILE = 'oauth-state.bin';

const encPath = (): string => path.join(app.getPath('userData'), TOKEN_FILE_ENC);
const plainPath = (): string => path.join(app.getPath('userData'), TOKEN_FILE_PLAIN);
const refreshEncPath = (): string =>
  path.join(app.getPath('userData'), REFRESH_TOKEN_FILE_ENC);
const refreshPlainPath = (): string =>
  path.join(app.getPath('userData'), REFRESH_TOKEN_FILE_PLAIN);
const accessExpiresPath = (): string =>
  path.join(app.getPath('userData'), ACCESS_EXPIRES_FILE);
const oauthStatePath = (): string => path.join(app.getPath('userData'), OAUTH_STATE_FILE);

function envToken(): string | null {
  const raw = process.env.ADS_TRACKER_API_TOKEN?.trim();
  return raw && raw.length > 0 ? raw : null;
}

// Owner-build shortcut. Token comes from a gitignored local-env.sh that the
// launcher sources before `npm start`. Keep the token OUT of source control.
function personalEnvToken(): string | null {
  const raw = process.env.ADS_TRACKER_PERSONAL_TOKEN?.trim();
  return raw && raw.length > 0 ? raw : null;
}

async function readEncrypted(): Promise<string | null> {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const buf = await fs.readFile(encPath());
    return safeStorage.decryptString(buf);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return null;
  }
}

async function readPlain(): Promise<string | null> {
  try {
    const txt = await fs.readFile(plainPath(), 'utf8');
    const trimmed = txt.trim();
    if (trimmed.length > 0) {
      // Migration warn: plain-file всё ещё лежит на диске. writeToken теперь
      // его не создаёт (кроме explicit opt-in через ENV), но старые установки
      // могли его оставить. Видим в логах → знаем, что юзера надо мигрировать.
      // eslint-disable-next-line no-console
      console.warn(
        '[auth-store] reading token from plain-file fallback; safeStorage will be used on next writeToken()',
      );
      return trimmed;
    }
    return null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return null;
  }
}

export async function readToken(): Promise<string | null> {
  // 1) ENV override (тесты/CI)
  const fromEnv = envToken();
  if (fromEnv) return fromEnv;

  // 2) Owner-build env shortcut (local-env.sh)
  const fromPersonal = personalEnvToken();
  if (fromPersonal) return fromPersonal;

  // 3) Зашифрованный keychain (production/signed builds)
  const fromEnc = await readEncrypted();
  if (fromEnc) return fromEnc;

  // 4) Plain-файл (unsigned dev, fallback когда safeStorage недоступен)
  const fromPlain = await readPlain();
  if (fromPlain) return fromPlain;

  // 5) Ничего не нашли — юзер увидит LoginScreen.
  return null;
}

export async function writeToken(token: string): Promise<void> {
  // Всегда сначала пытаемся подчистить plain-файл — независимо от того,
  // удалось ли потом зашифровать. Иначе старое незашифрованное значение
  // лежит на диске даже после перехода на keychain (security-finding #3).
  try {
    await fs.unlink(plainPath());
  } catch {
    // ignore: ENOENT в норме
  }
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(token);
    await fs.writeFile(encPath(), encrypted, { mode: 0o600 });
    return;
  }
  // Fallback: unsigned packaged macOS DMG can't reach the user's Keychain
  // until the OS deems the app "trusted" (usually after Gatekeeper signs off
  // — which never happens for unsigned apps). The env-gated throw above
  // blocked every login on unsigned builds, including the LoginScreen "paste
  // token" flow that's the ONLY way for a fresh install to authenticate.
  //
  // Silently fall back to a mode-0o600 plaintext file in userData (owner-only
  // on disk). Once the project moves to a signed + notarised DMG, safeStorage
  // becomes available and this branch never runs.
  // eslint-disable-next-line no-console
  console.warn('[auth-store] safeStorage unavailable — falling back to plaintext (0o600) in userData');
  await fs.writeFile(plainPath(), token, { encoding: 'utf8', mode: 0o600 });
}

export async function clearToken(): Promise<void> {
  // Phase R.7: legacy clearToken also nukes the new refresh-token + expires
  // sidecar files. Sign-out is "forget everything auth-related" — keeping
  // old refresh tokens around when the access token is gone would be a bug.
  for (const p of [
    encPath(),
    plainPath(),
    refreshEncPath(),
    refreshPlainPath(),
    accessExpiresPath(),
  ]) {
    try {
      await fs.unlink(p);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        // Игнорируем — не блокируем sign-out из-за одного из файлов
      }
    }
  }
}

// =============================================================================
// Phase R.7 — refresh-token pair (access + refresh + expires)
// =============================================================================
//
// Backward compat policy:
//   - `readToken()` keeps its semantics — returns whatever access token we have,
//     falling through env/personal/keychain/plain. Legacy single-token installs
//     (Phase Q.x) keep working without modification.
//   - `getTokens()` is the new strict API: returns `{accessToken, refreshToken,
//     accessExpiresAt}`. When the install is a legacy single-token one,
//     `refreshToken` is null and api-client must NOT attempt /api/auth/refresh.
//   - `setTokens()` writes both halves + the expiry timestamp. After this,
//     `readToken()` returns the new access token; `getTokens()` returns the
//     full triple.

export interface TokenBundle {
  accessToken: string | null;
  refreshToken: string | null;
  /** Epoch ms when accessToken expires. null = unknown (legacy installs). */
  accessExpiresAt: number | null;
}

async function readEncryptedFile(absPath: string): Promise<string | null> {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const buf = await fs.readFile(absPath);
    return safeStorage.decryptString(buf);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return null;
  }
}

async function readPlainFile(absPath: string): Promise<string | null> {
  try {
    const txt = await fs.readFile(absPath, 'utf8');
    const trimmed = txt.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return null;
  }
}

async function readRefreshToken(): Promise<string | null> {
  const enc = await readEncryptedFile(refreshEncPath());
  if (enc) return enc;
  return readPlainFile(refreshPlainPath());
}

async function readAccessExpiresAt(): Promise<number | null> {
  const txt = await readPlainFile(accessExpiresPath());
  if (!txt) return null;
  const n = Number(txt);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Read the full token bundle. `accessToken` falls back to `readToken()` (so
 * env / legacy plain files still work). `refreshToken` is only populated when
 * the user logged in through the Phase R.7 auth flow.
 */
export async function getTokens(): Promise<TokenBundle> {
  const [accessToken, refreshToken, accessExpiresAt] = await Promise.all([
    readToken(),
    readRefreshToken(),
    readAccessExpiresAt(),
  ]);
  return { accessToken, refreshToken, accessExpiresAt };
}

/**
 * Write both halves of the token pair plus the absolute expiry timestamp
 * (epoch ms). Uses safeStorage for the secrets and a plain text file for
 * the expiry (it's not a secret). Cleans up legacy plain-text sidecars on
 * each call so an unsigned-dev → signed-prod migration doesn't leave them.
 */
export async function setTokens(
  accessToken: string,
  refreshToken: string,
  expiresInSec: number,
): Promise<void> {
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new Error('setTokens: accessToken must be a non-empty string');
  }
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
    throw new Error('setTokens: refreshToken must be a non-empty string');
  }
  if (!Number.isFinite(expiresInSec) || expiresInSec <= 0) {
    throw new Error('setTokens: expiresInSec must be a positive number');
  }

  // Access token reuses the legacy writeToken so the rest of the code (which
  // reads via readToken()) keeps working without churn.
  await writeToken(accessToken);

  // Refresh token gets its own pair of files. Try keychain first.
  try {
    await fs.unlink(refreshPlainPath());
  } catch {
    // ignore: ENOENT
  }
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(refreshToken);
    await fs.writeFile(refreshEncPath(), encrypted, { mode: 0o600 });
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      '[auth-store] safeStorage unavailable — refresh token will use plaintext (0o600) fallback',
    );
    await fs.writeFile(refreshPlainPath(), refreshToken, {
      encoding: 'utf8',
      mode: 0o600,
    });
  }

  // Expiry timestamp — public, plain text. Round to integer ms.
  const expiresAt = Date.now() + Math.floor(expiresInSec * 1000);
  await fs.writeFile(accessExpiresPath(), String(expiresAt), {
    encoding: 'utf8',
    mode: 0o600,
  });
}

/**
 * Rotate the access token in place (post-refresh). Refresh token may also
 * rotate — the backend can issue a new one on each /api/auth/refresh — so we
 * accept it as an optional second arg. When omitted, the existing refresh
 * token is kept untouched.
 */
export async function rotateTokens(
  accessToken: string,
  expiresInSec: number,
  newRefreshToken?: string,
): Promise<void> {
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new Error('rotateTokens: accessToken must be a non-empty string');
  }
  await writeToken(accessToken);
  if (typeof newRefreshToken === 'string' && newRefreshToken.length > 0) {
    try {
      await fs.unlink(refreshPlainPath());
    } catch {
      // ignore
    }
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(newRefreshToken);
      await fs.writeFile(refreshEncPath(), encrypted, { mode: 0o600 });
    } else {
      await fs.writeFile(refreshPlainPath(), newRefreshToken, {
        encoding: 'utf8',
        mode: 0o600,
      });
    }
  }
  if (Number.isFinite(expiresInSec) && expiresInSec > 0) {
    const expiresAt = Date.now() + Math.floor(expiresInSec * 1000);
    await fs.writeFile(accessExpiresPath(), String(expiresAt), {
      encoding: 'utf8',
      mode: 0o600,
    });
  }
}

// =============================================================================
// OAuth CSRF state (Amazon Ads OAuth-флоу)
// =============================================================================
//
// Renderer:
//   1. Перед startOAuth — генерирует random state (crypto.randomUUID()).
//   2. Вызывает window.api.oauth.writeState(state) → main пишет в safeStorage.
//   3. Юзер уходит в браузер, авторизует.
//   4. Браузер шлёт deeplink ads-tracker-desktop://callback?code=…&state=…
//   5. main → renderer (DeepLink event).
//   6. Renderer вызывает window.api.oauth.consumeState() → получает saved + clears.
//   7. Сравнивает saved === url.searchParams.state. Только при совпадении —
//      завершает OAuth (POST /oauth/callback).
//
// Хранение в safeStorage (а не in-memory) — чтобы пережить рестарт app:
// если юзер запустил OAuth, app крэшнул, юзер открыл Amazon, ОС приоткрыла
// нашу app через deeplink — мы должны помнить state, иначе вечный «mismatch».
//
// Fallback: если safeStorage недоступен — пишем plain (mode 0o600). State
// не настолько чувствителен, как auth token (он одноразовый и истекает с
// OAuth-сессией Amazon ~10 мин), но всё же шифруем когда можем.

const OAUTH_STATE_FALLBACK_FILE = 'oauth-state.txt';
const oauthStateFallbackPath = (): string =>
  path.join(app.getPath('userData'), OAUTH_STATE_FALLBACK_FILE);

// In-memory mirror: oauth state живёт коротко (минуты). Если процесс не
// перезапускался между write и consume — берём из памяти, не трогаем диск.
let pendingOAuthStateMemory: string | null = null;

export async function writePendingOAuthState(state: string): Promise<void> {
  if (typeof state !== 'string' || state.length === 0) {
    throw new Error('writePendingOAuthState: state must be a non-empty string');
  }
  pendingOAuthStateMemory = state;
  // Чистим оба файла перед записью — чтобы не было stale state с прошлой
  // попытки (юзер начал OAuth → закрыл браузер → начал заново с новым state).
  for (const p of [oauthStatePath(), oauthStateFallbackPath()]) {
    try {
      await fs.unlink(p);
    } catch {
      // ignore: ENOENT в норме
    }
  }
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(state);
    await fs.writeFile(oauthStatePath(), encrypted, { mode: 0o600 });
    return;
  }
  // Fallback: plain. Mode 0o600 — только владельцу.
  await fs.writeFile(oauthStateFallbackPath(), state, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

async function readEncryptedOAuthState(): Promise<string | null> {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const buf = await fs.readFile(oauthStatePath());
    return safeStorage.decryptString(buf);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return null;
  }
}

async function readPlainOAuthState(): Promise<string | null> {
  try {
    const txt = await fs.readFile(oauthStateFallbackPath(), 'utf8');
    const trimmed = txt.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return null;
  }
}

/**
 * One-shot read: вернуть сохранённый state и **сразу** очистить его.
 * Это критично — если callback приходит дважды (юзер ткнул кнопку 2 раза),
 * второй раз должен фейлиться, а не реюзать старый state.
 */
export async function consumePendingOAuthState(): Promise<string | null> {
  // Приоритет: in-memory (если пишущий процесс — тот же).
  let state: string | null = pendingOAuthStateMemory;
  if (!state) state = await readEncryptedOAuthState();
  if (!state) state = await readPlainOAuthState();

  // Очищаем всё — даже если ничего не нашли (на случай stale plain-файла).
  pendingOAuthStateMemory = null;
  for (const p of [oauthStatePath(), oauthStateFallbackPath()]) {
    try {
      await fs.unlink(p);
    } catch {
      // ignore: ENOENT в норме
    }
  }

  return state;
}
