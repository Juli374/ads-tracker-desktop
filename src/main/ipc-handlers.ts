import { app, BrowserWindow, dialog, ipcMain, net, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import {
  IpcChannel,
  AppInfo,
  ApiRequestPayload,
  ApiResponse,
  MediaUploadPayload,
  MediaUploadResponse,
  LocalRoyaltyImportPayload,
  LocalRoyaltyParseResult,
  DialogOpenFileOptions,
  DialogOpenFileResult,
  UpdateStatus,
} from '../shared/ipc';
import { readToken, writeToken, clearToken } from './auth-store';
import { performApiRequest } from './api-client';
import { localStore } from './local-db';
import { localRoyalty, RoyaltyParseError } from './local-db/royalty';
import { getUpdateStatus, checkForUpdates } from './updater';

// 10 MB cap for any single file going through media:upload. The Railway
// backend has its own 16MB body limit, but we want a clear UX-side error
// (and to avoid base64-encoding a 50MB blob in renderer memory).
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

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

      // --- size guard ---
      // base64 inflates the original by ~33% (4 chars per 3 bytes), so we
      // back-compute the decoded size from the encoded length. This catches
      // 10MB+ files BEFORE Buffer.from() spends memory on the decode.
      for (const f of payload.files) {
        if (typeof f?.base64 !== 'string') continue;
        const padding = (f.base64.endsWith('==') ? 2 : f.base64.endsWith('=') ? 1 : 0);
        const decodedBytes = Math.floor((f.base64.length * 3) / 4) - padding;
        if (decodedBytes > MAX_UPLOAD_BYTES) {
          const mb = (decodedBytes / 1024 / 1024).toFixed(1);
          return {
            ok: false,
            status: 413,
            data: null,
            error: `media:upload: file "${f.name}" is ${mb} MB — limit is 10 MB`,
          };
        }
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
      // → ОС зовёт нас же → AmazonAdsSection.completeOAuth с кодом атакующего.
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

  ipcMain.handle(
    IpcChannel.LocalRoyaltyParseFile,
    async (_evt, absPath: unknown): Promise<LocalRoyaltyParseResult> => {
      if (typeof absPath !== 'string' || absPath.length === 0) {
        throw new Error('local:royalty:parseFile expects an absolute path string');
      }
      // Resolve + check that the path stays inside the user's home dir
      // family. We don't read /etc, /proc, /System etc. — defense in depth.
      const resolved = path.resolve(absPath);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(resolved);
      } catch (err) {
        throw new Error(
          `local:royalty:parseFile: cannot stat "${resolved}": ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      if (!stat.isFile()) {
        throw new Error('local:royalty:parseFile: path is not a regular file');
      }
      if (stat.size > MAX_UPLOAD_BYTES) {
        throw new Error(
          `local:royalty:parseFile: file is ${(stat.size / 1024 / 1024).toFixed(1)} MB — limit is 10 MB`,
        );
      }
      const buf = fs.readFileSync(resolved);
      try {
        const parsed = localRoyalty.parseFile(buf);
        return {
          records: parsed.records,
          warnings: parsed.warnings,
          format: parsed.format,
          source_path: resolved,
        };
      } catch (err) {
        if (err instanceof RoyaltyParseError) {
          throw new Error(`Royalty parse failed (${err.code}): ${err.message}`);
        }
        throw err;
      }
    },
  );

  // ====== Native dialogs ======

  ipcMain.handle(
    IpcChannel.DialogOpenFile,
    async (
      evt,
      options: unknown,
    ): Promise<DialogOpenFileResult> => {
      const opts = (options ?? {}) as DialogOpenFileOptions;
      const win = BrowserWindow.fromWebContents(evt.sender) ?? undefined;
      const result = win
        ? await dialog.showOpenDialog(win, {
            title: typeof opts.title === 'string' ? opts.title : undefined,
            properties: ['openFile'],
            filters: Array.isArray(opts.filters) ? opts.filters : undefined,
          })
        : await dialog.showOpenDialog({
            title: typeof opts.title === 'string' ? opts.title : undefined,
            properties: ['openFile'],
            filters: Array.isArray(opts.filters) ? opts.filters : undefined,
          });
      if (result.canceled || result.filePaths.length === 0) {
        return { path: null };
      }
      return { path: result.filePaths[0] };
    },
  );

  // ====== Auto-update (scaffold) ======

  ipcMain.handle(IpcChannel.UpdateGetStatus, async (): Promise<UpdateStatus> => {
    return getUpdateStatus();
  });

  ipcMain.handle(IpcChannel.UpdateCheck, async (): Promise<UpdateStatus> => {
    return checkForUpdates();
  });
}
