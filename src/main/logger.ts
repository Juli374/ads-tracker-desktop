// Phase I.2 Lane B — electron-log + crash visibility.
//
// Initializes a rotating log file in `app.getPath('logs')`:
//   - level=info (debug only when ADS_TRACKER_LOG_LEVEL=debug)
//   - fileName='ads-tracker.log' (under <userData>/logs/ on Linux/Win,
//     ~/Library/Logs/Ads Tracker/ on macOS — that is what app.getPath('logs')
//     returns)
//   - rotation: 2 MiB per file, max 5 archived files
//
// Exposes typed log functions plus `scrubSecrets` so callers can launder
// payloads before they hit disk. The renderer logs via IPC (`AppLog`) which
// is also scrubbed in the handler — defense in depth.
//
// IMPORTANT: do NOT import this from preload — preload runs sandboxed and
// must stay free of Node-side electron-log. Renderer goes through IPC.

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import log from 'electron-log/main';

// ---------- secret scrubbing ----------

const TOKEN_LIKE_PATTERNS: ReadonlyArray<RegExp> = [
  // Live API tokens — at_live_<chars>
  /at_live_[A-Za-z0-9_-]+/g,
  // Test API tokens — at_test_<chars>
  /at_test_[A-Za-z0-9_-]+/g,
  // JWTs are 3 dot-separated base64url segments. Match the common eyJ-prefix
  // (header `{"alg"...}` always base64-encodes to start with eyJ) and grab
  // up to two further dot segments to cover the whole token.
  /eyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){0,2}/g,
];

const BEARER_LITERAL = /Bearer\s+\S+/gi;

/**
 * Replace well-known token shapes with `***`. Safe to call on arbitrary
 * strings — non-matching input is returned unchanged. Used both before
 * showing errors to the user and before writing renderer-supplied payloads
 * to the log file.
 */
export function scrubSecrets(input: string): string {
  if (!input) return input;
  let out = input;
  for (const pat of TOKEN_LIKE_PATTERNS) {
    out = out.replace(pat, '***');
  }
  out = out.replace(BEARER_LITERAL, 'Bearer ***');
  return out;
}

/** Recursively scrub strings in arbitrary structures (used for renderer ctx). */
export function scrubValue<T>(value: T): T {
  if (typeof value === 'string') {
    return scrubSecrets(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => scrubValue(v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = scrubValue(v);
    }
    return result as unknown as T;
  }
  return value;
}

// ---------- file transport ----------

const LOG_FILE_NAME = 'ads-tracker.log';
const TWO_MIB = 2 * 1024 * 1024;
const MAX_ARCHIVED_FILES = 5;

let initialized = false;

/**
 * Initialise electron-log file transport. Idempotent — safe to call from
 * src/index.ts at the very top.
 */
export function initLogger(): void {
  if (initialized) return;
  initialized = true;

  // Resolve to <Logs>/ads-tracker.log. app.getPath('logs') returns the
  // OS-preferred location (~/Library/Logs/<appName> on macOS, %APPDATA%/<appName>/logs
  // on Windows, ~/.config/<appName>/logs on Linux).
  const logsDir = app.getPath('logs');
  const filePath = path.join(logsDir, LOG_FILE_NAME);

  log.transports.file.resolvePathFn = () => filePath;
  log.transports.file.fileName = LOG_FILE_NAME;
  log.transports.file.maxSize = TWO_MIB;
  // electron-log v5 keeps `<file>.old.log` then `<file>.old.<n>.log`.
  // archiveLogFn default keeps a single archive — we override to keep up to
  // MAX_ARCHIVED_FILES rotated copies.
  log.transports.file.archiveLogFn = (oldLogFile) => {
    try {
      const oldPath = oldLogFile.path;
      const dir = path.dirname(oldPath);
      const base = path.basename(oldPath, '.log');
      // Shift n -> n+1, drop the oldest beyond MAX_ARCHIVED_FILES.
      for (let i = MAX_ARCHIVED_FILES - 1; i >= 1; i--) {
        const src = path.join(dir, `${base}.old.${i}.log`);
        const dst = path.join(dir, `${base}.old.${i + 1}.log`);
        if (fs.existsSync(src)) {
          if (i + 1 > MAX_ARCHIVED_FILES) {
            try { fs.unlinkSync(src); } catch { /* ignore */ }
          } else {
            try { fs.renameSync(src, dst); } catch { /* ignore */ }
          }
        }
      }
      const baseOld = path.join(dir, `${base}.old.log`);
      if (fs.existsSync(baseOld)) {
        try { fs.renameSync(baseOld, path.join(dir, `${base}.old.1.log`)); } catch { /* ignore */ }
      }
      try { fs.renameSync(oldPath, baseOld); } catch { /* ignore */ }
    } catch {
      // never let archive errors crash the app — drop the rotation silently.
    }
  };

  const envLevel = process.env.ADS_TRACKER_LOG_LEVEL?.trim().toLowerCase();
  const validLevels = ['error', 'warn', 'info', 'verbose', 'debug', 'silly'] as const;
  type Level = typeof validLevels[number];
  const fileLevel: Level = (validLevels as readonly string[]).includes(envLevel ?? '')
    ? (envLevel as Level)
    : 'info';

  log.transports.file.level = fileLevel;
  // Console transport stays loud in dev, quiet in packaged builds.
  log.transports.console.level = app.isPackaged ? 'warn' : 'info';

  // Tag every line with the running version so cross-version log triage stays sane.
  log.variables.appVersion = app.getVersion();

  log.info('[logger] initialised', {
    file: filePath,
    level: fileLevel,
    maxSize: TWO_MIB,
    maxArchived: MAX_ARCHIVED_FILES,
  });
}

/** Absolute path to the active log file. Available after `initLogger()`. */
export function getLogFilePath(): string {
  return path.join(app.getPath('logs'), LOG_FILE_NAME);
}

// ---------- typed wrappers ----------

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

function emit(level: LogLevel, message: string, ctx?: Record<string, unknown>): void {
  const safeMessage = scrubSecrets(message);
  const safeCtx = ctx ? scrubValue(ctx) : undefined;
  if (safeCtx) {
    log[level](safeMessage, safeCtx);
  } else {
    log[level](safeMessage);
  }
}

export const logger = {
  error: (message: string, ctx?: Record<string, unknown>) => emit('error', message, ctx),
  warn: (message: string, ctx?: Record<string, unknown>) => emit('warn', message, ctx),
  info: (message: string, ctx?: Record<string, unknown>) => emit('info', message, ctx),
  debug: (message: string, ctx?: Record<string, unknown>) => emit('debug', message, ctx),
};
