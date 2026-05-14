// Phase L.2 Lane B — Auto-Negativator main-process singleton.
//
// Wires `AutoNegativator` class to real production dependencies:
//   - HTTP client = performApiRequest (proxy-aware net.fetch + auth headers)
//   - State store = localStore.read/mutate (atomic JSON file in userData)
//   - Push emitter = BrowserWindow.getAllWindows + webContents.send
//
// Re-exports the singleton so IPC handlers (and tests, via setInstance) have
// a single source of truth.

import { BrowserWindow } from 'electron';
import {
  AutoNegativator,
  defaultEmitChange,
  type AutoNegDeps,
} from './auto-negativator';
import { localStore, DEFAULT_AUTO_NEG } from '../local-db';
import { performApiRequest } from '../api-client';

let instance: AutoNegativator | null = null;

/**
 * Production wiring. Idempotent — multiple calls return the same instance.
 * Tests can swap via `setInstance()` (below) to inject stubs.
 */
export function getAutoNegativator(): AutoNegativator {
  if (instance) return instance;
  const deps: AutoNegDeps = {
    fetchFn: performApiRequest,
    readState: () => {
      const state = localStore.read();
      return state.auto_negativator ?? { ...DEFAULT_AUTO_NEG };
    },
    writeState: (partial) => {
      localStore.mutate((state) => {
        const current = state.auto_negativator ?? { ...DEFAULT_AUTO_NEG };
        state.auto_negativator = {
          ...current,
          ...partial,
          thresholds: partial.thresholds ?? current.thresholds,
        };
      });
    },
    emitChange: defaultEmitChange(BrowserWindow),
  };
  instance = new AutoNegativator(deps);
  return instance;
}

/** Tests only — replace the singleton (or reset to null). */
export function setInstance(next: AutoNegativator | null): void {
  if (instance && instance !== next) {
    instance.stop();
  }
  instance = next;
}
