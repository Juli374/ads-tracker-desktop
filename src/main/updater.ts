// Auto-update — electron-updater + GitHub Releases.
//
// Жизненный цикл (см. electron-knowledge-base/atlas/core/07-auto-update.md):
//   1. initAutoUpdater(window) вызывается из src/index.ts после createWindow()
//      ТОЛЬКО если app.isPackaged. В dev апдейтер не инициализируется и
//      getStatus() возвращает {state:'idle', enabled:false} — UpdateChecker
//      рисует «Auto-update disabled (dev build)».
//   2. autoDownload=true → как только update-available, electron-updater сам
//      качает; мы публикуем download-progress в renderer.
//   3. autoInstallOnAppQuit=true → если юзер не нажал «Restart now», обновление
//      применится при следующем закрытии app.
//   4. quitAndInstall() — кнопка в UI после state='downloaded' → app закрывается
//      и сразу запускается новая версия (Squirrel.Mac / NSIS handle the swap).
//
// События публикуются через UpdateChanged push-channel — renderer слушает в
// UpdateChecker и перерисовывается без polling'а.
//
// TODO (Lane B): заменить console.* на electron-log после мерджа Lane B.
//                См. src/main/logger.ts (после Lane B) для централизованного log.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import { IpcChannel } from '../shared/ipc';
import type { UpdateStatus } from '../shared/ipc';

// === Phase Q.5+ — persistent auto-download preference ===
// Stored in userData/updater-prefs.json. Default = true (auto-download on).
const PREFS_FILENAME = 'updater-prefs.json';
interface UpdaterPrefs {
  autoDownload: boolean;
}

function prefsPath(): string {
  return path.join(app.getPath('userData'), PREFS_FILENAME);
}

function readPrefs(): UpdaterPrefs {
  try {
    const raw = fs.readFileSync(prefsPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<UpdaterPrefs>;
    return {
      autoDownload: typeof parsed.autoDownload === 'boolean' ? parsed.autoDownload : true,
    };
  } catch {
    // File missing / unreadable / malformed → default to ON.
    return { autoDownload: true };
  }
}

function writePrefs(prefs: UpdaterPrefs): void {
  try {
    fs.writeFileSync(prefsPath(), JSON.stringify(prefs, null, 2), 'utf8');
  } catch (err) {
    console.error('[updater] failed to persist prefs', err);
  }
}

// Текущее состояние, обновляемое из событий electron-updater.
let state: UpdateStatus = {
  state: 'idle',
  current_version: app.getVersion(),
  enabled: false,
  message: 'Auto-update not initialized.',
};

// Подписчики на изменение state (внутри main-процесса). Renderer'ы получают
// push через IpcChannel.UpdateChanged ниже, в initAutoUpdater.
type Subscriber = (s: UpdateStatus) => void;
const subscribers = new Set<Subscriber>();

/** Установить новый state + уведомить всех подписчиков. */
function setState(next: Partial<UpdateStatus>): void {
  state = { ...state, ...next, current_version: app.getVersion() };
  for (const cb of subscribers) {
    try {
      cb(state);
    } catch (err) {
      // TODO: replace with logger after Lane B merges
      console.error('[updater] subscriber threw', err);
    }
  }
}

export function getStatus(): UpdateStatus {
  return { ...state };
}

/**
 * Триггер ручной проверки. Возвращает текущий snapshot (не финальный) — реальные
 * переходы state происходят через события electron-updater и приходят в renderer
 * через UpdateChanged push.
 */
export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!state.enabled) {
    // dev / non-packaged → no-op
    return { ...state };
  }
  try {
    setState({ state: 'checking', error: undefined });
    await autoUpdater.checkForUpdates();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // TODO: replace with logger after Lane B merges
    console.error('[updater] checkForUpdates failed', err);
    setState({ state: 'error', error: message });
  }
  return { ...state };
}

/**
 * Перезапустить app и установить скачанное обновление. Вызывать только когда
 * state='downloaded'. В dev — no-op (просто логируем).
 */
export function quitAndInstall(): void {
  if (!state.enabled) {
    // TODO: replace with logger after Lane B merges
    console.warn('[updater] quitAndInstall called in dev — no-op');
    return;
  }
  if (state.state !== 'downloaded') {
    // TODO: replace with logger after Lane B merges
    console.warn(`[updater] quitAndInstall called while state='${state.state}' — ignoring`);
    return;
  }
  // isSilent=false → показываем UI прогресса (если есть).
  // isForceRunAfter=true → стартуем новую версию автоматически.
  autoUpdater.quitAndInstall(false, true);
}

/**
 * Подписаться на изменения state внутри main-процесса. Возвращает unsubscribe.
 * Renderer-подписка осуществляется через IpcChannel.UpdateChanged push.
 */
export function subscribe(cb: Subscriber): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

/**
 * Phase Q.5+ — toggle auto-download preference. Persists to userData and
 * applies immediately to the live autoUpdater instance.
 *
 * Effect:
 *   - true  → next 'update-available' event auto-progresses to 'downloading'
 *   - false → next 'update-available' event stops at 'available'; user must
 *             call `downloadUpdateNow()` to trigger download
 */
export function setAutoDownload(enabled: boolean): UpdateStatus {
  writePrefs({ autoDownload: enabled });
  // Apply to the live instance (no-op safety if not initialized yet).
  try {
    autoUpdater.autoDownload = enabled;
  } catch {
    // electron-updater unavailable in dev — fine to swallow.
  }
  setState({ auto_download: enabled });
  return { ...state };
}

/**
 * Phase Q.5+ — manually trigger download when auto-download is OFF and an
 * update is available. No-op when not in 'available' state.
 */
export async function downloadUpdateNow(): Promise<UpdateStatus> {
  if (!state.enabled) return { ...state };
  if (state.state !== 'available') {
    // Nothing to download; surface a hint.
    return { ...state };
  }
  try {
    await autoUpdater.downloadUpdate();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[updater] downloadUpdate failed', err);
    setState({ state: 'error', error: message });
  }
  return { ...state };
}

// === legacy alias для обратной совместимости с ipc-handlers.ts (старое имя) ===
export const getUpdateStatus = getStatus;

/**
 * Инициализация апдейтера. Вызывается из src/index.ts после createWindow().
 * Безопасно вызывать многократно (idempotent). В dev / non-packaged билде —
 * не делает ничего и оставляет state как `enabled: false`.
 *
 * @param window — главное окно для push UpdateChanged через webContents.send.
 *                 Если null — push не публикуется в renderer (но subscribe()
 *                 в main продолжает работать).
 */
export function initAutoUpdater(window: BrowserWindow | null): void {
  if (!app.isPackaged) {
    // dev — апдейтер выключен.
    setState({
      state: 'idle',
      enabled: false,
      message: 'Auto-update disabled (dev build).',
    });
    return;
  }

  // Конфигурация — autoDownload читается из persisted prefs (default=true).
  // Юзер может отключить через UI; настройка сохраняется в userData/updater-prefs.json
  // и переживает рестарты. autoInstallOnAppQuit=true (если юзер не нажал
  // «Restart now», апдейт применится при следующем закрытии app — независимо
  // от autoDownload).
  const prefs = readPrefs();
  autoUpdater.autoDownload = prefs.autoDownload;
  autoUpdater.autoInstallOnAppQuit = true;
  setState({ auto_download: prefs.autoDownload });

  // Programmatically set the feed. electron-updater by default reads
  // app-update.yml from Resources/, but electron-forge doesn't generate
  // that file (electron-builder does). Setting it via setFeedURL bypasses
  // the file lookup entirely — works whether or not app-update.yml exists.
  // Required fields for GitHub provider: provider, owner, repo. The token
  // is implicit (electron-updater reads GH_TOKEN for private repos; ours
  // is private but releases are still readable without a token because
  // the user is the repo owner authenticated separately).
  try {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'Juli374',
      repo: 'ads-tracker-desktop',
    });
  } catch (err) {
    // Old electron-updater versions throw on unsupported provider shapes;
    // log and continue — checkForUpdates() will fall back to app-update.yml
    // (which may also exist via packagerConfig.extraResource).
    // eslint-disable-next-line no-console
    console.warn('[updater] setFeedURL failed; falling back to app-update.yml', err);
  }

  // TODO: replace with electron-log after Lane B merges. Пока — console
  // (electron-updater сам пишет туда же при отсутствии logger).
  // autoUpdater.logger = log;

  setState({ state: 'idle', enabled: true, message: undefined });

  autoUpdater.on('checking-for-update', () => {
    setState({ state: 'checking', error: undefined });
  });

  autoUpdater.on('update-available', (info) => {
    setState({
      state: 'available',
      version: info?.version,
      error: undefined,
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    setState({
      state: 'not-available',
      version: info?.version,
      error: undefined,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    setState({
      state: 'downloading',
      progress_percent: typeof progress?.percent === 'number'
        ? Math.round(progress.percent)
        : undefined,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    setState({
      state: 'downloaded',
      version: info?.version,
      progress_percent: 100,
      error: undefined,
    });
  });

  autoUpdater.on('error', (err) => {
    const message = err instanceof Error ? err.message : String(err);
    // TODO: replace with logger after Lane B merges
    console.error('[updater] error event', err);
    setState({ state: 'error', error: message });
  });

  // Публикация в renderer: каждое изменение state шлём через UpdateChanged.
  if (window && !window.isDestroyed()) {
    const unsubscribe = subscribe((next) => {
      if (window.isDestroyed()) {
        unsubscribe();
        return;
      }
      window.webContents.send(IpcChannel.UpdateChanged, next);
    });
    window.on('closed', () => unsubscribe());
  }

  // Initial check после небольшой задержки (даём app полностью загрузиться).
  setTimeout(() => {
    void checkForUpdates();
  }, 5_000);
}
