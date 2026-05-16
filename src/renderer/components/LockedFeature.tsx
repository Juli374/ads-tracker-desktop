// Phase K — Wrapper that locks a feature behind tier-gating.
//
// Modes:
//   - 'dim'   → render children with opacity-40 + pointer-events-none.
//               Click is captured on the overlay and opens UpgradeModal.
//   - 'badge' → render children unchanged but stick a "Pro" / "Business"
//               badge in the top-right corner. Click on badge → modal.
//   - 'hide'  → don't render children at all. Caller is responsible for
//               showing an alternative ("Upgrade to unlock" card).
//
// Usage:
//   <LockedFeature feature="ai.advisor_panel" mode="dim">
//     <AIAdvisorPanel ... />
//   </LockedFeature>

import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FeatureKey } from '../../shared/entitlements';
import { useEntitlement } from '../hooks/useEntitlement';
import { UpgradeModal } from './UpgradeModal';

interface Props {
  feature: FeatureKey;
  mode?: 'dim' | 'badge' | 'hide';
  /** Optional className applied to the wrapper. */
  className?: string;
  children: React.ReactNode;
}

export const LockedFeature: React.FC<Props> = ({
  feature,
  mode = 'dim',
  className,
  children,
}) => {
  const { on, tierRequired } = useEntitlement(feature);
  const [modalOpen, setModalOpen] = useState(false);
  const { t } = useTranslation('common');

  // Unlocked → render as-is, zero overhead.
  if (on) {
    return <>{children}</>;
  }

  if (mode === 'hide') {
    return null;
  }

  const badgeLabel =
    tierRequired === 'business'
      ? t('entitlements.lockedBadge') // fallback to "Pro" не используется — отдельный ключ
      : t('entitlements.lockedBadge');
  const businessLabel = t('entitlements.lockedBadgeBusiness');
  const displayLabel = tierRequired === 'business' ? businessLabel : badgeLabel;

  const openModal = () => setModalOpen(true);

  return (
    <>
      <div
        data-testid={`locked-feature-${feature}`}
        data-feature={feature}
        data-mode={mode}
        className={`relative inline-block ${className ?? ''}`}
      >
        {mode === 'dim' && (
          <>
            <div className="opacity-40 pointer-events-none select-none" aria-hidden="true">
              {children}
            </div>
            <button
              type="button"
              onClick={openModal}
              aria-label={t('entitlements.nudge.cta')}
              data-testid={`locked-feature-cta-${feature}`}
              className="
                absolute inset-0 flex items-center justify-center
                cursor-pointer
                bg-transparent
              "
            >
              <span
                className="
                  inline-flex items-center gap-1.5 px-2 py-1
                  rounded-md bg-white/95 border border-amber-200 shadow-sm
                  text-[11px] font-semibold text-amber-700 uppercase tracking-wide
                  hover:bg-amber-50 transition-colors
                "
              >
                <Lock size={11} />
                {displayLabel}
              </span>
            </button>
          </>
        )}
        {mode === 'badge' && (
          <>
            {children}
            <button
              type="button"
              onClick={openModal}
              aria-label={t('entitlements.nudge.cta')}
              data-testid={`locked-feature-cta-${feature}`}
              className="
                absolute top-1 right-1 z-10
                inline-flex items-center gap-1 px-1.5 py-0.5
                rounded text-[9px] font-semibold uppercase tracking-wider
                bg-amber-500 text-white hover:bg-amber-600 transition-colors
              "
            >
              <Lock size={8} />
              {displayLabel}
            </button>
          </>
        )}
      </div>
      <UpgradeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        triggeredBy={feature}
        recommendedTier={tierRequired}
      />
    </>
  );
};
