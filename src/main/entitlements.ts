// Phase K — Tier-gating skeleton, main process.
//
// Hold in memory: current entitlements + список subscribers. Persist в
// safeStorage (`entitlements.bin`) — переживает рестарт. Initial fetch на
// login (через AuthSetToken handler), periodic refresh каждые 30 минут когда
// есть focus'ed window.
//
// Env override: `ADS_TRACKER_FORCE_TIER=start|pro|business` — игнорируем server
// и подсовываем synthetic snapshot. Нужно для dev/QA пока backend не выкатан.

import { app, BrowserWindow, safeStorage } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import {
  EMPTY_ENTITLEMENTS,
  Entitlements,
  forcedTierEntitlements,
  Tier,
} from '../shared/entitlements';
import { performApiRequest } from './api-client';
import { IpcChannel } from '../shared/ipc';

const CACHE_FILE_ENC = 'entitlements.bin';
const CACHE_FILE_PLAIN = 'entitlements.json';

const cacheEncPath = (): string => path.join(app.getPath('userData'), CACHE_FILE_ENC);
const cachePlainPath = (): string => path.join(app.getPath('userData'), CACHE_FILE_PLAIN);

// 30 min: типовой interval refresh. Совпадает с expires_at, который ставит
// server при выпуске snapshot'а.
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

type Subscriber = (e: Entitlements) => void;

let currentEntitlements: Entitlements = EMPTY_ENTITLEMENTS;
let subscribers: Subscriber[] = [];
let refreshTimer: NodeJS.Timeout | null = null;
let hasStarted = false;
// Защита от concurrent fetch — если refresh заспаунен дважды, не делаем два
// сетевых запроса. Все ждут одного `inFlight`.
let inFlight: Promise<Entitlements> | null = null;

function readForcedTier(): Tier | null {
  const raw = process.env.ADS_TRACKER_FORCE_TIER?.trim().toLowerCase();
  if (raw === 'start' || raw === 'pro' || raw === 'business') return raw;
  return null;
}

/**
 * Прочитать кэш с диска. Не падает на ENOENT / corrupted JSON — просто вернёт
 * `EMPTY_ENTITLEMENTS`. Cache хранится зашифрованным в safeStorage когда
 * возможно, иначе — plain (mode 0o600).
 */
export async function loadCached(): Promise<Entitlements> {
  // Encrypted first.
  if (safeStorage.isEncryptionAvailable()) {
    try {
      const buf = await fs.readFile(cacheEncPath());
      const decrypted = safeStorage.decryptString(buf);
      const parsed = JSON.parse(decrypted);
      if (parsed && typeof parsed === 'object' && parsed.v === 1) {
        return parsed as Entitlements;
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        // eslint-disable-next-line no-console
        console.warn('[entitlements] loadCached encrypted failed:', err);
      }
    }
  }
  // Plain fallback.
  try {
    const txt = await fs.readFile(cachePlainPath(), 'utf8');
    const parsed = JSON.parse(txt);
    if (parsed && typeof parsed === 'object' && parsed.v === 1) {
      return parsed as Entitlements;
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      // eslint-disable-next-line no-console
      console.warn('[entitlements] loadCached plain failed:', err);
    }
  }
  return EMPTY_ENTITLEMENTS;
}

export async function saveCache(e: Entitlements): Promise<void> {
  const json = JSON.stringify(e);
  // Чистим plain если есть — чтобы не было stale нешифрованного значения
  // когда safeStorage внезапно стал доступен (mirror auth-store.ts).
  try {
    await fs.unlink(cachePlainPath());
  } catch {
    // ignore: ENOENT в норме
  }
  if (safeStorage.isEncryptionAvailable()) {
    try {
      const encrypted = safeStorage.encryptString(json);
      await fs.writeFile(cacheEncPath(), encrypted, { mode: 0o600 });
      return;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[entitlements] saveCache encrypted failed:', err);
    }
  }
  // Fallback — plain. Entitlements не такой sensitive как auth token (нет
  // секретов), но всё равно держим mode 0o600 на случай мультипользовательской
  // машины.
  try {
    await fs.writeFile(cachePlainPath(), json, { encoding: 'utf8', mode: 0o600 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[entitlements] saveCache plain failed:', err);
  }
}

async function clearCacheFiles(): Promise<void> {
  for (const p of [cacheEncPath(), cachePlainPath()]) {
    try {
      await fs.unlink(p);
    } catch {
      // ignore ENOENT
    }
  }
}

/**
 * Сетевой fetch с graceful fallback:
 *   - 200 → парсим JSON, валидируем `v` поле
 *   - 404 → backend ещё не выкатан, возвращаем EMPTY_ENTITLEMENTS
 *   - 401 → юзер не залогинен, возвращаем EMPTY_ENTITLEMENTS
 *   - сеть / прочие 4xx-5xx → возвращаем текущий cached (не ломаем UX)
 *
 * Если `ADS_TRACKER_FORCE_TIER` выставлен — НЕ ходим в сеть, возвращаем
 * synthetic snapshot.
 */
export async function fetchEntitlements(): Promise<Entitlements> {
  const forced = readForcedTier();
  if (forced) {
    return forcedTierEntitlements(forced);
  }

  // Один in-flight fetch на всю программу — concurrent refresh'ы должны ждать.
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await performApiRequest<unknown>({
        method: 'GET',
        path: '/api/me/entitlements',
      });
      if (res.ok && res.data && typeof res.data === 'object') {
        const data = res.data as { v?: unknown };
        if (data.v === 1) {
          return data as unknown as Entitlements;
        }
        // Unknown schema version — fail-safe to empty (closed by default).
        // eslint-disable-next-line no-console
        console.warn('[entitlements] server returned unknown schema version:', data.v);
        return EMPTY_ENTITLEMENTS;
      }
      // 404 / 401 / network / 5xx — все fall through сюда.
      // 404 = backend ещё не выкатан → EMPTY.
      // 401 = юзер не залогинен → EMPTY.
      // network / 5xx = оставим то что есть в cache (caller передаст cached,
      // но мы возвращаем EMPTY — для login-state это корректно).
      if (res.status === 404 || res.status === 401 || res.status === 0) {
        return EMPTY_ENTITLEMENTS;
      }
      // Прочие server-errors → не ломаем текущий state, возвращаем что есть.
      return currentEntitlements;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[entitlements] fetchEntitlements threw:', err);
      return currentEntitlements;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

function notifySubscribers(e: Entitlements): void {
  for (const cb of subscribers) {
    try {
      cb(e);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[entitlements] subscriber threw:', err);
    }
  }
  // Push в renderer-окна.
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      try {
        win.webContents.send(IpcChannel.EntitlementsChanged, e);
      } catch {
        // ignore — окно могло быть закрыто между isDestroyed() и send()
      }
    }
  }
}

export function getCurrent(): Entitlements {
  return currentEntitlements;
}

export function subscribe(cb: Subscriber): () => void {
  subscribers.push(cb);
  return () => {
    subscribers = subscribers.filter((s) => s !== cb);
  };
}

/**
 * Произвести fetch + сохранить cache + уведомить subscribers. Используется и
 * для initial-fetch на login, и для periodic refresh.
 *
 * Идемпотентно: возвращает то же значение, если ничего не изменилось
 * (по `expires_at` + `tier` + кол-ву overrides).
 */
export async function refresh(): Promise<Entitlements> {
  const next = await fetchEntitlements();
  const prev = currentEntitlements;
  currentEntitlements = next;
  // Сохраняем cache даже если equal — не дорого, и гарантирует что
  // последнее значение всегда на диске.
  await saveCache(next).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[entitlements] saveCache after refresh failed:', err);
  });
  // Notify только если что-то реально изменилось (избежать лишних
  // re-render'ов renderer'а на periodic-refresh без изменений).
  if (!shallowEqual(prev, next)) {
    notifySubscribers(next);
  }
  return next;
}

function shallowEqual(a: Entitlements, b: Entitlements): boolean {
  if (a === b) return true;
  if (a.tier !== b.tier) return false;
  if (a.expires_at !== b.expires_at) return false;
  if (a.user_id !== b.user_id) return false;
  if (a.subscription.status !== b.subscription.status) return false;
  // Сравним JSON всего features-map'а — он мелкий (12 ключей).
  if (JSON.stringify(a.features) !== JSON.stringify(b.features)) return false;
  if (JSON.stringify(a.overrides ?? {}) !== JSON.stringify(b.overrides ?? {})) return false;
  return true;
}

/**
 * Запуск трекинга: загружаем cache → fetch → schedule periodic refresh.
 * Безопасно вызывать несколько раз — повторные вызовы no-op.
 */
export async function startEntitlementsTracking(): Promise<void> {
  if (hasStarted) return;
  hasStarted = true;

  // Initial — из кэша (без сетевого запроса), чтобы renderer мог сразу
  // отрендериться в "last known state".
  const cached = await loadCached();
  currentEntitlements = cached;

  // Затем fetch с сервера. Если 401 (нет токена) — спокойно вернёт EMPTY.
  await refresh().catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[entitlements] initial refresh failed:', err);
  });

  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    // Periodic refresh — только когда есть focused window. На background
    // (app свёрнут / закрыт) не дёргаем сервер впустую.
    const hasFocused = BrowserWindow.getAllWindows().some(
      (w) => !w.isDestroyed() && w.isFocused(),
    );
    if (!hasFocused) return;
    void refresh().catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[entitlements] periodic refresh failed:', err);
    });
  }, REFRESH_INTERVAL_MS);
}

/** На logout — стереть кэш + сбросить state в EMPTY. */
export async function clearOnLogout(): Promise<void> {
  await clearCacheFiles();
  currentEntitlements = EMPTY_ENTITLEMENTS;
  notifySubscribers(currentEntitlements);
}

/** Для тестов / shutdown — остановить периодический таймер. */
export function stopEntitlementsTracking(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  hasStarted = false;
  subscribers = [];
}
