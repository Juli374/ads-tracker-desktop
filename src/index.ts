import { app, BrowserWindow } from 'electron';
import path from 'path';
import { registerIpcHandlers } from './main/ipc-handlers';
import { IpcChannel, DeepLinkEvent } from './shared/ipc';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

if (require('electron-squirrel-startup')) {
  app.quit();
}

// Branding — set the user-facing app name early so it shows up in the macOS
// menu bar, Dock tooltip, native About panel, and any default window titles.
// Must run before BrowserWindow creation; package.json's `productName` is the
// build-time source of truth, this duplicates it for runtime read.
app.setName('Ads Tracker');

// macOS native About panel (Cmd+, > Ads Tracker > About Ads Tracker, or the
// Apple menu's auto-generated About item). Other platforms ignore this call.
// The version field is read from `app.getVersion()` (package.json `version`)
// so it stays in sync with whatever Forge built.
app.setAboutPanelOptions({
  applicationName: 'Ads Tracker',
  applicationVersion: app.getVersion(),
  copyright: '© 2026 Juli374',
  authors: ['Juli374'],
  website: 'https://github.com/Juli374/ads-tracker-desktop',
});

const PROTOCOL = 'ads-tracker-desktop';

// Регистрируем кастомный протокол как default-handler.
// Windows / Linux требуют единственный инстанс, чтобы deeplink ловился через
// 'second-instance'. macOS использует 'open-url'.
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

const sendDeepLink = (url: string) => {
  const payload: DeepLinkEvent = { url };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IpcChannel.DeepLink, payload);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  } else {
    // Окно ещё не создано — отдадим после ready через очередь.
    pendingDeepLinks.push(url);
  }
};

const pendingDeepLinks: string[] = [];

// Принимаем только deeplink'и нашего протокола с известным host'ом.
// Сейчас разрешён только 'callback' (для OAuth Amazon Ads). Если позже
// появятся другие host'ы — добавлять явно сюда.
const ALLOWED_DEEPLINK_HOSTS = new Set(['callback']);

const isValidDeepLink = (url: string): boolean => {
  if (!url.startsWith(`${PROTOCOL}://`)) return false;
  try {
    const u = new URL(url);
    return ALLOWED_DEEPLINK_HOSTS.has(u.host);
  } catch {
    return false;
  }
};

const findDeepLinkInArgv = (argv: string[]): string | null => {
  return argv.find((a) => isValidDeepLink(a)) ?? null;
};

// macOS: open-url
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (!isValidDeepLink(url)) return; // молча игнорируем неизвестные host'ы
  sendDeepLink(url);
});

// Windows / Linux: second-instance передаёт argv от запущенной копии.
app.on('second-instance', (_e, argv) => {
  const url = findDeepLinkInArgv(argv);
  if (url) sendDeepLink(url);
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#f2f3f3',
    title: 'Ads Tracker',
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Belt-and-suspenders. Renderer запущен с sandbox=true + contextIsolation=true,
  // но если вдруг XSS в renderer попытается открыть новое окно или навигироваться —
  // запрещаем оба пути.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Разрешаем только перезагрузку самого renderer-а (webpack HMR / dev refresh).
    if (url !== MAIN_WINDOW_WEBPACK_ENTRY && !url.startsWith('http://localhost:')) {
      event.preventDefault();
    }
  });

  // DevTools открываем только если явно попросили через ENV — иначе любой
  // unpackaged build (npm start) даёт root-доступ к token'у через console.
  if (process.env.ADS_TRACKER_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Когда renderer готов — выгружаем накопленные deeplink'и (Windows запуск
  // через protocol передаёт URL через argv задолго до создания окна).
  mainWindow.webContents.on('did-finish-load', () => {
    while (pendingDeepLinks.length > 0) {
      const url = pendingDeepLinks.shift();
      if (url) sendDeepLink(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.on('ready', () => {
  registerIpcHandlers();

  // Если запустились через deeplink на Windows — argv содержит URL.
  const initialDeepLink = findDeepLinkInArgv(process.argv);
  if (initialDeepLink) pendingDeepLinks.push(initialDeepLink);

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
