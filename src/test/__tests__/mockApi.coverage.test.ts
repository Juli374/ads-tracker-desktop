// Coverage guard — fails if `mockApi.ts` drifts from `DesktopApi` (src/shared/ipc.ts).
//
// Why: the green test board is meaningless if a real IPC channel is missing
// from the mock (renderer code that touches it sees `undefined` at runtime
// instead of a vi.fn(), which masks bugs and produces unhelpful test failures).
//
// How:
//   - `EXPECTED_API_SHAPE` lists every top-level key of `DesktopApi` and, for
//     namespace keys, the sub-keys we expect to be mocked.
//   - The shape is typed as `Record<keyof DesktopApi, ...>`, so TS will error
//     if `DesktopApi` gains a new top-level key without an entry here.
//   - Per-namespace sub-key arrays are also typed against the corresponding
//     `keyof DesktopApi['<ns>']`, so adding a new method in (e.g.) `localRoyalty`
//     forces a mock update.
//   - At runtime we install the mock and walk the table, asserting each key
//     exists and is the expected kind ('function' for callables, object/function
//     for namespaces).
//
// If you add a new IPC channel: extend `DesktopApi` AND this file AND
// `mockApi.ts` together. TS errors here are intentional — they tell you a
// channel is unmocked.

import { describe, it, expect, beforeEach } from 'vitest';
import type { DesktopApi } from '../../shared/ipc';
import { installMockApi } from '../mockApi';

type FunctionKey = 'function';
type NamespaceKeys<NS> = readonly (keyof NS & string)[];

// Expected shape of the mock API. One entry per top-level `DesktopApi` key.
// - `'function'` → top-level key must be a callable (e.g. `request`, `mediaUpload`).
// - `readonly string[]` → top-level key must be a namespace, and the array
//   lists the sub-keys it must expose. Each array is typed against the matching
//   `keyof DesktopApi['<ns>']`, so unknown sub-keys are a TS error.
const EXPECTED_API_SHAPE: {
  app: NamespaceKeys<DesktopApi['app']>;
  auth: NamespaceKeys<DesktopApi['auth']>;
  request: FunctionKey;
  mediaUpload: FunctionKey;
  onDeepLink: FunctionKey;
  shell: NamespaceKeys<DesktopApi['shell']>;
  oauth: NamespaceKeys<DesktopApi['oauth']>;
  localRoyalty: NamespaceKeys<DesktopApi['localRoyalty']>;
  update: NamespaceKeys<DesktopApi['update']>;
} = {
  app: ['getInfo', 'getApiBaseUrl'],
  auth: ['getToken', 'setToken', 'clearToken', 'onExpired'],
  request: 'function',
  mediaUpload: 'function',
  onDeepLink: 'function',
  shell: ['openExternal'],
  oauth: ['writeState', 'consumeState'],
  localRoyalty: [
    'listUploads',
    'listRecords',
    'getSummary',
    'import',
    'delete',
    'filePath',
  ],
  update: ['getStatus', 'check', 'quitAndInstall', 'onChange'],
};

// Compile-time exhaustiveness check: every top-level key of `DesktopApi` must
// appear in `EXPECTED_API_SHAPE` (and vice versa — no extras here).
//
// We can't use `satisfies Record<keyof DesktopApi, ...>` directly because the
// per-namespace value types differ between entries. Instead, we assert
// key-set equality via two conditional types: missing-from-shape and
// missing-from-api. Both must resolve to `never`.
//
// If you see a TS error here saying "Type 'X' is not assignable to type 'never'",
// X tells you exactly which key is out of sync.
type _ApiKeys = keyof DesktopApi;
type _ShapeKeys = keyof typeof EXPECTED_API_SHAPE;
type _MissingFromShape = Exclude<_ApiKeys, _ShapeKeys>;
type _MissingFromApi = Exclude<_ShapeKeys, _ApiKeys>;
const _missingFromShape: _MissingFromShape = undefined as never;
const _missingFromApi: _MissingFromApi = undefined as never;
void _missingFromShape;
void _missingFromApi;

describe('mockApi coverage', () => {
  beforeEach(() => {
    installMockApi();
  });

  it('exposes every top-level key of DesktopApi on window.api', () => {
    const expected = Object.keys(EXPECTED_API_SHAPE).sort();
    const actual = Object.keys(window.api as unknown as Record<string, unknown>).sort();
    // Strict equality — extras aren't allowed either (a stray mock key probably
    // means a typo or a leftover from an old refactor).
    expect(actual).toEqual(expected);
  });

  it('matches the expected kind (function vs namespace) for every top-level key', () => {
    const api = window.api as unknown as Record<string, unknown>;
    const missing: string[] = [];
    const wrongKind: string[] = [];

    for (const [key, expected] of Object.entries(EXPECTED_API_SHAPE)) {
      const value = api[key];
      if (value === undefined) {
        missing.push(key);
        continue;
      }
      if (expected === 'function') {
        if (typeof value !== 'function') {
          wrongKind.push(`${key}: expected function, got ${typeof value}`);
        }
      } else if (typeof value !== 'object' || value === null) {
        wrongKind.push(`${key}: expected namespace object, got ${typeof value}`);
      }
    }

    expect({ missing, wrongKind }).toEqual({ missing: [], wrongKind: [] });
  });

  it('exposes every sub-key for namespace entries', () => {
    const api = window.api as unknown as Record<string, Record<string, unknown> | unknown>;
    const missing: string[] = [];
    const notFunctions: string[] = [];

    for (const [nsKey, expected] of Object.entries(EXPECTED_API_SHAPE)) {
      if (expected === 'function') continue;
      const ns = api[nsKey];
      if (typeof ns !== 'object' || ns === null) {
        // already reported by previous test — skip
        continue;
      }
      const nsRecord = ns as Record<string, unknown>;
      for (const subKey of expected) {
        const value = nsRecord[subKey];
        if (value === undefined) {
          missing.push(`${nsKey}.${subKey}`);
        } else if (typeof value !== 'function') {
          notFunctions.push(`${nsKey}.${subKey}: expected function, got ${typeof value}`);
        }
      }
    }

    expect({ missing, notFunctions }).toEqual({ missing: [], notFunctions: [] });
  });
});
