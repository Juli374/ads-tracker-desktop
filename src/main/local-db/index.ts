// Локальное хранилище для данных, которые НЕ должны уходить на Railway:
// в первую очередь royalty (Amazon TOS запрещает третьим лицам хранить
// чужие royalty). Сейчас — JSON-файл в app.getPath('userData'); архитектура
// такая, что свопнуть на better-sqlite3 (или sql.js) — это поменять реализацию
// `LocalStore`, не трогая ни IPC, ни renderer.
//
// Важные инварианты:
// - Все мутации идут через atomic write (write-temp → rename), чтобы краш в
//   середине записи не оставлял повреждённый файл.
// - Чтение обёрнуто в try/catch с дефолтом — если файл повреждён, подставляем
//   пустой стейт и логируем (не падаем).
// - Schema-versioned: top-level поле `version` для будущих миграций.
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';

export const SCHEMA_VERSION = 1;

export interface RoyaltyUploadRow {
  id: number;
  account_id: number;
  account_name?: string;
  marketplace: string;
  target_month: string; // YYYY-MM
  uploaded_at: string;  // ISO
  source_filename?: string;
  total_units: number;
  total_royalty: number;
  total_revenue: number;
  currency?: string;
}

export interface RoyaltyRecordRow {
  id: number;
  upload_id: number;
  asin?: string;
  book_title?: string;
  marketplace: string;
  target_month: string;
  units: number;
  royalty: number;
  revenue: number;
  currency?: string;
}

export interface LocalDbState {
  version: number;
  royalty_uploads: RoyaltyUploadRow[];
  royalty_records: RoyaltyRecordRow[];
  // counter'ы для autoincrement-ID
  next_upload_id: number;
  next_record_id: number;
}

const EMPTY_STATE: LocalDbState = {
  version: SCHEMA_VERSION,
  royalty_uploads: [],
  royalty_records: [],
  next_upload_id: 1,
  next_record_id: 1,
};

function dbFilePath(): string {
  // app.getPath('userData') обычно ~/Library/Application Support/Ads Tracker.
  // Для тестов / случаев когда app не доступен — fallback на os.tmpdir().
  let base: string;
  try {
    base = app.getPath('userData');
  } catch {
    base = path.join(os.tmpdir(), 'ads-tracker-desktop');
  }
  return path.join(base, 'local-db.json');
}

function readState(): LocalDbState {
  const file = dbFilePath();
  if (!fs.existsSync(file)) return { ...EMPTY_STATE };
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as Partial<LocalDbState>;
    // Sanity-check + миграция дефолтами.
    return {
      version: parsed.version ?? SCHEMA_VERSION,
      royalty_uploads: Array.isArray(parsed.royalty_uploads) ? parsed.royalty_uploads : [],
      royalty_records: Array.isArray(parsed.royalty_records) ? parsed.royalty_records : [],
      next_upload_id: parsed.next_upload_id ?? 1,
      next_record_id: parsed.next_record_id ?? 1,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[local-db] corrupted file, using empty state:', err);
    return { ...EMPTY_STATE };
  }
}

function writeState(state: LocalDbState): void {
  const file = dbFilePath();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp`;
  // Crash-safe запись: write → fsync → close → rename. Без fsync rename
  // может пройти раньше реального flush, и при power-loss остаётся .tmp с
  // нулевыми байтами (security-finding #7).
  const buf = Buffer.from(JSON.stringify(state, null, 2), 'utf8');
  const fd = fs.openSync(tmp, 'w', 0o600);
  try {
    fs.writeSync(fd, buf, 0, buf.length, 0);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

// Простой fluent-store. Транзакция = mutate + write один раз.
export const localStore = {
  read(): LocalDbState {
    return readState();
  },

  mutate(update: (state: LocalDbState) => void): LocalDbState {
    const state = readState();
    update(state);
    writeState(state);
    return state;
  },

  reset(): void {
    writeState({ ...EMPTY_STATE });
  },

  filePath(): string {
    return dbFilePath();
  },
};
