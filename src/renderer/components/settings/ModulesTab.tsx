// Phase R — the Modules catalog (progressive disclosure control center).
//
// Lists every activatable MODULE grouped by area. Core is always-on (disabled,
// checked). Optional modules toggle the user-owned ACTIVATION axis; the sidebar
// + command palette read it via useModuleActivation. Paid-only modules the user
// isn't entitled to are shown locked with an upgrade badge (founder decision:
// "catalog + palette" — keep the sidebar clean, surface upsell here).

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, BookOpen, LayoutGrid, Lock, Search, Sparkles, Target } from 'lucide-react';
import { Badge, Card, Switch } from '../ui';
import { useToast } from '../../contexts/ToastContext';
import { useEntitlements } from '../../contexts/EntitlementsContext';
import { useModuleActivation } from '../../hooks/useModuleActivation';
import {
  MODULES,
  TOGGLEABLE_MODULES,
  featureForView,
  type ModuleGroup,
  type ModuleId,
  type ModuleSpec,
} from '../../../shared/modules';
import { DEFAULT_TIER_FOR_FEATURE, type FeatureKey, type Tier } from '../../../shared/entitlements';

const GROUP_ORDER: ModuleGroup[] = ['core', 'ads', 'analytics', 'ai', 'publishing'];

const GROUP_ICON: Record<ModuleGroup, React.ElementType> = {
  core: LayoutGrid,
  ads: Target,
  analytics: BarChart3,
  ai: Sparkles,
  publishing: BookOpen,
};

// Module-color tint on the group icon only (DESIGN.md: module colors tint
// accents, never chrome/body text).
const GROUP_ICON_COLOR: Record<ModuleGroup, string> = {
  core: 'text-zinc-400',
  ads: 'text-module-ads',
  analytics: 'text-module-analytics',
  ai: 'text-module-ai',
  publishing: 'text-module-publishing',
};

function tierForKeys(keys: FeatureKey[]): Tier {
  return keys.some((k) => DEFAULT_TIER_FOR_FEATURE[k] === 'business') ? 'business' : 'pro';
}

// A module is "locked" only when EVERY view it owns is paid-gated AND none are
// entitled. Modules with any free view stay activatable (their paid pages
// self-gate when opened) — so we never hide a working page behind a paywall.
function moduleLock(
  spec: ModuleSpec,
  isOn: (k: FeatureKey) => boolean,
): { locked: boolean; tier: Tier | null } {
  const gated = spec.views.map(featureForView).filter((k): k is FeatureKey => !!k);
  if (gated.length === 0 || gated.length < spec.views.length) return { locked: false, tier: null };
  if (gated.some(isOn)) return { locked: false, tier: null };
  return { locked: true, tier: tierForKeys(gated) };
}

export const ModulesTab: React.FC = () => {
  const { t } = useTranslation('settings');
  const toast = useToast();
  const { isOn } = useEntitlements();
  const {
    isModuleActive,
    setModuleActive,
    setManyModules,
    resetModules,
    markModulesSeen,
    newModuleIds,
  } = useModuleActivation();

  const [query, setQuery] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  // Freeze the "new" set at mount so badges stay visible while the user reads the
  // tab; markSeen() clears them for the next launch.
  const [newSnapshot] = useState(() => new Set<string>(newModuleIds));

  useEffect(() => {
    void markModulesSeen();
  }, [markModulesSeen]);

  const label = (id: ModuleId) => t(`modules.items.${id}.label` as 'modules.items.core.label');
  const hint = (id: ModuleId) => t(`modules.items.${id}.hint` as 'modules.items.core.hint');

  const q = query.trim().toLowerCase();
  const matches = (spec: ModuleSpec) =>
    !q || `${label(spec.id)} ${hint(spec.id)}`.toLowerCase().includes(q);

  // Cheap (8 modules) — recompute each render; no memo needed.
  const visibleGroups = GROUP_ORDER.filter((g) => MODULES.some((m) => m.group === g && matches(m)));

  const handleToggle = (spec: ModuleSpec, next: boolean) => {
    void setModuleActive(spec.id, next, 'user');
  };

  const handleEnableAll = () => {
    const ids = TOGGLEABLE_MODULES.filter((s) => !moduleLock(s, isOn).locked).map((s) => s.id);
    void setManyModules(ids, true, 'enable_all').then(() => toast.success(t('modules.enabledAll')));
  };

  const handleReset = () => {
    void resetModules().then(() => {
      setConfirmReset(false);
      toast.success(t('modules.resetDone'));
    });
  };

  return (
    <div className="space-y-6" data-testid="modules-tab">
      <Card title={t('modules.title')}>
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-zinc-500 leading-relaxed">{t('modules.subtitle')}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('modules.search')}
                data-testid="modules-search"
                className="h-8 w-full pl-8 pr-2 text-xs rounded-md border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
              />
            </div>
            {confirmReset ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-zinc-500">{t('modules.resetConfirm')}</span>
                <button
                  type="button"
                  onClick={handleReset}
                  data-testid="modules-reset-confirm"
                  className="inline-flex items-center h-8 px-3 rounded-md text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 transition-colors"
                >
                  {t('modules.resetConfirmYes')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="inline-flex items-center h-8 px-3 rounded-md text-xs font-medium text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors"
                >
                  {t('modules.cancel')}
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleEnableAll}
                  data-testid="modules-enable-all"
                  className="inline-flex items-center h-8 px-3 rounded-md text-xs font-medium text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors"
                >
                  {t('modules.enableAll')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  data-testid="modules-reset"
                  className="inline-flex items-center h-8 px-3 rounded-md text-xs font-medium text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors"
                >
                  {t('modules.resetRecommended')}
                </button>
              </>
            )}
          </div>
        </div>
      </Card>

      {visibleGroups.length === 0 && (
        <Card>
          <div className="px-5 py-8 text-center text-xs text-zinc-500">{t('modules.empty')}</div>
        </Card>
      )}

      {visibleGroups.map((group) => {
        const Icon = GROUP_ICON[group];
        const mods = MODULES.filter((m) => m.group === group && matches(m));
        return (
          <Card
            key={group}
            title={
              <span className="flex items-center gap-2">
                <Icon size={14} className={GROUP_ICON_COLOR[group]} />
                {t(`modules.groups.${group}` as 'modules.groups.core')}
              </span>
            }
          >
            <div className="px-5 py-5 space-y-4">
              {mods.map((spec) => {
                const lock = moduleLock(spec, isOn);
                const active = spec.core ? true : isModuleActive(spec.id);
                const isNew = newSnapshot.has(spec.id);
                const recommended = spec.defaultOn && !spec.core;
                const tierLabel =
                  lock.tier === 'business' ? t('modules.tierBusiness') : t('modules.tierPro');
                return (
                  <div
                    key={spec.id}
                    className="flex items-start justify-between gap-3"
                    data-testid={`module-row-${spec.id}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-medium text-zinc-900">{label(spec.id)}</span>
                        {spec.core && (
                          <span className="text-[10px] text-zinc-400">{t('modules.alwaysOn')}</span>
                        )}
                        {recommended && (
                          <Badge variant="success" size="xs">
                            {t('modules.recommended')}
                          </Badge>
                        )}
                        {isNew && (
                          <Badge variant="info" size="xs">
                            {t('modules.new')}
                          </Badge>
                        )}
                        {lock.locked && lock.tier && (
                          <span
                            title={t('modules.lockedHint', { tier: tierLabel })}
                            className={`inline-flex items-center gap-1 h-4 text-[10px] px-1.5 rounded-sm font-medium ${
                              lock.tier === 'business'
                                ? 'bg-violet-50 text-violet-700 border border-violet-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            <Lock size={9} />
                            {tierLabel}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">{hint(spec.id)}</div>
                    </div>
                    <Switch
                      checked={active}
                      onChange={(next) => handleToggle(spec, next)}
                      disabled={spec.core || lock.locked}
                      testId={`module-toggle-${spec.id}`}
                      aria-label={label(spec.id)}
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
};
