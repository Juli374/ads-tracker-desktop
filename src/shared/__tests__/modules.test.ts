import { describe, it, expect } from 'vitest';
import {
  MODULES,
  ALL_MODULE_IDS,
  DEFAULT_ACTIVE_MODULES,
  TOGGLEABLE_MODULES,
  moduleForView,
  moduleById,
  isViewCore,
  featureForView,
  isModuleId,
} from '../modules';

// Mirror of the ViewId union (src/shared/views.ts) — kept here so the test
// fails loudly if a view is ever added without being assigned to a module.
const ALL_VIEWS = [
  'dashboard',
  'books',
  'search_terms',
  'campaigns',
  'campaign_details',
  'keywords',
  'reports',
  'comparison',
  'negatives',
  'action_center',
  'automation',
  'alerts',
  'royalties',
  'pnl',
  'operations',
  'accounting',
  'profile',
  'listing_studio',
  'research',
  'briefing',
  'settings',
] as const;

describe('module registry', () => {
  it('maps every ViewId to exactly one module (no orphans, no double-assign)', () => {
    const seen = new Set<string>();
    for (const m of MODULES) {
      for (const v of m.views) {
        expect(seen.has(v), `view ${v} assigned to more than one module`).toBe(false);
        seen.add(v);
        expect(ALL_VIEWS, `view ${v} is not a known ViewId`).toContain(v);
      }
    }
    for (const v of ALL_VIEWS) {
      expect(seen.has(v), `view ${v} is not assigned to any module`).toBe(true);
    }
    expect(seen.size).toBe(ALL_VIEWS.length);
  });

  it('core module is always-on and excluded from the toggleable set', () => {
    const core = moduleById('core');
    expect(core?.core).toBe(true);
    expect(core?.defaultOn).toBe(true);
    expect(TOGGLEABLE_MODULES.some((m) => m.id === 'core')).toBe(false);
    expect(TOGGLEABLE_MODULES.every((m) => !m.core)).toBe(true);
  });

  it('Starter (default-on) set = core + ads_core + finance_royalty', () => {
    expect([...DEFAULT_ACTIVE_MODULES].sort()).toEqual(['ads_core', 'core', 'finance_royalty']);
  });

  it('finance is split: royalty on by default, P&L/accounting opt-in', () => {
    expect(moduleById('finance_royalty')?.defaultOn).toBe(true);
    expect(moduleById('finance_royalty')?.views).toEqual(['royalties']);
    expect(moduleById('finance_advanced')?.defaultOn).toBe(false);
    expect(moduleById('finance_advanced')?.views).toEqual(['pnl', 'accounting']);
  });

  it('moduleForView / isViewCore resolve correctly', () => {
    expect(moduleForView('royalties')?.id).toBe('finance_royalty');
    expect(moduleForView('search_terms')?.id).toBe('ads_core');
    expect(moduleForView('automation')?.id).toBe('ads_advanced');
    expect(isViewCore('dashboard')).toBe(true);
    expect(isViewCore('keywords')).toBe(true);
    expect(isViewCore('royalties')).toBe(false);
  });

  it('VIEW_FEATURE gates only the four full-page paid views', () => {
    expect(featureForView('research')).toBe('ai.niche_explorer');
    expect(featureForView('automation')).toBe('automation.rules');
    expect(featureForView('listing_studio')).toBe('ai.title_generator');
    expect(featureForView('briefing')).toBe('ai.weekly_briefing');
    // free / component-gated pages must NOT be treated as full-page locked
    expect(featureForView('operations')).toBeUndefined();
    expect(featureForView('reports')).toBeUndefined();
    expect(featureForView('royalties')).toBeUndefined();
    expect(featureForView('keywords')).toBeUndefined();
  });

  it('ai module is fully paid-gated; ads_advanced is mixed (has free views)', () => {
    const ai = moduleById('ai');
    expect(ai?.views.every((v) => featureForView(v) !== undefined)).toBe(true);
    const adv = moduleById('ads_advanced');
    expect(adv?.views.some((v) => featureForView(v) === undefined)).toBe(true);
  });

  it('isModuleId validates ids', () => {
    expect(isModuleId('ai')).toBe(true);
    expect(isModuleId('finance_royalty')).toBe(true);
    expect(isModuleId('nope')).toBe(false);
    expect(isModuleId(42)).toBe(false);
    expect(isModuleId(undefined)).toBe(false);
  });

  it('ALL_MODULE_IDS matches MODULES order', () => {
    expect([...ALL_MODULE_IDS]).toEqual(MODULES.map((m) => m.id));
  });
});
