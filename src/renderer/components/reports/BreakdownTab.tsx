import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../api/client';
import { metricsApi } from '../../api/metrics';
import { Card, EmptyState, ErrorBanner, LoadingRow } from '../ui';
import { fmtMoney, fmtNumber, fmtPct } from '../../lib/format';
import { useToast } from '../../contexts/ToastContext';

interface BreakdownTabProps {
  endpoint: string;
  pluralKey: string;
  dimensionLabel: string;
  dimensionField: string;
  dimensionFormat?: (raw: unknown) => string;
  from: string;
  to: string;
  attribution: '7d' | '14d' | '30d' | '1d';
  marketplaces?: string[];
  bookIds?: number[];
  accounts?: string[];
}

const num = (item: Record<string, unknown>, ...keys: string[]): number => {
  for (const k of keys) {
    const v = item[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return 0;
};

export const BreakdownTab: React.FC<BreakdownTabProps> = ({
  endpoint,
  pluralKey,
  dimensionLabel,
  dimensionField,
  dimensionFormat,
  from,
  to,
  attribution,
  marketplaces,
  bookIds,
  accounts,
}) => {
  const { t } = useTranslation('reports');
  const toast = useToast();
  const [items, setItems] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setUnsupported(false);
    metricsApi
      .breakdown(endpoint, pluralKey, { from, to, attribution, marketplaces, bookIds, accounts })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
          setUnsupported(true);
          setItems([]);
          return;
        }
        toast.error(err instanceof ApiError ? err.message : t('breakdown.loadFailed'));
        setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint, pluralKey, from, to, attribution, marketplaces, bookIds, accounts, toast]);

  const enriched = useMemo(() => {
    if (!items) return [];
    return items
      .map((it) => ({
        raw: it,
        dimension: dimensionFormat
          ? dimensionFormat(it[dimensionField])
          : String(it[dimensionField] ?? '—'),
        impressions: num(it, 'impressions'),
        clicks: num(it, 'clicks'),
        cost: num(it, 'cost', 'spend'),
        sales: num(it, 'sales'),
        orders: num(it, 'orders'),
        ctr: num(it, 'ctr'),
        acos: num(it, 'acos'),
        tacos: num(it, 'tacos'),
      }))
      .sort((a, b) => b.cost - a.cost);
  }, [items, dimensionField, dimensionFormat]);

  if (unsupported) {
    return <ErrorBanner message={t('breakdown.unsupported', { endpoint })} />;
  }

  return (
    <Card title={t('breakdown.title', { dimension: dimensionLabel })} data-testid="reports-breakdown-card">
      {loading && !items ? (
        <LoadingRow />
      ) : enriched.length === 0 ? (
        <EmptyState title={t('breakdown.empty')} />
      ) : (
        <table className="w-full text-sm table-sticky-head">
          <thead>
            <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
              <th className="text-left px-5 py-2 font-medium">{dimensionLabel}</th>
              <th className="text-right px-3 py-2 font-medium">{t('breakdown.th.impressions')}</th>
              <th className="text-right px-3 py-2 font-medium">{t('breakdown.th.clicks')}</th>
              <th className="text-right px-3 py-2 font-medium">{t('breakdown.th.ctr')}</th>
              <th className="text-right px-3 py-2 font-medium">{t('breakdown.th.spend')}</th>
              <th className="text-right px-3 py-2 font-medium">{t('breakdown.th.sales')}</th>
              <th className="text-right px-3 py-2 font-medium">{t('breakdown.th.orders')}</th>
              <th className="text-right px-5 py-2 font-medium">{t('breakdown.th.acos')}</th>
            </tr>
          </thead>
          <tbody>
            {enriched.map((row, i) => (
              <tr key={`${row.dimension}-${i}`} className="border-t border-zinc-100 hover:bg-zinc-50/60">
                <td className="px-5 py-2.5 text-xs font-medium text-zinc-900">{row.dimension}</td>
                <td className="px-3 py-2.5 text-xs text-zinc-700 text-right tabular-nums">
                  {fmtNumber(row.impressions)}
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-700 text-right tabular-nums">
                  {fmtNumber(row.clicks)}
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-600 text-right tabular-nums">
                  {row.ctr > 0 ? fmtPct(row.ctr, 2) : '—'}
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-900 text-right tabular-nums">
                  {fmtMoney(row.cost)}
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-900 text-right tabular-nums">
                  {fmtMoney(row.sales)}
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-700 text-right tabular-nums">
                  {fmtNumber(row.orders)}
                </td>
                <td className="px-5 py-2.5 text-xs text-right tabular-nums">
                  <span className={row.acos > 100 ? 'text-red-600' : 'text-zinc-700'}>
                    {row.acos > 0 ? fmtPct(row.acos) : '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
};
