// Phase R — the two-axis visibility resolver.
//
//   isViewVisible(view) = core  OR  (module activated  AND  view entitled)
//
// "activated" comes from FeatureActivationContext (user-owned, local);
// "entitled" comes from EntitlementsContext (server, paid) and is resolved
// PER-VIEW via featureForView, because a module can mix free and paid pages
// (e.g. ads_advanced: `automation` is paid, `operations` is free).

import { useCallback } from 'react';
import { useFeatureActivation } from '../contexts/FeatureActivationContext';
import { useEntitlements } from '../contexts/EntitlementsContext';
import { featureForView, moduleForView, type ModuleId } from '../../shared/modules';
import type { ViewId } from '../../shared/views';

export function useModuleActivation() {
  const { state, setModule, setMany, reset, markSeen } = useFeatureActivation();
  const { isOn } = useEntitlements();

  const isModuleActive = useCallback(
    (id: ModuleId): boolean => state.modules[id]?.enabled ?? false,
    [state],
  );

  const isViewVisible = useCallback(
    (v: ViewId): boolean => {
      const m = moduleForView(v);
      if (!m) return true; // unknown view → fail-open
      if (m.core) return true; // core: always visible
      if (!(state.modules[m.id]?.enabled ?? false)) return false; // not activated
      const fk = featureForView(v);
      return fk ? isOn(fk) : true; // per-view entitlement
    },
    [state, isOn],
  );

  return {
    state,
    isModuleActive,
    isViewVisible,
    setModuleActive: setModule,
    setManyModules: setMany,
    resetModules: reset,
    markModulesSeen: markSeen,
    newModuleIds: state.newModuleIds as ModuleId[],
  };
}
