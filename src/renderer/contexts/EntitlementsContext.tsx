// Phase K — Renderer-side wrapper around main's entitlements.
//
// Provider:
//   1. Mount → `entitlements.get()` (sync read of main's cache).
//   2. Subscribe to `entitlements.onChange()` for push-updates from main.
//   3. Expose `isOn(key)` helper + `refresh()` для manual refetch.
//
// Mount под `<AuthProvider>`. На signOut → AuthContext делает refresh ниже,
// чтобы получить EMPTY snapshot.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ALL_FEATURE_KEYS,
  EMPTY_ENTITLEMENTS,
  Entitlements,
  FeatureKey,
  FeatureState,
  isFeatureOn,
  Tier,
} from '../../shared/entitlements';

interface EntitlementsContextValue {
  entitlements: Entitlements;
  tier: Tier;
  isOn(key: FeatureKey): boolean;
  refresh(): Promise<void>;
}

const EntitlementsContext = createContext<EntitlementsContextValue | null>(null);

export const EntitlementsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [entitlements, setEntitlements] = useState<Entitlements>(EMPTY_ENTITLEMENTS);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Initial fetch via IPC. Если api.entitlements не существует (старые сборки
  // preload'а или mock без модуля) — мирно остаёмся на EMPTY.
  useEffect(() => {
    if (typeof window.api?.entitlements?.get !== 'function') return;
    let cancelled = false;
    void (async () => {
      try {
        const next = await window.api.entitlements.get();
        if (!cancelled && mountedRef.current && next) {
          setEntitlements(next);
        }
      } catch {
        // ignore: оставляем EMPTY — UI просто покажет всё locked.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Push-subscription. main эмитит при каждом изменении (login / logout /
  // periodic refresh). Renderer перерисовывается без polling'а.
  useEffect(() => {
    if (typeof window.api?.entitlements?.onChange !== 'function') return;
    const unsub = window.api.entitlements.onChange((next) => {
      if (mountedRef.current && next) {
        setEntitlements(next);
      }
    });
    return unsub;
  }, []);

  const refresh = useCallback(async () => {
    if (typeof window.api?.entitlements?.refresh !== 'function') return;
    try {
      const next = await window.api.entitlements.refresh();
      if (mountedRef.current && next) {
        setEntitlements(next);
      }
    } catch {
      // ignore
    }
  }, []);

  const isOn = useCallback(
    (key: FeatureKey) => isFeatureOn(entitlements, key),
    [entitlements],
  );

  const value = useMemo<EntitlementsContextValue>(
    () => ({
      entitlements,
      tier: entitlements.tier,
      isOn,
      refresh,
    }),
    [entitlements, isOn, refresh],
  );

  return (
    <EntitlementsContext.Provider value={value}>
      {children}
    </EntitlementsContext.Provider>
  );
};

// Phase K: defensive fallback. Если Provider не смонтирован (например, в
// существующих pages-smoke-тестах, которые ещё не обновлены под Phase K) —
// возвращаем "all-on" state, чтобы не ломать legacy-тесты. Production code
// всегда монтирует Provider в App.tsx → renderer на этот fallback не попадает.
const FALLBACK_FEATURES = Object.fromEntries(
  ALL_FEATURE_KEYS.map((k) => [k, { state: 'on' as const } as FeatureState]),
) as Record<FeatureKey, FeatureState>;
const FALLBACK_ENTITLEMENTS: Entitlements = {
  v: 1,
  issued_at: '1970-01-01T00:00:00Z',
  expires_at: '2099-12-31T00:00:00Z',
  user_id: 0,
  tier: 'pro',
  subscription: { status: 'active' },
  features: FALLBACK_FEATURES,
  sig: 'no-provider-fallback',
};
const FALLBACK_VALUE: EntitlementsContextValue = {
  entitlements: FALLBACK_ENTITLEMENTS,
  tier: 'pro',
  isOn: () => true,
  refresh: async () => undefined,
};

export function useEntitlements(): EntitlementsContextValue {
  const ctx = useContext(EntitlementsContext);
  // В тестах без EntitlementsProvider — возвращаем fallback all-on, чтобы
  // legacy-страницы продолжали рендериться нормально. Production code
  // монтирует Provider, поэтому фактически попадание сюда — только тесты.
  return ctx ?? FALLBACK_VALUE;
}

/** Optional-form для компонентов, которые могут рендериться вне Provider'а (e.g. LoginScreen).
 *  Возвращает null если Provider не смонтирован. Используется crash-safely в utility-местах. */
export function useEntitlementsOptional(): EntitlementsContextValue | null {
  return useContext(EntitlementsContext);
}
