// Phase R — the two-axis visibility resolver truth table.
//
// Mocks the two source contexts so we can drive activation + entitlement state
// independently and assert isViewVisible() for representative views.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

interface Row {
  enabled: boolean;
  activatedAt: string | null;
  source: string;
}

const hoisted = vi.hoisted(() => ({
  activation: { modules: {} as Record<string, Row>, newModuleIds: [] as string[] },
  entitled: new Set<string>(),
}));

vi.mock('../../contexts/FeatureActivationContext', () => ({
  useFeatureActivation: () => ({
    state: hoisted.activation,
    setModule: vi.fn(),
    setMany: vi.fn(),
    reset: vi.fn(),
    markSeen: vi.fn(),
  }),
}));
vi.mock('../../contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({ isOn: (k: string) => hoisted.entitled.has(k) }),
}));

import { useModuleActivation } from '../useModuleActivation';

function setActivation(map: Record<string, boolean>): void {
  hoisted.activation = {
    modules: Object.fromEntries(
      Object.entries(map).map(([k, v]) => [k, { enabled: v, activatedAt: null, source: 'user' }]),
    ),
    newModuleIds: [],
  };
}

beforeEach(() => {
  hoisted.entitled = new Set();
  setActivation({});
});

describe('useModuleActivation.isViewVisible', () => {
  it('core views are always visible regardless of activation', () => {
    const { result } = renderHook(() => useModuleActivation());
    expect(result.current.isViewVisible('dashboard')).toBe(true);
    expect(result.current.isViewVisible('keywords')).toBe(true); // keywords is core
    expect(result.current.isViewVisible('settings')).toBe(true);
  });

  it('free optional view is visible iff its module is activated', () => {
    setActivation({ ads_core: false });
    let view = renderHook(() => useModuleActivation());
    expect(view.result.current.isViewVisible('search_terms')).toBe(false);

    setActivation({ ads_core: true });
    view = renderHook(() => useModuleActivation());
    expect(view.result.current.isViewVisible('search_terms')).toBe(true);
  });

  it('paid view requires BOTH activation AND entitlement', () => {
    // research ∈ ai module, gated by ai.niche_explorer
    setActivation({ ai: true });
    let view = renderHook(() => useModuleActivation());
    expect(view.result.current.isViewVisible('research')).toBe(false); // activated, not entitled

    hoisted.entitled = new Set(['ai.niche_explorer']);
    view = renderHook(() => useModuleActivation());
    expect(view.result.current.isViewVisible('research')).toBe(true); // both

    setActivation({ ai: false });
    view = renderHook(() => useModuleActivation());
    expect(view.result.current.isViewVisible('research')).toBe(false); // entitled, not activated
  });

  it('mixed module: free pages show on activation even while the paid sibling stays locked', () => {
    setActivation({ ads_advanced: true }); // not entitled to automation.rules
    const { result } = renderHook(() => useModuleActivation());
    expect(result.current.isViewVisible('operations')).toBe(true); // free
    expect(result.current.isViewVisible('action_center')).toBe(true); // free
    expect(result.current.isViewVisible('automation')).toBe(false); // paid, not entitled
  });

  it('isModuleActive reflects the activation map', () => {
    setActivation({ analytics: true, alerts: false });
    const { result } = renderHook(() => useModuleActivation());
    expect(result.current.isModuleActive('analytics')).toBe(true);
    expect(result.current.isModuleActive('alerts')).toBe(false);
  });
});
