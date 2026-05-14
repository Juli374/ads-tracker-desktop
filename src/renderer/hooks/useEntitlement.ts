// Phase K — Per-feature lookup hook for renderer components.
//
// Usage:
//   const { on, state, tierRequired } = useEntitlement('ai.advisor_panel');
//   if (!on) return <UpgradeNudge tier={tierRequired} />;
//
// `tierRequired` берётся из shared DEFAULT_TIER_FOR_FEATURE — это static
// mapping для UX-целей (CTA "Upgrade to Pro" / "Upgrade to Business").

import { useMemo } from 'react';
import {
  DEFAULT_TIER_FOR_FEATURE,
  FeatureKey,
  FeatureState,
  isFeatureOn,
  Tier,
} from '../../shared/entitlements';
import { useEntitlements } from '../contexts/EntitlementsContext';

export interface UseEntitlementResult {
  /** True если фича доступна (включая trial-период). */
  on: boolean;
  /** Полное state от сервера/cache — нужно для off.reason / trial.until UX'а. */
  state: FeatureState;
  /** Минимальный tier, в котором фича доступна. Используется для CTA modal'а. */
  tierRequired: Tier;
}

const FALLBACK_OFF: FeatureState = { state: 'off', reason: 'tier' };

export function useEntitlement(key: FeatureKey): UseEntitlementResult {
  const { entitlements } = useEntitlements();

  return useMemo<UseEntitlementResult>(() => {
    const override = entitlements.overrides?.[key];
    const base = entitlements.features[key];
    const effective: FeatureState = override ?? base ?? FALLBACK_OFF;
    return {
      on: isFeatureOn(entitlements, key),
      state: effective,
      tierRequired: DEFAULT_TIER_FOR_FEATURE[key],
    };
  }, [entitlements, key]);
}
