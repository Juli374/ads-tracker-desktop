import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  BookOpen,
  Coins,
  Plug,
  Sparkles,
} from 'lucide-react';
import { useNav } from '../../contexts/NavContext';

/**
 * Blocker #6 — new-user onboarding empty-state for the Dashboard.
 *
 * A brand-new user (no books AND Amazon Ads not connected) otherwise sees the
 * full Dashboard chrome with $0.00 / — in every KPI tile and a single generic
 * "no data for this period" EmptyState inside the Books card. There is no
 * guidance. This panel replaces the zeroed KPI grid + charts with a warm
 * welcome and concrete next steps.
 *
 * Rendered ONLY for the genuinely-empty case (see `isBrandNewUser` in
 * DashboardPage). A user with books OR a connected Amazon account always sees
 * the normal dashboard — the 41-book owner must never hit this.
 *
 * Navigation uses the app's NavContext (`navigate(viewId)`). The "Connect
 * Amazon" CTA additionally sets `window.location.hash = '#settings/credentials'`
 * so SettingsPage deep-links straight to the Credentials tab (it parses that
 * hash via `readHashTab` and listens for `hashchange`).
 */

interface CtaCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
  onClick(): void;
  /** High-emphasis (emerald) primary action vs. neutral secondary. */
  emphasis?: 'primary' | 'secondary';
  dataTestId?: string;
}

const CtaCard: React.FC<CtaCardProps> = ({
  icon,
  title,
  description,
  cta,
  onClick,
  emphasis = 'secondary',
  dataTestId,
}) => (
  <button
    type="button"
    onClick={onClick}
    data-testid={dataTestId}
    className={`
      group flex items-start gap-3.5 text-left rounded-lg border p-4
      transition-colors duration-100 ease-out
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30
      ${
        emphasis === 'primary'
          ? 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 hover:border-emerald-300'
          : 'border-zinc-200 bg-white hover:bg-zinc-50 hover:border-zinc-300'
      }
    `}
  >
    <span
      className={`
        flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-md
        ${
          emphasis === 'primary'
            ? 'bg-emerald-500 text-white'
            : 'bg-zinc-100 text-zinc-600 group-hover:bg-zinc-200'
        }
      `}
    >
      {icon}
    </span>
    <span className="flex-1 min-w-0">
      <span className="flex items-center gap-1 text-sm font-semibold text-zinc-900">
        {title}
        <ArrowRight
          size={13}
          className={`
            transition-transform duration-100 group-hover:translate-x-0.5
            ${emphasis === 'primary' ? 'text-emerald-600' : 'text-zinc-400'}
          `}
        />
      </span>
      <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">
        {description}
      </span>
      <span
        className={`
          mt-2 inline-block text-xs font-medium
          ${emphasis === 'primary' ? 'text-emerald-700' : 'text-zinc-700'}
        `}
      >
        {cta}
      </span>
    </span>
  </button>
);

export const OnboardingEmptyState: React.FC = () => {
  const { t } = useTranslation('dashboard');
  const { navigate } = useNav();

  const goToCredentials = () => {
    // Deep-link straight to Settings → Credentials. SettingsPage reads the hash
    // on mount (`readHashTab`) and on `hashchange`, so set it before navigating.
    window.location.hash = '#settings/credentials';
    navigate('settings');
  };

  return (
    <div
      className="bg-white border border-zinc-200 rounded-lg shadow-soft overflow-hidden"
      data-testid="dashboard-onboarding"
    >
      <div className="px-8 py-8 sm:px-10 sm:py-10">
        <div className="flex items-center gap-2 text-emerald-600">
          <Sparkles size={16} />
          <span className="text-xs font-semibold uppercase tracking-wider">
            {t('onboarding.eyebrow', { defaultValue: 'Getting started' })}
          </span>
        </div>

        <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-zinc-900">
          {t('onboarding.headline', {
            defaultValue: "Welcome to KDPBook — let's get your data flowing",
          })}
        </h2>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-zinc-500">
          {t('onboarding.subtext', {
            defaultValue:
              'Connect your Amazon Ads account and upload a royalty report to see profit, ACOS, and TACoS across all your books.',
          })}
        </p>

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          <CtaCard
            emphasis="primary"
            icon={<Plug size={18} />}
            title={t('onboarding.connect.title', {
              defaultValue: 'Connect Amazon Ads',
            })}
            description={t('onboarding.connect.description', {
              defaultValue:
                'Authorize your seller account to pull campaigns, spend, and sales automatically.',
            })}
            cta={t('onboarding.connect.cta', { defaultValue: 'Open Credentials' })}
            onClick={goToCredentials}
            dataTestId="onboarding-cta-connect"
          />
          <CtaCard
            icon={<Coins size={18} />}
            title={t('onboarding.royalty.title', {
              defaultValue: 'Upload royalty report',
            })}
            description={t('onboarding.royalty.description', {
              defaultValue:
                'Drop in your KDP royalty export to unlock true profit and TACoS — it stays on your device.',
            })}
            cta={t('onboarding.royalty.cta', { defaultValue: 'Go to Royalties' })}
            onClick={() => navigate('royalties')}
            dataTestId="onboarding-cta-royalty"
          />
          <CtaCard
            icon={<BookOpen size={18} />}
            title={t('onboarding.books.title', {
              defaultValue: 'Add your first book',
            })}
            description={t('onboarding.books.description', {
              defaultValue:
                'Set break-even ACOS and royalty per book so every metric reflects your real margins.',
            })}
            cta={t('onboarding.books.cta', { defaultValue: 'Go to Books' })}
            onClick={() => navigate('books')}
            dataTestId="onboarding-cta-books"
          />
        </div>

        <p className="mt-5 text-xs text-zinc-400">
          {t('onboarding.footnote', {
            defaultValue:
              'This panel disappears as soon as you connect Amazon or add a book.',
          })}
        </p>
      </div>
    </div>
  );
};
