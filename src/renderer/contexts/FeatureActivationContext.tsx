// Phase R — renderer-side wrapper around main's module-activation store.
//
// Mirrors EntitlementsContext (get-then-subscribe) but for the user-owned
// ACTIVATION axis. Hydrates its initial state synchronously from a localStorage
// cache (the same pattern as ThemeContext) so the sidebar doesn't flash on
// launch, then reconciles with main via get() + onChange().

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ModuleActivationState } from '../../shared/ipc';
import { ALL_MODULE_IDS } from '../../shared/modules';

interface FeatureActivationContextValue {
  state: ModuleActivationState;
  setModule(moduleId: string, enabled: boolean, source?: string): Promise<void>;
  setMany(moduleIds: string[], enabled: boolean, source?: string): Promise<void>;
  reset(): Promise<void>;
  markSeen(): Promise<void>;
}

const LS_CACHE_KEY = 'featureActivation:lastState';

// Fail-open default: everything enabled. Used before the first IPC read resolves
// (only on the very first launch, when no cache exists) and as the no-Provider
// fallback — so nothing is ever wrongly hidden.
function allEnabledState(): ModuleActivationState {
  const modules: ModuleActivationState['modules'] = {};
  for (const id of ALL_MODULE_IDS) {
    modules[id] = { enabled: true, activatedAt: null, source: 'default' };
  }
  return { modules, newModuleIds: [] };
}

function loadCachedState(): ModuleActivationState | null {
  try {
    const raw = window.localStorage.getItem(LS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && 'modules' in parsed) {
      return parsed as ModuleActivationState;
    }
  } catch {
    // ignore corrupt cache
  }
  return null;
}

function cacheState(state: ModuleActivationState): void {
  try {
    window.localStorage.setItem(LS_CACHE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / unavailable
  }
}

const FeatureActivationContext = createContext<FeatureActivationContextValue | null>(null);

export const FeatureActivationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<ModuleActivationState>(
    () => loadCachedState() ?? allEnabledState(),
  );
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const apply = useCallback((next: ModuleActivationState | undefined | null) => {
    if (!next || !mountedRef.current) return;
    setState(next);
    cacheState(next);
  }, []);

  // Initial fetch via IPC. If api.featureActivation is absent (older preload /
  // tests) we keep the cached/all-on fallback — nothing gets hidden.
  useEffect(() => {
    if (typeof window.api?.featureActivation?.get !== 'function') return;
    let cancelled = false;
    void (async () => {
      try {
        const next = await window.api.featureActivation.get();
        if (!cancelled) apply(next);
      } catch {
        // ignore — keep fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apply]);

  // Push-subscription — main broadcasts on every change (from any window).
  useEffect(() => {
    if (typeof window.api?.featureActivation?.onChange !== 'function') return;
    return window.api.featureActivation.onChange((next) => apply(next));
  }, [apply]);

  const setModule = useCallback(
    async (moduleId: string, enabled: boolean, source?: string) => {
      if (typeof window.api?.featureActivation?.set !== 'function') return;
      try {
        apply(await window.api.featureActivation.set(moduleId, enabled, source));
      } catch {
        // main throws on core/unknown — the UI guards against that anyway
      }
    },
    [apply],
  );

  const setMany = useCallback(
    async (moduleIds: string[], enabled: boolean, source?: string) => {
      if (typeof window.api?.featureActivation?.setMany !== 'function') return;
      try {
        apply(await window.api.featureActivation.setMany(moduleIds, enabled, source));
      } catch {
        // ignore
      }
    },
    [apply],
  );

  const reset = useCallback(async () => {
    if (typeof window.api?.featureActivation?.reset !== 'function') return;
    try {
      apply(await window.api.featureActivation.reset());
    } catch {
      // ignore
    }
  }, [apply]);

  const markSeen = useCallback(async () => {
    if (typeof window.api?.featureActivation?.markSeen !== 'function') return;
    try {
      apply(await window.api.featureActivation.markSeen());
    } catch {
      // ignore
    }
  }, [apply]);

  const value = useMemo<FeatureActivationContextValue>(
    () => ({ state, setModule, setMany, reset, markSeen }),
    [state, setModule, setMany, reset, markSeen],
  );

  return (
    <FeatureActivationContext.Provider value={value}>
      {children}
    </FeatureActivationContext.Provider>
  );
};

// Defensive fallback (no Provider, e.g. legacy/smoke tests): everything enabled
// so nothing is hidden — mirrors EntitlementsContext's all-on fallback.
const FALLBACK_VALUE: FeatureActivationContextValue = {
  state: allEnabledState(),
  setModule: async () => undefined,
  setMany: async () => undefined,
  reset: async () => undefined,
  markSeen: async () => undefined,
};

export function useFeatureActivation(): FeatureActivationContextValue {
  return useContext(FeatureActivationContext) ?? FALLBACK_VALUE;
}
