import { app, ipcMain, net, shell } from 'electron';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  IpcChannel,
  AppInfo,
  ApiRequestPayload,
  ApiResponse,
  MediaUploadPayload,
  MediaUploadResponse,
  LocalRoyaltyImportPayload,
  UpdateStatus,
  CoverQAPayload,
  CoverQAReport,
} from '../shared/ipc';
import { readToken, writeToken, clearToken } from './auth-store';
import { performApiRequest } from './api-client';
import { localStore } from './local-db';
import { localRoyalty } from './local-db/royalty';
import { getUpdateStatus, checkForUpdates } from './updater';
import { analyzeCover } from './cover-qa';

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

  // ====== Auto-update (scaffold) ======

  ipcMain.handle(IpcChannel.UpdateGetStatus, async (): Promise<UpdateStatus> => {
    return getUpdateStatus();
  });

  ipcMain.handle(IpcChannel.UpdateCheck, async (): Promise<UpdateStatus> => {
    return checkForUpdates();
  });

  // ====== Cover QA (Phase M.4) ======
  //
  // Accepts either {path} (absolute filesystem path) or {base64} (raw image
  // bytes from the renderer). Returns a CoverQAReport. No HTTP, no auth — all
  // analysis is local. Tier-free: Start tier gets this for virality.

  ipcMain.handle(
    IpcChannel.CoverQACheck,
    async (_evt, payload: CoverQAPayload): Promise<CoverQAReport> => {
      if (!payload || typeof payload !== 'object') {
        throw new Error('cover-qa:check: payload must be an object');
      }
      const target = payload.target === 'print' ? 'print' : 'ebook';

      let buffer: Buffer;
      if (typeof payload.path === 'string' && payload.path.length > 0) {
        // Defence-in-depth: resolve to absolute and refuse anything other
        // than a regular file. Prevents directory traversal beyond what the
        // renderer-side dialog can already restrict.
        const resolved = path.resolve(payload.path);
        const stat = await fs.stat(resolved);
        if (!stat.isFile()) {
          throw new Error('cover-qa:check: path is not a regular file');
        }
        buffer = await fs.readFile(resolved);
      } else if (typeof payload.base64 === 'string' && payload.base64.length > 0) {
        buffer = Buffer.from(payload.base64, 'base64');
        if (buffer.length === 0) {
          throw new Error('cover-qa:check: base64 decoded to an empty buffer');
        }
      } else {
        throw new Error('cover-qa:check: payload must include either `path` or `base64`');
      }

      return analyzeCover(buffer, { target });
    },
  );
}
