import React from 'react';
import { useTranslation } from 'react-i18next';
import { Leaf, MousePointerClick } from 'lucide-react';
import { metricsApi, type OrganicTotalSummary } from '../../api/metrics';
import { fmtNumber, fmtPct } from '../../lib/format';
import { Card, LoadingRow } from '../ui';
import { useApiQuery } from '../../lib/useApiQuery';

interface Props {
  from: string;
  to: string;
  attribution: '1d' | '7d' | '14d' | '30d';
  marketplaces?: string[];
  bookIds?: number[];
  accounts?: string[];
}

const HIDDEN_STATUSES = [401, 403, 404];

export const OrganicPaidBlock: React.FC<Props> = ({
  from,
  to,
  attribution,
  marketplaces,
  bookIds,
  accounts,
}) => {
  const { t } = useTranslation('dashboard');
  const { data, loading } = useApiQuery<OrganicTotalSummary>(
    () =>
      metricsApi.summaryOrganicTotal({
        from,
        to,
        attribution,
        marketplaces,
        bookIds,
        accounts,
      }),
    [from, to, attribution, marketplaces, bookIds, accounts],
    { silentStatuses: HIDDEN_STATUSES },
  );

  const totalOrganic = data?.total_organic_orders ?? 0;
  const totalPaid = data?.total_paid_orders ?? 0;
  const total = data?.total_orders ?? totalOrganic + totalPaid;
  const organicPct = total > 0 ? (totalOrganic / total) * 100 : 0;
  const paidPct = total > 0 ? (totalPaid / total) * 100 : 0;
  const hasData = !loading && data && total > 0;

  return (
    <Card title={t('organicPaid.title')} bodyClassName="px-5 py-4">
      {loading && !data ? (
        <LoadingRow />
      ) : !hasData ? (
        <div className="text-sm text-zinc-400 py-2">{t('organicPaid.empty')}</div>
      ) : (
        <div className="space-y-4" data-testid="organic-paid-block">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-zinc-200 bg-emerald-50/40 px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 uppercase tracking-wide">
                <Leaf size={13} />
                {t('organicPaid.organic')}
              </div>
              <div className="mt-1.5 text-2xl font-semibold tabular-nums text-zinc-900">
                {fmtNumber(totalOrganic)}
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">
                {fmtPct(organicPct)} · {t('organicPaid.ordersSuffix')}
              </div>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-blue-50/40 px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-medium text-blue-700 uppercase tracking-wide">
                <MousePointerClick size={13} />
                {t('organicPaid.paid')}
              </div>
              <div className="mt-1.5 text-2xl font-semibold tabular-nums text-zinc-900">
                {fmtNumber(totalPaid)}
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">
                {fmtPct(paidPct)} · {t('organicPaid.ordersSuffix')}
              </div>
            </div>
          </div>

          <div className="h-2 w-full rounded-full overflow-hidden bg-zinc-100 flex">
            <div
              className="bg-emerald-500"
              style={{ width: `${organicPct}%` }}
              aria-label={`Organic ${organicPct.toFixed(1)}%`}
            />
            <div
              className="bg-blue-500"
              style={{ width: `${paidPct}%` }}
              aria-label={`Paid ${paidPct.toFixed(1)}%`}
            />
          </div>

          {data && data.marketplaces.length > 0 ? (
            <div>
              <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide mb-2">
                {t('organicPaid.perMarketplace')}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                    <th className="text-left px-1 py-1 font-medium">MP</th>
                    <th className="text-right px-1 py-1 font-medium">
                      {t('organicPaid.organic')}
                    </th>
                    <th className="text-right px-1 py-1 font-medium">
                      {t('organicPaid.paid')}
                    </th>
                    <th className="text-right px-1 py-1 font-medium">%</th>
                  </tr>
                </thead>
                <tbody>
                  {data.marketplaces.map((row) => {
                    const rowTotal = row.total_orders || row.organic_orders + row.paid_orders;
                    const rowOrgPct = rowTotal > 0 ? (row.organic_orders / rowTotal) * 100 : 0;
                    return (
                      <tr key={row.marketplace} className="border-t border-zinc-100">
                        <td className="px-1 py-1.5 text-xs text-zinc-700 uppercase">
                          {row.marketplace || '—'}
                        </td>
                        <td className="px-1 py-1.5 text-xs text-right tabular-nums text-emerald-700">
                          {fmtNumber(row.organic_orders)}
                        </td>
                        <td className="px-1 py-1.5 text-xs text-right tabular-nums text-blue-700">
                          {fmtNumber(row.paid_orders)}
                        </td>
                        <td className="px-1 py-1.5 text-xs text-right tabular-nums text-zinc-500">
                          {fmtPct(rowOrgPct)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
};
