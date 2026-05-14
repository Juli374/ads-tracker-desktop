// Phase K — Plan comparison modal. Open from LockedFeature / useEntitlement
// nudges when user clicks on a locked feature. CTA opens billing URL via
// shell.openExternal — no real billing UI in this phase.

import React, { useCallback, useMemo } from 'react';
import { Check, X, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEscapeClose } from '../lib/useEscapeClose';
import { FeatureKey, Tier } from '../../shared/entitlements';
import { useEntitlementsOptional } from '../contexts/EntitlementsContext';

interface Props {
  open: boolean;
  onClose(): void;
  /** Which feature triggered the modal — used for telemetry / analytics URL. */
  triggeredBy?: FeatureKey;
  /** Highlight this plan card as "recommended". Defaults to 'pro'. */
  recommendedTier?: Tier;
}

const PLAN_ORDER: Tier[] = ['start', 'pro', 'business'];

/**
 * Какие фичи показываем под каждым tier'ом. Источник правды — статичный (UX-only).
 * Бэкенд решает, что юзеру даём; этот mapping лишь объясняет план визуально.
 */
const PLAN_FEATURES: Record<Tier, FeatureKey[]> = {
  start: [
    // Бесплатный план — только базовые анализ + один marketplace.
  ],
  pro: [
    'ai.title_generator',
    'ai.advisor_panel',
    'analytics.hourly_dynamics',
    'analytics.multi_period_metrics',
    'analytics.search_terms_deep',
    'books.bulk_import',
    'royalties.advanced_breakdown',
    'export.unlimited',
  ],
  business: [
    'ai.title_generator',
    'ai.advisor_panel',
    'analytics.hourly_dynamics',
    'analytics.multi_period_metrics',
    'analytics.search_terms_deep',
    'marketplace.multi',
    'automation.rules',
    'automation.scheduled_reports',
    'books.bulk_import',
    'royalties.advanced_breakdown',
    'export.unlimited',
    'support.priority',
  ],
};

export const UpgradeModal: React.FC<Props> = ({
  open,
  onClose,
  triggeredBy,
  recommendedTier = 'pro',
}) => {
  const { t } = useTranslation('common');
  const ent = useEntitlementsOptional();
  useEscapeClose(onClose, open);

  const userId = ent?.entitlements.user_id ?? 0;
  const currentTier = ent?.tier ?? 'start';

  const billingUrl = useMemo(() => {
    const base = 'https://ads-tracker.app/billing';
    const params = new URLSearchParams();
    params.set('from', 'feature');
    params.set('u', String(userId));
    if (triggeredBy) params.set('feature', triggeredBy);
    params.set('recommend', recommendedTier);
    return `${base}?${params.toString()}`;
  }, [userId, triggeredBy, recommendedTier]);

  const handleUpgrade = useCallback(() => {
    if (typeof window.api?.shell?.openExternal === 'function') {
      void window.api.shell.openExternal(billingUrl).catch(() => {
        // ignore: shell.openExternal rejects only on disallowed schemes
      });
    }
    onClose();
  }, [billingUrl, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
      onClick={onClose}
      data-testid="upgrade-modal-overlay"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-modal-title"
        data-testid="upgrade-modal"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-2xl w-[860px] max-w-[92vw] max-h-[88vh] overflow-y-auto"
      >
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-violet-600" />
            <h2
              id="upgrade-modal-title"
              className="text-base font-semibold text-zinc-900"
            >
              {t('entitlements.upgrade.title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('actions.close')}
            data-testid="upgrade-modal-close"
            className="h-7 w-7 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-6 pt-4 pb-2 text-sm text-zinc-600">
          {t('entitlements.upgrade.subtitle')}
        </div>

        <div className="grid grid-cols-3 gap-4 px-6 py-4">
          {PLAN_ORDER.map((tier) => (
            <PlanCard
              key={tier}
              tier={tier}
              isCurrent={tier === currentTier}
              isRecommended={tier === recommendedTier}
              onUpgrade={handleUpgrade}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

interface PlanCardProps {
  tier: Tier;
  isCurrent: boolean;
  isRecommended: boolean;
  onUpgrade(): void;
}

const PlanCard: React.FC<PlanCardProps> = ({
  tier,
  isCurrent,
  isRecommended,
  onUpgrade,
}) => {
  const { t } = useTranslation('common');
  const features = PLAN_FEATURES[tier];

  return (
    <div
      data-testid={`upgrade-plan-${tier}`}
      className={`
        relative rounded-lg border bg-white p-4 flex flex-col
        ${isRecommended ? 'border-violet-400 ring-1 ring-violet-200' : 'border-zinc-200'}
      `}
    >
      {isRecommended && !isCurrent && (
        <div className="absolute -top-2 left-3 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-violet-600 text-white">
          {t('entitlements.upgrade.cta')}
        </div>
      )}
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-zinc-900">
          {t(`entitlements.upgrade.plans.${tier}.name` as 'entitlements.upgrade.plans.start.name')}
        </h3>
        {isCurrent && (
          <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">
            {t('entitlements.upgrade.currentBadge')}
          </span>
        )}
      </div>
      <div className="text-lg font-semibold text-zinc-900 mb-1">
        {t(`entitlements.upgrade.plans.${tier}.price` as 'entitlements.upgrade.plans.start.price')}
      </div>
      <div className="text-xs text-zinc-500 mb-3 min-h-[2.5em]">
        {t(`entitlements.upgrade.plans.${tier}.tagline` as 'entitlements.upgrade.plans.start.tagline')}
      </div>
      <ul className="space-y-1.5 mb-4 flex-1 min-h-[120px]">
        {features.length === 0 && (
          <li className="text-xs text-zinc-400 italic">—</li>
        )}
        {features.map((f) => (
          <li
            key={f}
            className="flex items-start gap-1.5 text-xs text-zinc-700"
          >
            <Check size={12} className="text-emerald-500 mt-0.5 flex-shrink-0" />
            <span>
              {t(`entitlements.upgrade.features.${f}` as 'entitlements.upgrade.features.ai.title_generator')}
            </span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onUpgrade}
        disabled={isCurrent}
        data-testid={`upgrade-cta-${tier}`}
        className={`
          h-8 rounded-md text-xs font-medium transition-colors
          ${isCurrent
            ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
            : isRecommended
              ? 'bg-violet-600 text-white hover:bg-violet-700'
              : 'border border-zinc-300 text-zinc-700 hover:bg-zinc-50'}
        `}
      >
        {isCurrent ? t('entitlements.upgrade.currentBadge') : t('entitlements.upgrade.cta')}
      </button>
    </div>
  );
};
