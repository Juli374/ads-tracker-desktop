import React from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { Card, EmptyState, LoadingRow } from '../ui';
import {
  metricsApi,
  type CampaignSearchTermsResponse,
} from '../../api/metrics';
import { fmtMoney, fmtNumber, fmtPct } from '../../lib/format';
import { useApiQuery } from '../../lib/useApiQuery';

interface Props {
  campaignId: number;
  from: string;
  to: string;
  onOpenFull: () => void;
}

export const CampaignSearchTermsEmbed: React.FC<Props> = ({
  campaignId,
  from,
  to,
  onOpenFull,
}) => {
  const { t } = useTranslation('campaigns');
  const { data, loading, error } = useApiQuery<CampaignSearchTermsResponse>(
    () => metricsApi.campaignSearchTerms(campaignId, { from, to }),
    [campaignId, from, to],
    { silentStatuses: [404] },
  );
  const items = data?.items ?? null;

  return (
    <Card
      title={t('details.searchTerms.embedTitle')}
      rightSlot={
        <button
          type="button"
          onClick={onOpenFull}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors"
        >
          <ExternalLink size={11} />
          {t('details.searchTerms.openFull')}
        </button>
      }
    >
      {loading && !items ? (
        <LoadingRow />
      ) : error ? (
        <div className="px-5 py-4 text-sm text-red-600">{error}</div>
      ) : !items || items.length === 0 ? (
        <EmptyState title={t('details.searchTerms.empty')} />
      ) : (
        <div className="overflow-x-auto" data-testid="campaign-search-terms-embed">
          <table className="w-full text-sm table-sticky-head">
            <thead>
              <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                <th className="text-left px-5 py-2 font-medium">
                  {t('details.searchTerms.th.term')}
                </th>
                <th className="text-left px-3 py-2 font-medium">
                  {t('details.searchTerms.th.match')}
                </th>
                <th className="text-right px-3 py-2 font-medium">
                  {t('details.searchTerms.th.imps')}
                </th>
                <th className="text-right px-3 py-2 font-medium">
                  {t('details.searchTerms.th.clicks')}
                </th>
                <th className="text-right px-3 py-2 font-medium">
                  {t('details.searchTerms.th.spend')}
                </th>
                <th className="text-right px-3 py-2 font-medium">
                  {t('details.searchTerms.th.sales')}
                </th>
                <th className="text-right px-3 py-2 font-medium">
                  {t('details.searchTerms.th.orders')}
                </th>
                <th className="text-right px-5 py-2 font-medium">
                  {t('details.searchTerms.th.acos')}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 100).map((row, i) => (
                <tr
                  key={`${row.search_term}-${i}`}
                  className="border-t border-zinc-100 hover:bg-zinc-50/60"
                >
                  <td className="px-5 py-2 text-xs text-zinc-900 truncate max-w-md font-mono">
                    {row.search_term}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-zinc-600 uppercase">
                    {row.match_type ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums text-zinc-700">
                    {fmtNumber(row.impressions)}
                  </td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums text-zinc-700">
                    {fmtNumber(row.clicks)}
                  </td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums text-zinc-900">
                    {fmtMoney(row.cost)}
                  </td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums text-zinc-900">
                    {fmtMoney(row.sales)}
                  </td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums text-zinc-700">
                    {fmtNumber(row.orders)}
                  </td>
                  <td className="px-5 py-2 text-xs text-right tabular-nums">
                    <span className={row.acos != null && row.acos > 100 ? 'text-red-600' : 'text-zinc-700'}>
                      {row.acos != null && row.acos > 0 ? fmtPct(row.acos) : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};
