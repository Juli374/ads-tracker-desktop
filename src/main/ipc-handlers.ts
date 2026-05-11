import { app, BrowserWindow, ipcMain, net, shell } from 'electron';
import {
  IpcChannel,
  AppInfo,
  ApiRequestPayload,
  ApiResponse,
  MediaUploadPayload,
  MediaUploadResponse,
  LocalRoyaltyImportPayload,
  UpdateStatus,
  AiStreamStartPayload,
  AiStreamChunk,
} from '../shared/ipc';
import { readToken, writeToken, clearToken } from './auth-store';
import { performApiRequest } from './api-client';
import { localStore } from './local-db';
import { localRoyalty } from './local-db/royalty';
import { getUpdateStatus, checkForUpdates } from './updater';

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

// In-flight AI streams: map streamId -> AbortController for cancellation.
const aiStreams = new Map<string, AbortController>();

function emitAiChunk(chunk: AiStreamChunk): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IpcChannel.AiStreamChunk, chunk);
    }
  }
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

  // ====== AI Advisor SSE streaming ======
  // Renderer → main: открыть SSE-соединение, парсить data: lines, эмитить chunks.
  // Main → renderer: AiStreamChunk events с { streamId, data }.
  ipcMain.handle(
    IpcChannel.AiStreamStart,
    async (_evt, payload: AiStreamStartPayload): Promise<void> => {
      // Валидация payload и path.
      if (!payload || typeof payload.streamId !== 'string' || payload.streamId.length === 0) {
        throw new Error('ai:stream:start expects streamId: string');
      }
      const streamId = payload.streamId;
      let normalisedPath: string;
      try {
        normalisedPath = validateUploadPath(payload.path);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emitAiChunk({ streamId, data: { type: 'error', message } });
        emitAiChunk({ streamId, data: { type: 'done' } });
        return;
      }

      // Если streamId уже занят — отменим старый.
      const existing = aiStreams.get(streamId);
      if (existing) {
        existing.abort();
        aiStreams.delete(streamId);
      }

      const controller = new AbortController();
      aiStreams.set(streamId, controller);

      const token = await readToken();
      const url = apiBaseUrl() + normalisedPath;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // Запускаем stream в фоне, не ждём окончания.
      (async () => {
        try {
          const response = await net.fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload.body ?? {}),
            signal: controller.signal,
          });

          if (!response.ok) {
            const text = await response.text().catch(() => '');
            let message = `HTTP ${response.status}`;
            try {
              const parsed = JSON.parse(text);
              if (parsed && typeof parsed === 'object' && 'error' in parsed) {
                message = String((parsed as { error: unknown }).error);
              }
            } catch {
              if (text) message = text;
            }
            emitAiChunk({ streamId, data: { type: 'error', message, status: response.status } });
            emitAiChunk({ streamId, data: { type: 'done' } });
            return;
          }

          if (!response.body) {
            emitAiChunk({ streamId, data: { type: 'error', message: 'no response body' } });
            emitAiChunk({ streamId, data: { type: 'done' } });
            return;
          }

          // Парсер SSE: накапливаем chunks, делим по \n\n, обрабатываем data: lines.
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let separatorIdx = buffer.indexOf('\n\n');
            while (separatorIdx >= 0) {
              const event = buffer.slice(0, separatorIdx);
              buffer = buffer.slice(separatorIdx + 2);

              for (const line of event.split('\n')) {
                if (!line.startsWith('data:')) continue;
                const dataPart = line.slice(5).trimStart();
                if (!dataPart) continue;
                try {
                  const parsed = JSON.parse(dataPart);
                  if (parsed && typeof parsed === 'object') {
                    emitAiChunk({ streamId, data: parsed });
                  }
                } catch {
                  // Игнорируем malformed line.
                }
              }
              separatorIdx = buffer.indexOf('\n\n');
            }
          }

          emitAiChunk({ streamId, data: { type: 'done' } });
        } catch (err) {
          if (controller.signal.aborted) {
            emitAiChunk({ streamId, data: { type: 'done', cancelled: true } });
            return;
          }
          const message = err instanceof Error ? err.message : String(err);
          emitAiChunk({ streamId, data: { type: 'error', message } });
          emitAiChunk({ streamId, data: { type: 'done' } });
        } finally {
          aiStreams.delete(streamId);
        }
      })();
    },
  );

  ipcMain.handle(IpcChannel.AiStreamCancel, async (_evt, streamId: unknown): Promise<void> => {
    if (typeof streamId !== 'string') return;
    const controller = aiStreams.get(streamId);
    if (controller) {
      controller.abort();
      aiStreams.delete(streamId);
    }
  });
}
