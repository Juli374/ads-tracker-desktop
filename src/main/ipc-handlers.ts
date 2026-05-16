import { app, BrowserWindow, dialog, ipcMain, net, shell } from 'electron';
import fs from 'fs';
import nodePath from 'path';
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
  AppLogPayload,
  AiSettings,
  AiTestKeyResult,
  AiStreamStartPayload,
  AiStreamChunk,
  AiGeneratePayload,
  AiGenerateResult,
  AiGenerateTask,
  AutoNegState,
  AutoNegThresholds,
  AutoNegScanResult,
  WeeklyBriefing,
  BriefingRunResult,
  CoverQAPayload,
  CoverQAReport,
} from '../shared/ipc';
import {
  clearToken,
  consumePendingOAuthState,
  readToken,
  writePendingOAuthState,
  writeToken,
} from './auth-store';
import { performApiRequest } from './api-client';
import { localStore, DEFAULT_AI_SETTINGS, AiSettingsRow } from './local-db';
import { localRoyalty, RoyaltyParseError } from './local-db/royalty';
import { getStatus as getUpdateStatus, checkForUpdates, quitAndInstall as updaterQuitAndInstall } from './updater';
import { logger, getLogFilePath, scrubSecrets, scrubValue } from './logger';
import { generate as anthropicGenerate } from './ai/anthropic';
import { describeBrandVoice, mergeForSeries } from './ai/brandVoice';
import {
  clearOnLogout as clearEntitlementsOnLogout,
  getCurrent as getCurrentEntitlements,
  refresh as refreshEntitlements,
} from './entitlements';
import type { Entitlements } from '../shared/entitlements';
import { getAutoNegativator } from './automation';
import { getWeeklyBriefer } from './briefing';
import { analyzeCover } from './cover-qa';
import { setConsent as telemetrySetConsent } from './telemetry';

// 10 MB cap for any single file going through media:upload. The Railway
// backend has its own 16MB body limit, but we want a clear UX-side error
// (and to avoid base64-encoding a 50MB blob in renderer memory).
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const DEFAULT_API_BASE_URL = 'https://ads-tracker-production.up.railway.app';

// Multipart upload — те же 10s, что и обычные API-запросы.
// Если апдейт обложки тянется дольше — юзер увидит timeout и сможет повторить.
const UPLOAD_TIMEOUT_MS = 10_000;

function apiBaseUrl(): string {
  return (process.env.ADS_TRACKER_API_URL?.trim() || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
}

/** Распознаём AbortError / TimeoutError для multipart-fetch'а. */
function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return true;
  const msg = err.message?.toLowerCase() ?? '';
  return msg.includes('timed out') || msg.includes('aborted');
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

// ===== Phase L Lane A — AI prompt composition helpers =====
//
// Kept inline here (vs. a separate module) because the prompt taxonomy is the
// IPC handler's responsibility — it's how we map "task=title" to a deterministic
// system prompt without exposing any user-controlled content to the system slot.

// Phase M.2 — describeBrandVoice + per-series merge moved to src/main/ai/brandVoice.ts.
// Imported at the top of this file; the ai:generate handler calls
// mergeForSeries(settings.brandVoice, payload.seriesName) → describeBrandVoice(merged).

/** Compose the system prompt for a given task. Stable across calls (caches well). */
function buildSystemPrompt(task: AiGenerateTask, brandVoiceHint: string): string {
  const voiceLine = brandVoiceHint ? `\nBrand voice — ${brandVoiceHint}` : '';
  const disclosureLine =
    task === 'ask'
      ? ''
      : '\nRemember: Amazon requires authors to disclose AI-assisted content. Treat output as a starting point, not final copy.';
  switch (task) {
    case 'title':
      return (
        'You are a KDP listing copywriter. Generate one new book title that is concise, evocative, and keyword-rich. ' +
        'Avoid generic clichés. Use Title Case. End your reply with one final line: "Rationale: <one sentence>".' +
        voiceLine +
        disclosureLine
      );
    case 'subtitle':
      return (
        'You are a KDP listing copywriter. Generate one new subtitle that complements the title with a benefit-driven hook and 2-3 long-tail keywords. ' +
        'Keep it under ~120 chars. End your reply with one final line: "Rationale: <one sentence>".' +
        voiceLine +
        disclosureLine
      );
    case 'description':
      return (
        'You are a KDP listing copywriter. Rewrite the book description as a high-converting Amazon book detail page. ' +
        'Lead with a hook, weave in 5-7 relevant keywords naturally, use short paragraphs and one bullet group. ' +
        'Output plain text (no markdown). End your reply with one final line: "Rationale: <one sentence>".' +
        voiceLine +
        disclosureLine
      );
    case 'bullets':
      return (
        'You are a KDP listing copywriter. Produce 5 bullet points for the book detail page. ' +
        'Each bullet should be benefit-led, scannable, and under ~140 chars. Output as a numbered list "1." through "5.". ' +
        'End your reply with one final line: "Rationale: <one sentence>".' +
        voiceLine +
        disclosureLine
      );
    case 'aPlus':
      return (
        'You are a KDP A+ Content strategist. Propose 3-4 distinct A+ module angles for this book, each with a heading and a 2-3 sentence body. ' +
        'Vary the angles (e.g. social proof, sample chapter teaser, author bio, comparison). ' +
        'End your reply with one final line: "Rationale: <one sentence>".' +
        voiceLine +
        disclosureLine
      );
    case 'ask':
      return (
        'You are a KDP author assistant inside the KDPBook desktop app. Answer the user concisely (≤120 words). ' +
        'Be specific to KDP advertising, royalties, search-term mining, and listing optimisation. ' +
        'If you do not know, say so plainly. Never invent metrics.' +
        voiceLine
      );
    default: {
      // exhaustive check — TS will flag if a task is added without handler.
      const exhaustive: never = task;
      throw new Error(`ai:generate: unhandled task ${exhaustive as string}`);
    }
  }
}

/** Compose the user-turn message — actual book / page context lives here. */
function buildUserMessage(task: AiGenerateTask, p: Partial<AiGeneratePayload>): string {
  if (task === 'ask') {
    const lines: string[] = [];
    const prompt = p.prompt?.trim() ?? '';
    lines.push(prompt || '(empty prompt)');
    if (p.context && Object.keys(p.context).length > 0) {
      lines.push('');
      lines.push('App context:');
      for (const [k, v] of Object.entries(p.context)) {
        if (v === undefined || v === null) continue;
        lines.push(`- ${k}: ${String(v).slice(0, 200)}`);
      }
    }
    return lines.join('\n');
  }
  // Listing Studio tasks share the same context shape.
  const lines: string[] = [];
  lines.push(`Task: rewrite the book's ${task}.`);
  if (p.asin) lines.push(`ASIN: ${p.asin}`);
  if (p.currentText && p.currentText.trim().length > 0) {
    lines.push('');
    lines.push('Current text:');
    lines.push(p.currentText.trim());
  }
  if (p.guidance && p.guidance.trim().length > 0) {
    lines.push('');
    lines.push(`Author guidance: ${p.guidance.trim()}`);
  }
  return lines.join('\n');
}

/**
 * If the model ends with a single `Rationale: ...` line, lift it out into the
 * separate `rationale` field. Otherwise return the original text unchanged.
 *
 * Matches case-insensitively and anchors on the last occurrence so a model
 * that mentions "rationale" earlier in the body doesn't trigger a split.
 */
function splitRationale(text: string): { primary: string; rationale?: string } {
  if (!text) return { primary: '' };
  // Look for the last line that starts with "Rationale" (case-insensitive).
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    const match = line.match(/^rationale\s*[:\-—]\s*(.+)$/i);
    if (match) {
      const rationale = match[1].trim();
      const primary = lines.slice(0, i).join('\n').trim();
      if (primary.length > 0 && rationale.length > 0) {
        return { primary, rationale };
      }
    }
  }
  return { primary: text.trim() };
}

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

  // Build-time git short SHA, injected by webpack DefinePlugin in
  // webpack.main.config.ts. On shallow clones or non-git checkouts the
  // DefinePlugin substitutes `'unknown'`, so this always resolves to a string.
  ipcMain.handle(IpcChannel.AppGetGitCommit, async (): Promise<string> => {
    return process.env.GIT_COMMIT || 'unknown';
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
      // Phase K: после login — сразу освежаем entitlements (fire-and-forget,
      // renderer всё равно получит пуш через EntitlementsChanged).
      void refreshEntitlements().catch(() => {
        // ignore: refresh сам логирует ошибки
      });
    },
  );

  ipcMain.handle(IpcChannel.AuthClearToken, async (): Promise<void> => {
    await clearToken();
    // Phase K: на logout стираем кэш + сбрасываем state на EMPTY.
    await clearEntitlementsOnLogout().catch(() => {
      // ignore
    });
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
          // Тот же 10s timeout, что и в api-client.ts. Большой файл (>5MB)
          // вероятно не пройдёт за 10s, но мы и не хотим — Royalty/Cover
          // upload должен быть быстрый, иначе backend перегружен и юзеру
          // лучше сразу увидеть error, чем висеть.
          signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
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
        if (isTimeoutError(err)) {
          return {
            ok: false,
            status: 0,
            data: null,
            error: `Upload timed out after ${UPLOAD_TIMEOUT_MS}ms`,
          };
        }
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

  // ====== OAuth CSRF state (Amazon Ads OAuth-флоу) ======
  // Renderer: window.api.oauth.writeState(state) → main пишет в safeStorage.
  //          window.api.oauth.consumeState() → main отдаёт state и СРАЗУ его
  //          очищает (one-shot). Renderer сравнивает с url.searchParams.state
  //          и только при совпадении завершает OAuth.

  ipcMain.handle(
    IpcChannel.OAuthStateWrite,
    async (_evt, state: unknown): Promise<void> => {
      if (typeof state !== 'string' || state.length === 0) {
        throw new Error('oauth:state:write expects a non-empty string');
      }
      // Защита от слишком длинных state (на случай compromised renderer):
      // crypto.randomUUID() — 36 символов, дадим запас.
      if (state.length > 256) {
        throw new Error('oauth:state:write: state too long (max 256 chars)');
      }
      await writePendingOAuthState(state);
    },
  );

  ipcMain.handle(
    IpcChannel.OAuthStateConsume,
    async (): Promise<string | null> => {
      return consumePendingOAuthState();
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

  // ====== Phase J.4 Lane D: local royalty parse + native open-file dialog ======

  ipcMain.handle(
    IpcChannel.LocalRoyaltyParseFile,
    async (_evt, absPath: unknown): Promise<LocalRoyaltyParseResult> => {
      if (typeof absPath !== 'string' || absPath.length === 0) {
        throw new Error('local:royalty:parseFile expects an absolute path string');
      }
      const resolved = nodePath.resolve(absPath);
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

  // ====== Phase J.3 Lane C: AI settings ======

  /**
   * Read AI settings (Claude key + 4 model slots + brand voice). Defaults are
   * applied on the fly so an uninitialised local-db never returns undefined.
   * Returned key is RAW (full plaintext) — renderer is trusted (contextIsolated)
   * and only renders a masked preview.
   */
  ipcMain.handle(IpcChannel.AiSettingsGet, async (): Promise<AiSettings> => {
    const state = localStore.read();
    const ai: AiSettingsRow = state.ai_settings ?? { ...DEFAULT_AI_SETTINGS };
    // Phase M.2 — deep-clone seriesOverrides so renderer mutation can't leak
    // back into the in-memory store.
    const seriesOverrides = ai.brandVoice.seriesOverrides
      ? Object.fromEntries(
          Object.entries(ai.brandVoice.seriesOverrides).map(([k, v]) => [
            k,
            {
              ...(v.pov !== undefined ? { pov: v.pov } : {}),
              ...(v.toneWords ? { toneWords: [...v.toneWords] } : {}),
              ...(v.bannedWords ? { bannedWords: [...v.bannedWords] } : {}),
            },
          ]),
        )
      : undefined;
    return {
      claudeKey: ai.claudeKey,
      models: { ...ai.models },
      brandVoice: {
        pov: ai.brandVoice.pov,
        toneWords: [...ai.brandVoice.toneWords],
        bannedWords: [...ai.brandVoice.bannedWords],
        ...(seriesOverrides ? { seriesOverrides } : {}),
      },
    };
  });

  ipcMain.handle(
    IpcChannel.AiSettingsSet,
    async (_evt, payload: unknown): Promise<void> => {
      // Strict shape validation: a compromised renderer must not be able to
      // poison our local-db with arbitrary blobs.
      if (!payload || typeof payload !== 'object') {
        throw new Error('ai:settings:set expects an object');
      }
      const p = payload as Partial<AiSettings>;
      if (typeof p.claudeKey !== 'string') {
        throw new Error('ai:settings:set: claudeKey must be a string');
      }
      if (p.claudeKey.length > 1024) {
        throw new Error('ai:settings:set: claudeKey too long');
      }
      if (!p.models || typeof p.models !== 'object') {
        throw new Error('ai:settings:set: models must be an object');
      }
      const m = p.models;
      const requireSlot = (name: keyof AiSettings['models']): string => {
        const v = m[name];
        if (typeof v !== 'string' || v.length === 0 || v.length > 128) {
          throw new Error(`ai:settings:set: models.${name} must be non-empty string`);
        }
        return v;
      };
      const models = {
        completion: requireSlot('completion'),
        vision: requireSlot('vision'),
        fast: requireSlot('fast'),
        advisor: requireSlot('advisor'),
      };
      if (!p.brandVoice || typeof p.brandVoice !== 'object') {
        throw new Error('ai:settings:set: brandVoice must be an object');
      }
      const bv = p.brandVoice;
      const stringArray = (val: unknown, label: string): string[] => {
        if (!Array.isArray(val)) {
          throw new Error(`ai:settings:set: brandVoice.${label} must be an array`);
        }
        if (val.length > 256) {
          throw new Error(`ai:settings:set: brandVoice.${label} too long`);
        }
        return val.map((s) => {
          if (typeof s !== 'string') {
            throw new Error(`ai:settings:set: brandVoice.${label} items must be strings`);
          }
          if (s.length > 128) {
            throw new Error(`ai:settings:set: brandVoice.${label} item too long`);
          }
          return s;
        });
      };
      // Phase M.2 — validate optional seriesOverrides map. Hard caps the
      // total number of series rows so a compromised renderer can't blow
      // up disk / memory.
      let seriesOverrides: AiSettingsRow['brandVoice']['seriesOverrides'];
      if (bv.seriesOverrides !== undefined) {
        if (
          !bv.seriesOverrides ||
          typeof bv.seriesOverrides !== 'object' ||
          Array.isArray(bv.seriesOverrides)
        ) {
          throw new Error('ai:settings:set: brandVoice.seriesOverrides must be a plain object');
        }
        const rows = Object.entries(bv.seriesOverrides as Record<string, unknown>);
        if (rows.length > 128) {
          throw new Error('ai:settings:set: brandVoice.seriesOverrides too many entries');
        }
        const out: NonNullable<AiSettingsRow['brandVoice']['seriesOverrides']> = {};
        for (const [key, val] of rows) {
          if (typeof key !== 'string' || key.length === 0 || key.length > 200) {
            throw new Error('ai:settings:set: seriesOverrides key must be string ≤ 200 chars');
          }
          if (!val || typeof val !== 'object' || Array.isArray(val)) {
            throw new Error(`ai:settings:set: seriesOverrides["${key}"] must be a plain object`);
          }
          const v = val as Record<string, unknown>;
          const entry: { pov?: string; toneWords?: string[]; bannedWords?: string[] } = {};
          if (v.pov !== undefined) {
            if (typeof v.pov !== 'string' || v.pov.length > 256) {
              throw new Error(`ai:settings:set: seriesOverrides["${key}"].pov must be string ≤ 256 chars`);
            }
            entry.pov = v.pov;
          }
          if (v.toneWords !== undefined) {
            entry.toneWords = stringArray(v.toneWords, `seriesOverrides["${key}"].toneWords`);
          }
          if (v.bannedWords !== undefined) {
            entry.bannedWords = stringArray(v.bannedWords, `seriesOverrides["${key}"].bannedWords`);
          }
          // Skip rows that are completely empty after validation.
          if (entry.pov !== undefined || entry.toneWords || entry.bannedWords) {
            out[key] = entry;
          }
        }
        seriesOverrides = Object.keys(out).length > 0 ? out : undefined;
      }

      const brandVoice: AiSettingsRow['brandVoice'] = {
        pov: typeof bv.pov === 'string' ? bv.pov.slice(0, 256) : '',
        toneWords: stringArray(bv.toneWords, 'toneWords'),
        bannedWords: stringArray(bv.bannedWords, 'bannedWords'),
        ...(seriesOverrides ? { seriesOverrides } : {}),
      };
      localStore.mutate((state) => {
        state.ai_settings = { claudeKey: p.claudeKey as string, models, brandVoice };
      });
    },
  );

  /**
   * Hit Anthropic /v1/messages with the supplied key + model. Returns
   * {ok, status, error?}. We use net.fetch (proxy-aware). 5s timeout —
   * a real Anthropic call usually responds in <2s; if it stalls we want to
   * surface a clear error instead of hanging the renderer.
   */
  ipcMain.handle(
    IpcChannel.AiTestKey,
    async (_evt, key: unknown, model: unknown): Promise<AiTestKeyResult> => {
      if (typeof key !== 'string' || key.length === 0) {
        return { ok: false, status: 0, error: 'key must be a non-empty string' };
      }
      if (key.length > 1024) {
        return { ok: false, status: 0, error: 'key too long' };
      }
      const modelId =
        typeof model === 'string' && model.length > 0 && model.length <= 128
          ? model
          : DEFAULT_AI_SETTINGS.models.fast;
      try {
        const res = await net.fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: modelId,
            max_tokens: 8,
            messages: [{ role: 'user', content: 'ping' }],
          }),
          signal: AbortSignal.timeout(5_000),
        });
        if (res.ok) {
          return { ok: true, status: res.status };
        }
        // 4xx/5xx — extract Anthropic error.message if available.
        let errMsg = `HTTP ${res.status}`;
        try {
          const txt = await res.text();
          if (txt) {
            try {
              const j = JSON.parse(txt) as { error?: { message?: string } };
              if (j?.error?.message) errMsg = j.error.message;
            } catch {
              errMsg = txt.slice(0, 256);
            }
          }
        } catch {
          // Ignore body-read failure — keep generic HTTP-status error.
        }
        return { ok: false, status: res.status, error: errMsg };
      } catch (err) {
        if (isTimeoutError(err)) {
          return { ok: false, status: 0, error: 'Request timed out' };
        }
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, status: 0, error: message };
      }
    },
  );

  // ====== Phase J.7 Lane G: AI Advisor SSE streaming ======
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

  // ====== Phase L Lane A: AI one-shot generation ======
  // Renderer dispatches `ai:generate` with {task, asin, currentText, guidance}.
  // We compose a task-specific system prompt, optionally fetch the book's
  // metadata (title/subtitle/author/language) so the AI has context, then
  // call Anthropic via the wrapper. Throws verbatim error messages
  // ("Claude API key not configured — set in Settings → AI") so the renderer
  // can show them inline without re-mapping.
  ipcMain.handle(
    IpcChannel.AiGenerate,
    async (_evt, payload: unknown): Promise<AiGenerateResult> => {
      // --- Strict shape validation: compromised renderer must not be able to
      //     inject arbitrary prompts that ignore our task taxonomy. ---
      if (!payload || typeof payload !== 'object') {
        throw new Error('ai:generate expects an object');
      }
      const p = payload as Partial<AiGeneratePayload>;
      const validTasks: ReadonlySet<AiGenerateTask> = new Set([
        'title', 'subtitle', 'description', 'bullets', 'aPlus', 'ask',
      ]);
      if (typeof p.task !== 'string' || !validTasks.has(p.task as AiGenerateTask)) {
        throw new Error(`ai:generate: task must be one of ${[...validTasks].join('|')}`);
      }
      // ASIN: optional, but if provided must look ASIN-ish (B0... — letters/digits).
      // Loose check to avoid breaking on legitimate edge cases; main isn't an
      // ASIN validator. Length cap protects against megabyte-string DoS.
      if (p.asin !== undefined) {
        if (typeof p.asin !== 'string' || p.asin.length > 32) {
          throw new Error('ai:generate: asin must be a string ≤ 32 chars');
        }
      }
      if (p.currentText !== undefined) {
        if (typeof p.currentText !== 'string' || p.currentText.length > 16_000) {
          throw new Error('ai:generate: currentText must be a string ≤ 16000 chars');
        }
      }
      if (p.guidance !== undefined) {
        if (typeof p.guidance !== 'string' || p.guidance.length > 4_000) {
          throw new Error('ai:generate: guidance must be a string ≤ 4000 chars');
        }
      }
      if (p.prompt !== undefined) {
        if (typeof p.prompt !== 'string' || p.prompt.length > 8_000) {
          throw new Error('ai:generate: prompt must be a string ≤ 8000 chars');
        }
      }
      if (p.context !== undefined) {
        if (p.context === null || typeof p.context !== 'object' || Array.isArray(p.context)) {
          throw new Error('ai:generate: context must be a plain object');
        }
      }
      if (p.seriesName !== undefined) {
        if (typeof p.seriesName !== 'string' || p.seriesName.length > 200) {
          throw new Error('ai:generate: seriesName must be a string ≤ 200 chars');
        }
      }

      const task = p.task as AiGenerateTask;
      const aiSettings: AiSettingsRow = localStore.read().ai_settings ?? DEFAULT_AI_SETTINGS;
      const model = aiSettings.models.completion || DEFAULT_AI_SETTINGS.models.completion;

      // --- Compose the task-specific system prompt. Keep them small and
      //     deterministic — large prompts pile up cost; specifics live in the
      //     user message below. Phase M.2: merge per-series brand-voice
      //     override on top of the base profile before composing. ---
      const effectiveBrandVoice = mergeForSeries(aiSettings.brandVoice, p.seriesName);
      const brandVoiceHint = describeBrandVoice(effectiveBrandVoice);
      const system = buildSystemPrompt(task, brandVoiceHint);
      const userMessage = buildUserMessage(task, p);

      // --- Hit the Anthropic API. Errors propagate verbatim (incl. the
      //     "key not configured" sentinel from the wrapper). ---
      const text = await anthropicGenerate({
        model,
        system,
        messages: [{ role: 'user', content: userMessage }],
        maxTokens: task === 'description' || task === 'aPlus' ? 2048 : 1024,
        // Cache the system prompt: task-specific text is reused across regenerates.
        cacheSystem: true,
      });

      // --- Optional rationale split: Listing Studio tasks ask the model to
      //     end with a single-line `Rationale: ...`. If we find it, we lift
      //     the line into `result.rationale` so the UI can render it apart. ---
      const { primary, rationale } = splitRationale(text);
      return { text: primary, rationale, model };
    },
  );

  // ====== Phase K: Tier-gating skeleton ======
  // Renderer тянет entitlements синхронно через get() (на mount), и подписывается
  // на push EntitlementsChanged через onChange(). refresh() форсит fetch — это
  // нужно, например, после обновления подписки в внешнем браузере (renderer
  // не знает когда юзер вернулся с success-страницы биллинга).

  ipcMain.handle(IpcChannel.EntitlementsGet, async (): Promise<Entitlements> => {
    return getCurrentEntitlements();
  });

  ipcMain.handle(IpcChannel.EntitlementsRefresh, async (): Promise<Entitlements> => {
    return refreshEntitlements();
  });

  // ====== Phase L.2 Lane B: Auto-Negativator scheduler ======
  // Renderer'у нужны 5 IPC-каналов: get state, toggle on/off, run-now, get/set
  // thresholds. Все вызовы маршрутизируются в синглтон main/automation/index.ts,
  // который сам ведёт state в local-db.

  ipcMain.handle(IpcChannel.AutoNegGetState, async (): Promise<AutoNegState> => {
    return getAutoNegativator().getState();
  });

  ipcMain.handle(
    IpcChannel.AutoNegToggle,
    async (_evt, enabled: unknown): Promise<AutoNegState> => {
      if (typeof enabled !== 'boolean') {
        throw new Error('auto-neg:toggle expects boolean');
      }
      return getAutoNegativator().toggle(enabled);
    },
  );

  ipcMain.handle(
    IpcChannel.AutoNegRunNow,
    async (): Promise<AutoNegScanResult> => {
      return getAutoNegativator().runNow();
    },
  );

  ipcMain.handle(
    IpcChannel.AutoNegSettingsGet,
    async (): Promise<AutoNegThresholds> => {
      return getAutoNegativator().getThresholds();
    },
  );

  ipcMain.handle(
    IpcChannel.AutoNegSettingsSet,
    async (_evt, payload: unknown): Promise<AutoNegThresholds> => {
      if (!payload || typeof payload !== 'object') {
        throw new Error('auto-neg:settings:set expects object');
      }
      const p = payload as Partial<AutoNegThresholds>;
      // Тип-валидация: scanner.setThresholds дополнительно clamp'ит значения
      // в безопасный диапазон. Здесь — только базовая защита от crap-shape.
      const next: AutoNegThresholds = {
        minClicks:
          typeof p.minClicks === 'number' && Number.isFinite(p.minClicks)
            ? p.minClicks
            : 10,
        minAcosMultiplier:
          typeof p.minAcosMultiplier === 'number' && Number.isFinite(p.minAcosMultiplier)
            ? p.minAcosMultiplier
            : 1.5,
        minOrdersForAcos:
          typeof p.minOrdersForAcos === 'number' && Number.isFinite(p.minOrdersForAcos)
            ? p.minOrdersForAcos
            : 2,
      };
      return getAutoNegativator().setThresholds(next);
    },
  );

  // ====== Phase M.5 Lane E: Weekly Author Briefing ======
  // Renderer вызывает getLast() для dashboard card и list() для full page.
  // runNow() форсит немедленный AI run, возвращает результат (или error). Push:
  // BriefingChanged эмитится из main при каждом завершении run'а (cron или
  // manual) — renderer ре-фетчит без polling'а.

  ipcMain.handle(
    IpcChannel.BriefingGetLast,
    async (): Promise<WeeklyBriefing | null> => {
      return getWeeklyBriefer().getLastBriefing();
    },
  );

  ipcMain.handle(
    IpcChannel.BriefingList,
    async (): Promise<WeeklyBriefing[]> => {
      return getWeeklyBriefer().list();
    },
  );

  ipcMain.handle(
    IpcChannel.BriefingRunNow,
    async (): Promise<BriefingRunResult> => {
      return getWeeklyBriefer().runNow();
    },
  );

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
        const resolved = nodePath.resolve(payload.path);
        const stat = fs.statSync(resolved);
        if (!stat.isFile()) {
          throw new Error('cover-qa:check: path is not a regular file');
        }
        buffer = fs.readFileSync(resolved);
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

  // ====== Phase N: Telemetry consent (stub) ======
  // Persist user consent in local-db; mirror runtime gate into telemetry
  // module. Today the module is a no-op — these handlers exist so the UI
  // can be built end-to-end before the real transport lands.

  ipcMain.handle(IpcChannel.TelemetryGetConsent, async (): Promise<boolean> => {
    const state = localStore.read();
    return state.telemetry_consent === true;
  });

  ipcMain.handle(
    IpcChannel.TelemetrySetConsent,
    async (_evt, consent: unknown): Promise<void> => {
      if (typeof consent !== 'boolean') {
        throw new Error('telemetry:setConsent expects a boolean');
      }
      localStore.mutate((state) => {
        state.telemetry_consent = consent;
      });
      telemetrySetConsent(consent);
    },
  );
}
