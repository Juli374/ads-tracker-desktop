// LockedFeatureCard — Phase Q.1 primitive.
// Canonical "this feature requires Pro/Business" empty-state card. Replaces five
// hand-rolled lock screens (Automation, ListingStudio, Research, Briefing,
// KeywordsPage Reverse-ASIN).
//
// Visual contract (see Phase Q.1 spec):
//   - amber AI/Pro icon disc at top (matches modules.ai = #f59e0b)
//   - tier badge: PRO / BUSINESS uppercase
//   - title in font-display (Playfair Display) for editorial feel
//   - emerald primary CTA (one of the few places we use emerald-as-primary per
//     Decision 3 — high-emphasis upgrade CTA)
import React from 'react';

export type LockedTier = 'pro' | 'business';

export interface LockedFeatureCardProps {
  icon: React.ReactNode;
  title: React.ReactNode;
  description: React.ReactNode;
  tier?: LockedTier;
  onUpgrade?: () => void;
  ctaLabel?: React.ReactNode;
  className?: string;
  'data-testid'?: string;
}

const TIER_LABEL: Record<LockedTier, string> = {
  pro: 'PRO',
  business: 'BUSINESS',
};

const TIER_DEFAULT_CTA: Record<LockedTier, string> = {
  pro: 'Upgrade to Pro',
  business: 'Upgrade to Business',
};

export const LockedFeatureCard: React.FC<LockedFeatureCardProps> = ({
  icon,
  title,
  description,
  tier = 'pro',
  onUpgrade,
  ctaLabel,
  className = '',
  'data-testid': testId,
}) => (
  <div
    data-testid={testId}
    className={`flex flex-col items-center justify-center gap-3 py-12 px-6 text-center bg-white border border-zinc-200 rounded-card${
      className ? ` ${className}` : ''
    }`}
  >
    <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
      <span aria-hidden="true" className="text-amber-600 inline-flex items-center justify-center [&_svg]:size-7">
        {icon}
      </span>
    </div>
    <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-pill bg-amber-100 text-amber-700">
      {TIER_LABEL[tier]}
    </span>
    <h2 className="font-display text-xl font-bold tracking-tight text-zinc-900">
      {title}
    </h2>
    <p className="text-sm text-zinc-500 max-w-md">{description}</p>
    {onUpgrade != null && (
      <button
        type="button"
        onClick={onUpgrade}
        className="mt-2 inline-flex items-center justify-center bg-emerald-500 text-white hover:bg-emerald-600 h-9 px-4 rounded-btn text-sm font-medium transition-colors duration-fast ease-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
      >
        {ctaLabel ?? TIER_DEFAULT_CTA[tier]}
      </button>
    )}
  </div>
);
