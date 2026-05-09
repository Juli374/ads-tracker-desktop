// Auto-update scaffold (public-release).
// Реальная имплементация — через `electron-updater` + GitHub Releases (private repo).
// Сейчас — no-op stub: state='idle', enabled=false. Renderer вызывает getStatus()
// и видит что апдейтер выключен; UI рисует placeholder badge.
//
// Чтобы включить реально:
//   1. npm i electron-updater (+ npm i -D @types/node для совместимости)
//   2. Раскомментировать секцию `realImpl` ниже и заменить тело `getUpdateStatus` /
//      `checkForUpdates` на работу с autoUpdater.
//   3. В forge.config.ts добавить `publishers` (GitHub) с repo + token.
//   4. На macOS требует подписи (см. forge.config.ts → osxSign).
import { app } from 'electron';
import type { UpdateStatus } from '../shared/ipc';

// Текущее состояние, обновляемое из событий electron-updater (когда подключим).
// eslint-disable-next-line prefer-const -- будет реассайниться в real impl ниже
let state: UpdateStatus = {
  state: 'idle',
  current_version: app.getVersion(),
  enabled: false,
  message: 'Auto-update scaffold: подключи electron-updater для реальной проверки.',
};

export function getUpdateStatus(): UpdateStatus {
  return { ...state };
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  // No-op: возвращаем последний known state. Real impl будет вызывать
  // autoUpdater.checkForUpdates() и обновлять state из событий.
  return { ...state };
}

// === Реальная имплементация (когда подключим electron-updater) ===
//
// import { autoUpdater } from 'electron-updater';
//
// export function initAutoUpdater(): void {
//   if (!app.isPackaged) return; // в dev не запускаем
//   autoUpdater.autoDownload = false;
//   autoUpdater.on('checking-for-update', () => { state = { ...state, state: 'checking' }; });
//   autoUpdater.on('update-available', (info) => {
//     state = { state: 'available', version: info.version, current_version: app.getVersion(), enabled: true };
//   });
//   autoUpdater.on('update-not-available', () => { state = { ...state, state: 'not-available' }; });
//   autoUpdater.on('download-progress', (p) => {
//     state = { ...state, state: 'downloading', progress_percent: Math.round(p.percent) };
//   });
//   autoUpdater.on('update-downloaded', (info) => {
//     state = { state: 'downloaded', version: info.version, current_version: app.getVersion(), enabled: true };
//   });
//   autoUpdater.on('error', (err) => {
//     state = { ...state, state: 'error', message: err.message, enabled: false };
//   });
//   autoUpdater.checkForUpdatesAndNotify();
// }
//
// Не забудь вызвать initAutoUpdater() из src/index.ts после createWindow().
//
// Используй ipcMain.handle('update:install', ...) и autoUpdater.quitAndInstall(false, true)
// чтобы дать пользователю кнопку «Установить и перезапустить».

// Прикладной экспорт чтобы не было unused. Когда подключим — удалим.
export const _UPDATER_SCAFFOLD = true;
