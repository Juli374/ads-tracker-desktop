import React from 'react';
import { useTranslation } from 'react-i18next';
import { CampaignAnalyticsItem } from '../../api/metrics';
import { useNav } from '../../contexts/NavContext';
import { fmtMoney, fmtPct } from '../../lib/format';
import { EmptyState, LoadingRow } from '../ui';

interface Props {
  campaigns: CampaignAnalyticsItem[];
  loading: boolean;
}

export const BooksCampaignsPanel: React.FC<Props> = ({ campaigns, loading }) => {
  const { t } = useTranslation('books');
  const { navigate } = useNav();

  const handleCampaignClick = (campaign: CampaignAnalyticsItem) => {
    navigate('campaign_details', { campaignId: campaign.campaign_id });
  };

  if (loading) {
    return (
      <div data-testid="books-campaigns-panel">
        <LoadingRow />
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div data-testid="books-campaigns-panel">
        <EmptyState title={t('drill.empty')} />
      </div>
    );
  }

  return (
    <div data-testid="books-campaigns-panel">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide border-b border-zinc-100">
            <th className="text-left px-3 py-2 font-medium">{t('drill.campaigns')}</th>
            <th className="text-right px-3 py-2 font-medium">Spend</th>
            <th className="text-right px-3 py-2 font-medium">Sales</th>
            <th className="text-right px-3 py-2 font-medium">Orders</th>
            <th className="text-right px-3 py-2 font-medium">ACOS</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr
              key={c.campaign_id}
              className="border-t border-zinc-100 hover:bg-zinc-50 cursor-pointer transition-colors"
              onClick={() => handleCampaignClick(c)}
            >
              <td className="px-3 py-2.5">
                <div className="text-xs font-medium text-zinc-900 truncate max-w-sm">
                  {c.campaign_name}
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5">
                  {c.campaign_type.toUpperCase()}
                  {c.status && ` · ${c.status}`}
                </div>
              </td>
              <td className="px-3 py-2.5 text-xs text-right tabular-nums">{fmtMoney(c.cost, c.currency)}</td>
              <td className="px-3 py-2.5 text-xs text-right tabular-nums">{fmtMoney(c.sales, c.currency)}</td>
              <td className="px-3 py-2.5 text-xs text-right tabular-nums">{c.orders}</td>
              <td className="px-3 py-2.5 text-xs text-right tabular-nums">
                <span className={c.acos > 100 ? 'text-red-600' : 'text-zinc-700'}>
                  {c.acos > 0 ? fmtPct(c.acos) : '—'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
