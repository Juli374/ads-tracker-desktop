// DESKTOP-2 — at-rest encryption of the local royalty/AI store.
//
// We mock `electron` so that:
//   - `app.getPath('userData')` points at an isolated tmp dir per test;
//   - `safeStorage` is a reversible fake (base64 round-trip) whose availability
//     we can toggle, to exercise both the encrypted-primary path and the
//     plaintext-fallback path.
//
// The SUT (`localStore`) keeps its synchronous read/mutate/reset API; these
// tests assert that the on-disk representation is encrypted, that an existing
// plaintext store is migrated without data loss, and that a fallback to
// plaintext works when safeStorage is unavailable.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const hoisted = vi.hoisted(() => {
  const state = {
    userDataDir: '',
    encryptionAvailable: true,
    encryptShouldThrow: false,
  };
  return { state };
});

vi.mock('electron', () => ({
  app: {
    getPath: () => hoisted.state.userDataDir,
  },
  safeStorage: {
    isEncryptionAvailable: () => hoisted.state.encryptionAvailable,
    // Reversible fake "encryption": tag + base64 so we can both verify the
    // bytes are NOT plaintext JSON and round-trip them back.
    encryptString: (s: string): Buffer => {
      if (hoisted.state.encryptShouldThrow) throw new Error('keychain locked');
      return Buffer.from(`ENC:${Buffer.from(s, 'utf8').toString('base64')}`, 'utf8');
    },
    decryptString: (buf: Buffer): string => {
      const raw = buf.toString('utf8');
      if (!raw.startsWith('ENC:')) throw new Error('bad blob');
      return Buffer.from(raw.slice(4), 'base64').toString('utf8');
    },
  },
}));

// SUT after mocks.
import { localStore, SCHEMA_VERSION } from '../index';

const ENC_FILE = 'local-db.enc';
const PLAIN_FILE = 'local-db.json';

function encPath(): string {
  return path.join(hoisted.state.userDataDir, ENC_FILE);
}
function plainPath(): string {
  return path.join(hoisted.state.userDataDir, PLAIN_FILE);
}

beforeEach(() => {
  hoisted.state.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localdb-enc-'));
  hoisted.state.encryptionAvailable = true;
  hoisted.state.encryptShouldThrow = false;
});

afterEach(() => {
  try {
    fs.rmSync(hoisted.state.userDataDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('local-db at-rest encryption', () => {
  it('writes the store encrypted (no plaintext on disk) when safeStorage is available', () => {
    localStore.mutate((s) => {
      s.ai_settings.claudeKey = 'sk-super-secret';
    });

    expect(fs.existsSync(encPath())).toBe(true);
    expect(fs.existsSync(plainPath())).toBe(false);

    // The raw bytes must NOT contain the secret in cleartext.
    const onDisk = fs.readFileSync(encPath(), 'utf8');
    expect(onDisk.startsWith('ENC:')).toBe(true);
    expect(onDisk).not.toContain('sk-super-secret');

    // Round-trips back through read().
    expect(localStore.read().ai_settings.claudeKey).toBe('sk-super-secret');
  });

  it('migrates an existing plaintext store to encrypted on first read, without data loss', () => {
    // Seed a plaintext store as a legacy install would have left it.
    const legacy = {
      version: SCHEMA_VERSION,
      royalty_uploads: [
        {
          id: 1,
          account_id: 7,
          marketplace: 'USA',
          target_month: '2026-04',
          uploaded_at: '2026-04-30T00:00:00.000Z',
          total_units: 3,
          total_royalty: 12.5,
          total_revenue: 12.5,
        },
      ],
      royalty_records: [],
      next_upload_id: 2,
      next_record_id: 1,
    };
    fs.writeFileSync(plainPath(), JSON.stringify(legacy), { mode: 0o600 });

    const state = localStore.read();
    // Data survived the migration.
    expect(state.royalty_uploads).toHaveLength(1);
    expect(state.royalty_uploads[0].total_royalty).toBe(12.5);
    expect(state.next_upload_id).toBe(2);

    // Plaintext file removed, encrypted file created.
    expect(fs.existsSync(encPath())).toBe(true);
    expect(fs.existsSync(plainPath())).toBe(false);

    // Encrypted blob does not leak the data.
    const onDisk = fs.readFileSync(encPath(), 'utf8');
    expect(onDisk).not.toContain('2026-04');
  });

  it('keeps plaintext intact if encryption throws during migration (no data loss)', () => {
    const legacy = {
      version: SCHEMA_VERSION,
      royalty_uploads: [],
      royalty_records: [],
      next_upload_id: 1,
      next_record_id: 1,
      ai_settings: { claudeKey: 'keep-me', models: {}, brandVoice: {} },
    };
    fs.writeFileSync(plainPath(), JSON.stringify(legacy), { mode: 0o600 });

    // safeStorage reports available, but encryptString throws (e.g. keychain
    // momentarily locked). The migration must NOT delete the plaintext.
    hoisted.state.encryptionAvailable = true;
    hoisted.state.encryptShouldThrow = true;

    const state = localStore.read();
    expect(state.ai_settings.claudeKey).toBe('keep-me');

    // Plaintext survives; no encrypted file was written.
    expect(fs.existsSync(plainPath())).toBe(true);
    expect(fs.existsSync(encPath())).toBe(false);
  });

  it('falls back to plaintext (0o600) when safeStorage is unavailable', () => {
    hoisted.state.encryptionAvailable = false;

    localStore.mutate((s) => {
      s.ai_settings.claudeKey = 'plain-key';
    });

    expect(fs.existsSync(plainPath())).toBe(true);
    expect(fs.existsSync(encPath())).toBe(false);
    const mode = fs.statSync(plainPath()).mode & 0o777;
    expect(mode).toBe(0o600);

    expect(localStore.read().ai_settings.claudeKey).toBe('plain-key');
  });

  it('reset() clears state and round-trips through encryption', () => {
    localStore.mutate((s) => {
      s.ai_settings.claudeKey = 'to-be-cleared';
    });
    localStore.reset();
    expect(localStore.read().ai_settings.claudeKey).toBe('');
    expect(localStore.read().royalty_uploads).toEqual([]);
  });
});
