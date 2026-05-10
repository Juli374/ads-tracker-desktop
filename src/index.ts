import { app, BrowserWindow, crashReporter, dialog, session } from 'electron';
import path from 'path';
import { initLogger } from './main/logger';
import { registerIpcHandlers } from './main/ipc-handlers';
import { IpcChannel, DeepLinkEvent } from './shared/ipc';

// Initialise the file logger before any other module that might want to log.
// app.getPath('logs') is safe to call pre-ready.
initLogger();

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// === Crash reporter ===
// Запускаем ДО app.whenReady() — иначе ранние крэши main-процесса не попадут в minidump.
// uploadToServer:false → minidumps пишутся локально (в `app.getPath('crashDumps')`),
// никуда не отправляются. Когда появится backend для приёма — добавить submitURL.
crashReporter.start({
  productName: 'Ads Tracker',
  companyName: 'Juli374',
  submitURL: '',
  uploadToServer: false,
});

// === Last-resort error handlers ===
// Без них Node по умолчанию убивает процесс на uncaughtException — пользователь
// видит просто исчезнувшее окно. Логируем в stderr (Lane B заменит на electron-log)
// + показываем диалог при критических крэшах в main.
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('[main] uncaughtException:', err);
  try {
    dialog.showErrorBox(
      'Ads Tracker — внутренняя ошибка',
      `Произошла непредвиденная ошибка в основном процессе.\n\n${err?.stack ?? String(err)}`,
    );
  } catch {
    // dialog может быть недоступен до app.whenReady() — ничего не делаем.
  }
});
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[main] unhandledRejection:', reason);
});

if (require('electron-squirrel-startup')) {
  app.quit();
}

// === Windows AppUserModelID ===
// Без этого Windows отображает приложение под именем 'electron.exe' в taskbar /
// notification center, и toast'ы группируются неправильно. ID должен совпадать
// с appBundleId в forge.config.ts и идентификатором в Squirrel installer.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.juli374.ads-tracker');
}

const PROTOCOL = 'ads-tracker-desktop';

// === Content Security Policy ===
// Та же policy, что и в src/index.html (meta tag) — заголовок добавляем для всех
// ответов defaultSession. Дублирование осознанное: meta срабатывает в самом
// renderer'е (catch-all для file:// fallback), header — для http(s)://localhost
// в dev-режиме, где meta может игнорироваться. connect-src ограничен только
// нашим Railway backend'ом, чтобы скомпрометированный renderer не мог
// эксфильтровать токен на сторонний хост.
const CSP_POLICY = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "connect-src 'self' https://ads-tracker-production.up.railway.app",
  "img-src 'self' data: https:",
  "script-src 'self'",
].join('; ');

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
      // Явно фиксируем оборонительный baseline (defaults в Electron 41 уже такие,
      // но дублируем — чтобы любой будущий апгрейд не «случайно» включил их).
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Belt-and-suspenders. Renderer запущен с sandbox=true + contextIsolation=true,
  // но если вдруг XSS в renderer попытается открыть новое окно или навигироваться —
  // запрещаем оба пути.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Разрешаем перезагрузку самого renderer-а (webpack HMR / dev refresh).
    // localhost разрешён ТОЛЬКО в dev-сборке: в packaged build webpack-dev-server
    // не запущен, и попытка перейти на localhost — почти всегда XSS / phishing.
    const isDevLocalhost = !app.isPackaged && url.startsWith('http://localhost:');
    if (url !== MAIN_WINDOW_WEBPACK_ENTRY && !isDevLocalhost) {
      event.preventDefault();
    }
  });

  // === render-process-gone ===
  // Renderer упал (OOM / segfault / killed). Без обработчика приложение
  // зависает с белым окном. Спрашиваем пользователя — перезагрузить или закрыть.
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    // eslint-disable-next-line no-console
    console.error('[main] render-process-gone:', details);
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'error',
      title: 'Ads Tracker — окно перестало отвечать',
      message: 'Renderer-процесс завершился неожиданно.',
      detail: `Причина: ${details.reason}.\n\nПерезагрузить окно?`,
      buttons: ['Перезагрузить', 'Закрыть'],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice === 0) {
      mainWindow.webContents.reload();
    } else {
      mainWindow.close();
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
  // === Permissions: deny-by-default ===
  // Personal-use клиент не использует ни камеру, ни микрофон, ни геолокацию,
  // ни notifications. Любой запрос на permission от renderer'а — подозрительный
  // (XSS / scam-page injected). Allow-list оставляем пустым.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });

  // === CSP via response headers ===
  // Дублируем policy из <meta> — на случай, если renderer грузится по
  // http(s):// (dev), где meta может игнорироваться браузером.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...(details.responseHeaders ?? {}) };
    // Удаляем существующие CSP-заголовки (если webpack-dev-server их добавил),
    // чтобы наш policy не был ослаблен мерджем.
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'content-security-policy') {
        delete headers[key];
      }
    }
    headers['Content-Security-Policy'] = [CSP_POLICY];
    callback({ responseHeaders: headers });
  });

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
