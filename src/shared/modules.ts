// Phase R — user-controlled feature-activation registry (progressive disclosure).
//
// This is the SECOND visibility axis, orthogonal to the server-issued entitlement
// axis (src/shared/entitlements.ts). A nav view is shown when:
//
//     visible = core  OR  (module activated  AND  view entitled)
//
// where "activated" is a local, user-owned preference (persisted in local-db —
// see src/main/local-db/index.ts) and "entitled" is the existing paid-tier check
// resolved PER-VIEW (via VIEW_FEATURE below). The unit the user toggles is a
// MODULE (a coherent group of views), not an individual view — this keeps the
// settings catalog short (~8 rows) and maps cleanly onto the sidebar sections.
//
// This file deliberately imports only the FeatureKey *type* from entitlements.ts
// and never mutates it, so the feature_keys.json export pipeline
// (scripts/emit-feature-keys.mjs) is unaffected.

import type { ViewId } from './views';
import type { FeatureKey } from './entitlements';

export type ModuleId =
  | 'core'
  | 'ads_core'
  | 'ads_advanced'
  | 'analytics'
  | 'alerts'
  | 'ai'
  | 'finance_royalty'
  | 'finance_advanced';

/** Display grouping in the Modules settings catalog. */
export type ModuleGroup = 'core' | 'ads' | 'analytics' | 'ai' | 'publishing';

export interface ModuleSpec {
  id: ModuleId;
  group: ModuleGroup;
  /** Sidebar views this module shows/hides. */
  views: ViewId[];
  /** Core modules are always visible and can never be toggled off. */
  core: boolean;
  /** Member of the brand-new-user "Starter" set (on by default). */
  defaultOn: boolean;
}

// The taxonomy. Every ViewId appears in exactly one module (asserted in tests).
// Founder decisions (2026-06-07):
//  - Starter set = core + ads_core + finance_royalty ("run ads + see true royalty").
//  - finance is split: royalty on by default, P&L/Accounting opt-in.
//  - no marketplace module yet (no dedicated page exists).
export const MODULES: readonly ModuleSpec[] = [
  {
    id: 'core',
    group: 'core',
    views: ['dashboard', 'books', 'campaigns', 'keywords', 'settings', 'profile', 'campaign_details'],
    core: true,
    defaultOn: true,
  },
  {
    id: 'ads_core',
    group: 'ads',
    views: ['search_terms', 'negatives'],
    core: false,
    defaultOn: true,
  },
  {
    id: 'ads_advanced',
    group: 'ads',
    views: ['automation', 'operations', 'action_center'],
    core: false,
    defaultOn: false,
  },
  {
    id: 'analytics',
    group: 'analytics',
    views: ['reports', 'comparison'],
    core: false,
    defaultOn: false,
  },
  {
    id: 'alerts',
    group: 'analytics',
    views: ['alerts'],
    core: false,
    defaultOn: false,
  },
  {
    id: 'ai',
    group: 'ai',
    views: ['listing_studio', 'research', 'briefing'],
    core: false,
    defaultOn: false,
  },
  {
    id: 'finance_royalty',
    group: 'publishing',
    views: ['royalties'],
    core: false,
    defaultOn: true,
  },
  {
    id: 'finance_advanced',
    group: 'publishing',
    views: ['pnl', 'accounting'],
    core: false,
    defaultOn: false,
  },
];

/**
 * Views that are FULL-PAGE entitlement-gated (the page itself renders a
 * LockedFeatureCard when the plan doesn't grant the key). Kept per-VIEW because
 * a module can mix free and paid pages (e.g. ads_advanced: `automation` is paid,
 * `operations`/`action_center` render free). Source: docs/feature-activation/
 * map-ent.md §4 — only these four pages are hard full-page gates; all other
 * entitlement gating is component-level and does not block the page.
 */
export const VIEW_FEATURE: Partial<Record<ViewId, FeatureKey>> = {
  research: 'ai.niche_explorer',
  automation: 'automation.rules',
  listing_studio: 'ai.title_generator',
  briefing: 'ai.weekly_briefing',
};

export const ALL_MODULE_IDS: readonly ModuleId[] = MODULES.map((m) => m.id);

export const DEFAULT_ACTIVE_MODULES: readonly ModuleId[] = MODULES.filter((m) => m.defaultOn).map(
  (m) => m.id,
);

/** Non-core modules, in catalog display order. */
export const TOGGLEABLE_MODULES: readonly ModuleSpec[] = MODULES.filter((m) => !m.core);

const VIEW_TO_MODULE: Readonly<Record<string, ModuleSpec>> = (() => {
  const map: Record<string, ModuleSpec> = {};
  for (const m of MODULES) {
    for (const v of m.views) map[v] = m;
  }
  return map;
})();

export function moduleForView(v: ViewId): ModuleSpec | undefined {
  return VIEW_TO_MODULE[v];
}

export function moduleById(id: ModuleId): ModuleSpec | undefined {
  return MODULES.find((m) => m.id === id);
}

export function isViewCore(v: ViewId): boolean {
  return moduleForView(v)?.core === true;
}

export function featureForView(v: ViewId): FeatureKey | undefined {
  return VIEW_FEATURE[v];
}

/** Type guard: is the given string a known ModuleId? Used to validate IPC args in main. */
export function isModuleId(x: unknown): x is ModuleId {
  return typeof x === 'string' && (ALL_MODULE_IDS as readonly string[]).includes(x);
}
