import { app, ipcMain, net, shell } from 'electron';
import nodePath from 'path';
import {
  IpcChannel,
  AppInfo,
  ApiRequestPayload,
  ApiResponse,
  MediaUploadPayload,
  MediaUploadResponse,
  LocalRoyaltyImportPayload,
  UpdateStatus,
  AppLogPayload,
} from '../shared/ipc';
import { readToken, writeToken, clearToken } from './auth-store';
import { performApiRequest } from './api-client';
import { localStore } from './local-db';
import { localRoyalty } from './local-db/royalty';
import { getStatus as getUpdateStatus, checkForUpdates, quitAndInstall as updaterQuitAndInstall } from './updater';
import { logger, getLogFilePath, scrubSecrets, scrubValue } from './logger';

const DEFAULT_API_BASE_URL = 'https://ads-tracker-production.up.railway.app';

function apiBaseUrl(): string {
  return (process.env.ADS_TRACKER_API_URL?.trim() || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
}

/** Shared path guard — mirrors api-client.ts validatePath. */
function validateUploadPath(path: unknown): string {
  if (typeof path !== 'string' || path.length === 0) {
    throw Object.assign(new Error('media:upload: path must be a non-empty string'), { status: 400 });
  }
  if (path.includes('://') || path.includes('..') || path.includes('\\') || path.includes('@')) {
    throw Object.assign(new Error('media:upload: path contains invalid characters'), { status: 400 });
  }
  const normalised = path.startsWith('/') ? path : `/${path}`;
  if (!normalised.startsWith('/api/')) {
    throw Object.assign(new Error('media:upload: path must start with /api/'), { status: 400 });
  }
  return normalised;
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannel.AppGetVersion, async (): Promise<AppInfo> => ({
    version: app.getVersion(),
    platform: process.platform,
    isPackaged: app.isPackaged,
  }));

  ipcMain.handle(IpcChannel.AppGetApiBaseUrl, async (): Promise<string> => {
    return process.env.ADS_TRACKER_API_URL?.trim() || DEFAULT_API_BASE_URL;
  });

  ipcMain.handle(IpcChannel.AuthGetToken, async (): Promise<string | null> => {
    return readToken();
  });

  ipcMain.handle(
    IpcChannel.AuthSetToken,
    async (_evt, token: unknown): Promise<void> => {
      if (typeof token !== 'string' || token.length === 0) {
        throw new Error('auth:setToken expects a non-empty string');
      }
      await writeToken(token);
    },
  );

  ipcMain.handle(IpcChannel.AuthClearToken, async (): Promise<void> => {
    await clearToken();
  });

  ipcMain.handle(
    IpcChannel.ApiRequest,
    async (_evt, payload: ApiRequestPayload): Promise<ApiResponse> => {
      return performApiRequest(payload);
    },
  );

  ipcMain.handle(
    IpcChannel.MediaUpload,
    async (_evt, payload: MediaUploadPayload): Promise<MediaUploadResponse> => {
      // --- validate path ---
      let normalisedPath: string;
      try {
        normalisedPath = validateUploadPath(payload?.path);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, status: 400, data: null, error: message };
      }

      // --- validate files array ---
      if (!Array.isArray(payload?.files) || payload.files.length === 0) {
        return { ok: false, status: 400, data: null, error: 'media:upload: files must be a non-empty array' };
      }

      const token = await readToken();

      // --- build FormData ---
      const formData = new FormData();

      for (const file of payload.files) {
        if (
          typeof file.field !== 'string' ||
          typeof file.name !== 'string' ||
          typeof file.base64 !== 'string' ||
          typeof file.contentType !== 'string'
        ) {
          return { ok: false, status: 400, data: null, error: 'media:upload: each file must have field, name, base64, contentType' };
        }
        const buf = Buffer.from(file.base64, 'base64');
        const blob = new Blob([buf], { type: file.contentType });
        formData.append(file.field, blob, file.name);
      }

      if (payload.formFields) {
        for (const [key, value] of Object.entries(payload.formFields)) {
          formData.append(key, value);
        }
      }

      // --- send request ---
      const url = apiBaseUrl() + normalisedPath;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      try {
        const response = await net.fetch(url, {
          method: 'POST',
          body: formData,
          headers,
        });

        const contentType = response.headers.get('content-type') ?? '';
        const text = await response.text();
        let parsed: unknown = null;
        if (text) {
          if (contentType.includes('json')) {
            try {
              parsed = JSON.parse(text);
            } catch {
              parsed = text;
            }
          } else {
            parsed = text;
          }
        }

        if (response.ok) {
          return { ok: true, status: response.status, data: parsed };
        }

        const errMessage =
          typeof parsed === 'object' && parsed !== null && 'error' in parsed
            ? String((parsed as { error: unknown }).error)
            : typeof parsed === 'string'
            ? parsed
            : `HTTP ${response.status}`;
        return { ok: false, status: response.status, data: null, error: errMessage };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, status: 0, data: null, error: message };
      }
    },
  );

  // Безопасный openExternal: пускаем только https / наш собственный protocol.
  ipcMain.handle(
    IpcChannel.ShellOpenExternal,
    async (_evt, url: unknown): Promise<void> => {
      if (typeof url !== 'string') {
        throw new Error('shell:openExternal expects a string URL');
      }
      // Только https — НИЧЕГО иного. Если разрешить ads-tracker-desktop://,
      // компрометированный renderer мог бы инициировать self-deeplink loop:
      // openExternal('ads-tracker-desktop://callback?code=ATTACKER&state=')
      // → ОС зовёт нас же → CredentialsTab.completeOAuth с кодом атакующего.
      if (!url.startsWith('https://')) {
        throw new Error('shell:openExternal: only https:// allowed');
      }
      await shell.openExternal(url);
    },
  );

  // ====== Local royalty store (public-release scaffold) ======

  ipcMain.handle(IpcChannel.LocalRoyaltyListUploads, async () => {
    return localRoyalty.listUploads();
  });

  ipcMain.handle(IpcChannel.LocalRoyaltyListRecords, async (_evt, uploadId: unknown) => {
    if (typeof uploadId !== 'number') {
      throw new Error('local:royalty:listRecords expects upload_id: number');
    }
    return localRoyalty.listRecords(uploadId);
  });

  ipcMain.handle(IpcChannel.LocalRoyaltyGetSummary, async (_evt, month: unknown) => {
    if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
      throw new Error('local:royalty:getSummary expects target_month YYYY-MM');
    }
    return localRoyalty.getSummary(month);
  });

  ipcMain.handle(IpcChannel.LocalRoyaltyImport, async (_evt, payload: unknown) => {
    // Минимальная валидация: остальное — типизированно через TS на caller-side.
    const p = payload as LocalRoyaltyImportPayload;
    if (
      !p ||
      typeof p.account_id !== 'number' ||
      typeof p.marketplace !== 'string' ||
      typeof p.target_month !== 'string' ||
      !Array.isArray(p.records)
    ) {
      throw new Error('local:royalty:import payload malformed');
    }
    return localRoyalty.importUpload(p);
  });

  ipcMain.handle(IpcChannel.LocalRoyaltyDelete, async (_evt, uploadId: unknown) => {
    if (typeof uploadId !== 'number') {
      throw new Error('local:royalty:delete expects upload_id: number');
    }
    return localRoyalty.deleteUpload(uploadId);
  });

  ipcMain.handle(IpcChannel.LocalRoyaltyFilePath, async (): Promise<string> => {
    return localStore.filePath();
  });

  // ====== Auto-update (electron-updater) ======

  ipcMain.handle(IpcChannel.UpdateGetStatus, async (): Promise<UpdateStatus> => {
    return getUpdateStatus();
  });

  ipcMain.handle(IpcChannel.UpdateCheck, async (): Promise<UpdateStatus> => {
    return checkForUpdates();
  });

  ipcMain.handle(IpcChannel.UpdateQuitAndInstall, async (): Promise<void> => {
    updaterQuitAndInstall();
  });

  // ====== Phase I.2 Lane B: log + log path + reveal-in-folder ======

  /**
   * Forward renderer log lines into the main file transport. Strict
   * shape validation; PII scrubbed before write (defense in depth on top
   * of the renderer-side scrubbing in ErrorBoundary).
   */
  ipcMain.handle(
    IpcChannel.AppLog,
    async (_evt, payload: unknown): Promise<void> => {
      if (!payload || typeof payload !== 'object') {
        throw new Error('app:log expects { level, message, ctx? }');
      }
      const p = payload as Partial<AppLogPayload>;
      const validLevels = new Set(['error', 'warn', 'info', 'debug']);
      if (typeof p.level !== 'string' || !validLevels.has(p.level)) {
        throw new Error('app:log: level must be one of error|warn|info|debug');
      }
      if (typeof p.message !== 'string') {
        throw new Error('app:log: message must be a string');
      }
      if (p.ctx !== undefined && (p.ctx === null || typeof p.ctx !== 'object' || Array.isArray(p.ctx))) {
        throw new Error('app:log: ctx must be a plain object');
      }
      // Defence in depth: scrub even if renderer already did.
      const message = `[renderer] ${scrubSecrets(p.message)}`;
      const ctx = p.ctx ? scrubValue(p.ctx) : undefined;
      logger[p.level as AppLogPayload['level']](message, ctx);
    },
  );

  ipcMain.handle(IpcChannel.AppGetLogPath, async (): Promise<string> => {
    return getLogFilePath();
  });

  /**
   * Reveal a file in the OS file manager. Allowed paths are constrained to
   * the logs and userData subtrees — renderer cannot point this at anywhere
   * else on the filesystem (would otherwise be an information disclosure
   * primitive in case of XSS in renderer).
   */
  ipcMain.handle(
    IpcChannel.ShellShowItemInFolder,
    async (_evt, target: unknown): Promise<void> => {
      if (typeof target !== 'string' || target.length === 0) {
        throw new Error('shell:showItemInFolder expects a non-empty string path');
      }
      // Reject obvious traversal attempts before resolving — keep error message
      // identical to the post-resolve check so we don't leak path info.
      if (target.includes('\0')) {
        throw new Error('shell:showItemInFolder: path outside allowed directories');
      }
      const resolved = nodePath.resolve(target);
      const logsDir = nodePath.resolve(app.getPath('logs'));
      const userDataDir = nodePath.resolve(app.getPath('userData'));
      const isInside = (parent: string, child: string) => {
        const rel = nodePath.relative(parent, child);
        return !rel.startsWith('..') && !nodePath.isAbsolute(rel);
      };
      if (!isInside(logsDir, resolved) && !isInside(userDataDir, resolved) && resolved !== logsDir && resolved !== userDataDir) {
        throw new Error('shell:showItemInFolder: path outside allowed directories');
      }
      shell.showItemInFolder(resolved);
    },
  );
}
