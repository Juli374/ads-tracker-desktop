// Phase R — user-controlled module-activation store (progressive disclosure).
//
// The SECOND visibility axis, orthogonal to entitlements. Mirrors the shape of
// src/main/entitlements.ts (in-memory read + per-window push) but WITHOUT the
// network / refresh / expiry / logout-wipe: activation is a local, user-owned
// preference that survives logout. Persistence lives in local-db
// (module_activation + modules_seen); this module is the main-process gateway
// the IPC handlers call.
//
// Telemetry: every activate/deactivate emits via the existing consent-gated
// track() seam (a no-op today). The real activation-analytics pipeline
// (→ backend DB → ads-tracker-admin) is a separate, deferred task; emitting here
// means the call sites are already in place when transport lands. Props are
// PII-free (module id + source + timestamp only).

import { BrowserWindow } from 'electron';
import { localStore, ModuleActivationRow, ModuleActivationSource } from './local-db';
import { IpcChannel, ModuleActivationState } from '../shared/ipc';
import { ALL_MODULE_IDS, DEFAULT_ACTIVE_MODULES, isModuleId, moduleById } from '../shared/modules';
import { track } from './telemetry';

// Deliberate user actions (everything except the system 'default').
type UserSource = Exclude<ModuleActivationSource, 'default'>; // 'user' | 'enable_all' | 'reset'

function isStarter(id: string): boolean {
  return (DEFAULT_ACTIVE_MODULES as readonly string[]).includes(id);
}

function buildState(): ModuleActivationState {
  const s = localStore.read();
  const ma = s.module_activation ?? {};
  const seen = new Set(s.modules_seen ?? ALL_MODULE_IDS);
  const modules: ModuleActivationState['modules'] = {};
  for (const id of ALL_MODULE_IDS) {
    const row = ma[id];
    modules[id] = {
      enabled: row?.enabled ?? isStarter(id),
      activatedAt: row?.activatedAt ?? null,
      source: row?.source ?? 'default',
    };
  }
  return {
    modules,
    newModuleIds: ALL_MODULE_IDS.filter((id) => !seen.has(id)),
  };
}

function broadcast(state: ModuleActivationState): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send(IpcChannel.FeatureActivationChanged, state);
    } catch {
      // window closed between isDestroyed() and send() — ignore
    }
  }
}

/** Current activation snapshot (always read fresh from local-db). */
export function getActivation(): ModuleActivationState {
  return buildState();
}

/**
 * Toggle a single module. Rejects unknown ids and core modules (which are always
 * visible and must never be hideable). Persists, emits telemetry, broadcasts.
 */
export function setActivationModule(
  moduleId: string,
  enabled: boolean,
  source: UserSource = 'user',
): ModuleActivationState {
  if (!isModuleId(moduleId)) {
    throw new Error(`featureActivation: unknown module "${moduleId}"`);
  }
  if (moduleById(moduleId)?.core) {
    throw new Error(`featureActivation: core module "${moduleId}" cannot be toggled`);
  }
  localStore.mutate((state) => {
    const map: Record<string, ModuleActivationRow> = state.module_activation ?? {};
    map[moduleId] = {
      enabled,
      activatedAt: enabled ? new Date().toISOString() : null,
      source,
    };
    state.module_activation = map;
  });
  track({
    name: enabled ? 'feature.activation.enable' : 'feature.activation.disable',
    props: { module: moduleId, source, ts: Date.now() },
  });
  const state = buildState();
  broadcast(state);
  return state;
}

/**
 * Bulk toggle (Enable-all uses this). Silently skips unknown ids and core
 * modules. Whichever ids the renderer passes are applied — entitlement filtering
 * (skip fully-locked modules) is the renderer's responsibility, since it owns
 * the entitlement snapshot.
 */
export function setActivationMany(
  moduleIds: string[],
  enabled: boolean,
  source: Extract<UserSource, 'enable_all' | 'reset'> = 'enable_all',
): ModuleActivationState {
  const valid = moduleIds.filter((id) => isModuleId(id) && !moduleById(id)?.core);
  localStore.mutate((state) => {
    const map: Record<string, ModuleActivationRow> = state.module_activation ?? {};
    const now = new Date().toISOString();
    for (const id of valid) {
      map[id] = { enabled, activatedAt: enabled ? now : null, source };
    }
    state.module_activation = map;
  });
  track({
    name: 'feature.activation.enable_all',
    props: { count: valid.length, enabled, source, ts: Date.now() },
  });
  const state = buildState();
  broadcast(state);
  return state;
}

/** Restore the Starter set: non-core defaults on, everything else off. */
export function resetActivation(): ModuleActivationState {
  localStore.mutate((state) => {
    const map: Record<string, ModuleActivationRow> = {};
    const now = new Date().toISOString();
    for (const id of ALL_MODULE_IDS) {
      const on = isStarter(id);
      map[id] = { enabled: on, activatedAt: on ? now : null, source: 'reset' };
    }
    state.module_activation = map;
  });
  track({ name: 'feature.activation.reset', props: { ts: Date.now() } });
  const state = buildState();
  broadcast(state);
  return state;
}

/** Mark every currently-known module as "seen" → clears the "New" badge. */
export function markActivationSeen(): ModuleActivationState {
  localStore.mutate((state) => {
    state.modules_seen = [...ALL_MODULE_IDS];
  });
  const state = buildState();
  broadcast(state);
  return state;
}
