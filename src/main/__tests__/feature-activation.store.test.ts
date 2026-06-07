// Phase R — main-process module-activation store: persistence + broadcast +
// telemetry + guardrails (core/unknown rejection).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const hoisted = vi.hoisted(() => ({
  state: { userDataDir: '' },
  sendSpy: vi.fn(),
  trackSpy: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { getPath: () => hoisted.state.userDataDir },
  safeStorage: { isEncryptionAvailable: () => false },
  BrowserWindow: {
    getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: hoisted.sendSpy } }],
  },
}));
vi.mock('../telemetry', () => ({ track: hoisted.trackSpy }));

import {
  getActivation,
  setActivationModule,
  setActivationMany,
  resetActivation,
  markActivationSeen,
} from '../feature-activation';
import { DEFAULT_ACTIVE_MODULES } from '../../shared/modules';

beforeEach(() => {
  hoisted.state.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fa-store-'));
  hoisted.sendSpy.mockClear();
  hoisted.trackSpy.mockClear();
});
afterEach(() => {
  try {
    fs.rmSync(hoisted.state.userDataDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('feature-activation store', () => {
  it('getActivation returns Starter defaults for a fresh install', () => {
    const s = getActivation();
    expect(s.modules.core.enabled).toBe(true);
    expect(s.modules.ads_core.enabled).toBe(true);
    expect(s.modules.finance_royalty.enabled).toBe(true);
    expect(s.modules.analytics.enabled).toBe(false);
    expect(s.modules.ai.enabled).toBe(false);
  });

  it('setActivationModule persists, broadcasts, and emits telemetry', () => {
    const s = setActivationModule('analytics', true, 'user');
    expect(s.modules.analytics.enabled).toBe(true);
    expect(getActivation().modules.analytics.enabled).toBe(true); // persisted to disk
    expect(hoisted.sendSpy).toHaveBeenCalledTimes(1); // broadcast to the one window
    expect(hoisted.trackSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'feature.activation.enable',
        props: expect.objectContaining({ module: 'analytics', source: 'user' }),
      }),
    );
  });

  it('disabling stamps activatedAt null and emits the disable event', () => {
    setActivationModule('analytics', true, 'user');
    hoisted.trackSpy.mockClear();
    const s = setActivationModule('analytics', false, 'user');
    expect(s.modules.analytics.enabled).toBe(false);
    expect(s.modules.analytics.activatedAt).toBeNull();
    expect(hoisted.trackSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'feature.activation.disable' }),
    );
  });

  it('rejects toggling a core module', () => {
    expect(() => setActivationModule('core', false)).toThrow();
  });

  it('rejects an unknown module id', () => {
    expect(() => setActivationModule('does-not-exist', true)).toThrow();
  });

  it('setActivationMany enables many and silently skips core/unknown', () => {
    const s = setActivationMany(['analytics', 'alerts', 'core', 'nope'], true, 'enable_all');
    expect(s.modules.analytics.enabled).toBe(true);
    expect(s.modules.alerts.enabled).toBe(true);
    expect(s.modules.core.enabled).toBe(true); // unchanged, always on
  });

  it('resetActivation restores the Starter set', () => {
    setActivationModule('analytics', true, 'user');
    setActivationModule('ai', true, 'user');
    const s = resetActivation();
    expect(s.modules.analytics.enabled).toBe(false);
    expect(s.modules.ai.enabled).toBe(false);
    for (const id of DEFAULT_ACTIVE_MODULES) {
      expect(s.modules[id].enabled, id).toBe(true);
    }
    expect(hoisted.trackSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'feature.activation.reset' }),
    );
  });

  it('markActivationSeen empties newModuleIds and broadcasts', () => {
    const s = markActivationSeen();
    expect(s.newModuleIds).toEqual([]);
    expect(hoisted.sendSpy).toHaveBeenCalled();
  });
});
