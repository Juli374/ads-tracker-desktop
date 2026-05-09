import React from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, X } from 'lucide-react';
import type { CampaignAnalyticsItem } from '../../api/metrics';
import { fmtMoney, fmtNumber, fmtPct } from '../../lib/format';

interface Props {
  campaign: CampaignAnalyticsItem;
  onClose: () => void;
}

export const AIAdvisorPanel: React.FC<Props> = ({ campaign, onClose }) => {
  const { t } = useTranslation('campaigns');

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-label={t('details.advisor.panelTitle')}
        data-testid="ai-advisor-panel"
        className="fixed right-0 top-0 h-full w-[400px] bg-white border-l border-zinc-200 shadow-xl z-50 flex flex-col"
      >
        <div className="flex items-center justify-between px-4 h-12 border-b border-zinc-200">
          <div className="inline-flex items-center gap-2">
            <Sparkles size={14} className="text-violet-600" />
            <span className="text-sm font-medium text-zinc-900">
              {t('details.advisor.panelTitle')}
            </span>
            <span className="text-[10px] uppercase tracking-wide bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">
              {t('details.advisor.previewBadge')}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('details.advisor.closeAria')}
            className="h-7 w-7 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div>
            <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide mb-2">
              {t('details.advisor.summaryHeader')}
            </div>
            <div className="text-sm text-zinc-900 font-medium mb-1">
              {campaign.campaign_name}
            </div>
            <div className="text-xs text-zinc-500 mb-3">
              {campaign.book_title} · {campaign.marketplace} ·{' '}
              {campaign.campaign_type.toUpperCase()} · {campaign.targeting_type}
            </div>

            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-zinc-50 rounded px-2 py-1.5">
                <dt className="text-zinc-500">Spend</dt>
                <dd className="font-medium text-zinc-900 tabular-nums">
                  {fmtMoney(campaign.cost, campaign.currency)}
                </dd>
              </div>
              <div className="bg-zinc-50 rounded px-2 py-1.5">
                <dt className="text-zinc-500">Sales</dt>
                <dd className="font-medium text-zinc-900 tabular-nums">
                  {fmtMoney(campaign.sales, campaign.currency)}
                </dd>
              </div>
              <div className="bg-zinc-50 rounded px-2 py-1.5">
                <dt className="text-zinc-500">Orders</dt>
                <dd className="font-medium text-zinc-900 tabular-nums">
                  {fmtNumber(campaign.orders)}
                </dd>
              </div>
              <div className="bg-zinc-50 rounded px-2 py-1.5">
                <dt className="text-zinc-500">ACOS</dt>
                <dd
                  className={`font-medium tabular-nums ${
                    campaign.acos > 100 ? 'text-red-600' : 'text-zinc-900'
                  }`}
                >
                  {campaign.acos > 0 ? fmtPct(campaign.acos) : '—'}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-violet-100 bg-violet-50/40 px-3 py-3">
            <div className="text-xs text-violet-900 font-medium mb-1">
              {t('details.advisor.previewBadge')}
            </div>
            <div className="text-xs text-zinc-700 leading-relaxed">
              {t('details.advisor.comingSoon')}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
