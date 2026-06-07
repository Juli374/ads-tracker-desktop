// Phase R — local-db persistence + migration for user-controlled module activation.
//
// Mocks `electron` so the store points at an isolated tmp dir and uses the
// plaintext path (safeStorage unavailable) for simplicity. Asserts: fresh
// install seeds the Starter set; a pre-feature install (no module_activation on
// disk) migrates everything ON (so an update never hides pages); a present map
// fills newly-shipped modules with their registry default; core is forced on;
// bad sources are coerced.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const hoisted = vi.hoisted(() => ({ state: { userDataDir: '' } }));

vi.mock('electron', () => ({
  app: { getPath: () => hoisted.state.userDataDir },
  safeStorage: { isEncryptionAvailable: () => false },
}));

import { localStore } from '../index';
import { ALL_MODULE_IDS, DEFAULT_ACTIVE_MODULES } from '../../../shared/modules';

const PLAIN_FILE = 'local-db.json';
function plainPath(): string {
  return path.join(hoisted.state.userDataDir, PLAIN_FILE);
}
function seed(partial: Record<string, unknown>): void {
  const base = {
    version: 5,
    royalty_uploads: [],
    royalty_records: [],
    next_upload_id: 1,
    next_record_id: 1,
  };
  fs.writeFileSync(plainPath(), JSON.stringify({ ...base, ...partial }), { mode: 0o600 });
}

beforeEach(() => {
  hoisted.state.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localdb-fa-'));
});
afterEach(() => {
  try {
    fs.rmSync(hoisted.state.userDataDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('local-db module activation', () => {
  it('fresh install seeds the Starter set on, the rest off', () => {
    const s = localStore.read(); // no file → freshEmptyState
    const ma = s.module_activation ?? {};
    for (const id of ALL_MODULE_IDS) {
      const expectedOn = (DEFAULT_ACTIVE_MODULES as readonly string[]).includes(id);
      expect(ma[id]?.enabled, id).toBe(expectedOn);
    }
    expect([...(s.modules_seen ?? [])].sort()).toEqual([...ALL_MODULE_IDS].sort());
  });

  it('pre-feature install (no module_activation on disk) migrates everything ON', () => {
    seed({}); // legacy store with no module_activation field
    const s = localStore.read();
    for (const id of ALL_MODULE_IDS) {
      expect(s.module_activation?.[id]?.enabled, id).toBe(true);
    }
  });

  it('present map fills a newly-shipped (missing) module with its registry default', () => {
    seed({
      module_activation: {
        core: { enabled: true, activatedAt: null, source: 'default' },
        ads_core: { enabled: true, activatedAt: null, source: 'user' },
      },
      modules_seen: ['core', 'ads_core'],
    });
    const s = localStore.read();
    // missing + defaultOn:false → off
    expect(s.module_activation?.ads_advanced?.enabled).toBe(false);
    // missing + defaultOn:true (Starter) → on
    expect(s.module_activation?.finance_royalty?.enabled).toBe(true);
    // existing user choice preserved
    expect(s.module_activation?.ads_core?.enabled).toBe(true);
  });

  it('forces core enabled even if the on-disk value says otherwise', () => {
    seed({ module_activation: { core: { enabled: false, activatedAt: null, source: 'user' } } });
    expect(localStore.read().module_activation?.core?.enabled).toBe(true);
  });

  it('coerces an invalid source to "default"', () => {
    seed({ module_activation: { ads_core: { enabled: true, activatedAt: null, source: 'bogus' } } });
    expect(localStore.read().module_activation?.ads_core?.source).toBe('default');
  });

  it('round-trips a module_activation mutation', () => {
    localStore.read();
    localStore.mutate((st) => {
      st.module_activation = st.module_activation ?? {};
      st.module_activation.analytics = {
        enabled: true,
        activatedAt: '2026-06-07T00:00:00.000Z',
        source: 'user',
      };
    });
    expect(localStore.read().module_activation?.analytics?.enabled).toBe(true);
  });
});
