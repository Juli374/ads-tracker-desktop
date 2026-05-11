import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wallet, AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';
import { ApiError, apiClient } from '../../api/client';
import { Card, EmptyState, ErrorBanner, LoadingRow } from '../ui';
import { fmtMoney, fmtPct } from '../../lib/format';
import { useToast } from '../../contexts/ToastContext';

interface BudgetPacingTabProps {
  marketplaces?: string[];
  bookIds?: number[];
  accounts?: string[];
}

interface PacingRowRaw {
  campaign_id?: number;
  campaign_name?: string;
  name?: string;
  marketplace?: string;
  budget?: number;
  monthly_budget?: number;
  daily_budget?: number;
  spend?: number;
  month_to_date_spend?: number;
  mtd_spend?: number;
  projected_spend?: number;
  forecast_spend?: number;
  daily_spend?: number[]; // sparkline series
  spark?: number[];
}

interface PacingResponse {
  date_from?: string;
  date_to?: string;
  month_start?: string;
  campaigns?: PacingRowRaw[];
  items?: PacingRowRaw[];
  error?: string;
}

interface PacingRow {
  id: number | string;
  name: string;
  marketplace: string;
  budget: number; // monthly budget (extrapolated from daily_budget × days_in_month if needed)
  spent: number;
  projected: number;
  spark: number[];
  status: 'under' | 'on-pace' | 'over';
}

function deriveStatus(spent: number, projected: number, budget: number): PacingRow['status'] {
  if (budget <= 0) return 'on-pace';
  // If projected > 105% — over; < 95% — under; otherwise on-pace.
  const ratio = projected / budget;
  if (ratio > 1.05) return 'over';
  if (ratio < 0.95) return 'under';
  return 'on-pace';
}

function normalize(raw: PacingResponse): PacingRow[] {
  const rows = raw.campaigns ?? raw.items ?? [];
  const today = new Date();
  const daysInMonth = new Date(
    today.getUTCFullYear(),
    today.getUTCMonth() + 1,
    0,
  ).getUTCDate();
  const dayOfMonth = Math.max(1, today.getUTCDate());

  return rows.map((r, i) => {
    const monthlyBudget =
      r.monthly_budget ?? r.budget ?? (r.daily_budget != null ? r.daily_budget * daysInMonth : 0);
    const spent = r.month_to_date_spend ?? r.mtd_spend ?? r.spend ?? 0;
    const projected =
      r.projected_spend ?? r.forecast_spend ?? (dayOfMonth > 0 ? (spent / dayOfMonth) * daysInMonth : spent);
    const spark = r.daily_spend ?? r.spark ?? [];
    return {
      id: r.campaign_id ?? `${r.name ?? i}-${i}`,
      name: r.campaign_name ?? r.name ?? '—',
      marketplace: r.marketplace ?? '—',
      budget: Math.max(0, monthlyBudget),
      spent: Math.max(0, spent),
      projected: Math.max(0, projected),
      spark,
      status: deriveStatus(spent, projected, monthlyBudget),
    };
  });
}

const Sparkline: React.FC<{ data: number[]; status: PacingRow['status'] }> = ({ data, status }) => {
  if (data.length < 2) {
    return <span className="text-zinc-300 text-[11px]">—</span>;
  }
  const max = Math.max(...data, 0.0001);
  const w = 80;
  const h = 18;
  const stepX = w / (data.length - 1);
  const path = data
    .map((v, i) => {
      const x = i * stepX;
      const y = h - (v / max) * (h - 2) - 1;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const stroke =
    status === 'over' ? '#dc2626' : status === 'under' ? '#a1a1aa' : '#6E56CF';
  return (
    <svg width={w} height={h} className="inline-block align-middle">
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.25} />
    </svg>
  );
};

const StatusBadge: React.FC<{ status: PacingRow['status'] }> = ({ status }) => {
  const { t } = useTranslation('reports');
  const cfg =
    status === 'over'
      ? {
          icon: AlertTriangle,
          cls: 'bg-red-50 text-red-700 border-red-200',
          label: t('pacing.status.over'),
        }
      : status === 'under'
      ? {
          icon: TrendingUp,
          cls: 'bg-zinc-50 text-zinc-700 border-zinc-200',
          label: t('pacing.status.under'),
        }
      : {
          icon: CheckCircle2,
          cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          label: t('pacing.status.on'),
        };
  const Icon = cfg.icon;
  return (
    <span
      data-testid={`reports-pacing-status-${status}`}
      className={`inline-flex items-center gap-1 h-5 px-1.5 rounded-md border text-[10px] font-medium ${cfg.cls}`}
    >
      <Icon size={10} />
      {cfg.label}
    </span>
  );
};

export const BudgetPacingTab: React.FC<BudgetPacingTabProps> = ({
  marketplaces,
  bookIds,
  accounts,
}) => {
  const { t } = useTranslation('reports');
  const toast = useToast();
  const [rows, setRows] = useState<PacingRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setUnsupported(false);
    apiClient
      .get<PacingResponse>('/api/metrics/budget-pacing', {
        'marketplaces[]': marketplaces,
        'book_ids[]': bookIds?.map(String),
        'accounts[]': accounts,
      })
      .then((res) => {
        if (cancelled) return;
        setRows(normalize(res));
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
          setUnsupported(true);
          setRows([]);
          return;
        }
        toast.error(err instanceof ApiError ? err.message : t('pacing.loadFailed'));
        setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [marketplaces, bookIds, accounts, toast]);

  const sorted = useMemo(() => {
    if (!rows) return [];
    return [...rows].sort((a, b) => b.spent - a.spent);
  }, [rows]);

  if (unsupported) {
    return <ErrorBanner message={t('pacing.unsupported')} />;
  }

  return (
    <Card
      data-testid="reports-pacing-card"
      title={
        <div className="flex items-center gap-2">
          <Wallet size={14} className="text-zinc-400" />
          {t('pacing.title')}
        </div>
      }
    >
      {loading && !rows ? (
        <LoadingRow />
      ) : sorted.length === 0 ? (
        <EmptyState title={t('pacing.empty')} />
      ) : (
        <table className="w-full text-sm table-sticky-head">
          <thead>
            <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
              <th className="text-left px-5 py-2 font-medium">{t('pacing.th.campaign')}</th>
              <th className="text-left px-3 py-2 font-medium">{t('pacing.th.marketplace')}</th>
              <th className="text-right px-3 py-2 font-medium">{t('pacing.th.budget')}</th>
              <th className="text-right px-3 py-2 font-medium">{t('pacing.th.spent')}</th>
              <th className="text-right px-3 py-2 font-medium">{t('pacing.th.utilization')}</th>
              <th className="text-right px-3 py-2 font-medium">{t('pacing.th.projected')}</th>
              <th className="text-left px-3 py-2 font-medium">{t('pacing.th.trend')}</th>
              <th className="text-left px-5 py-2 font-medium">{t('pacing.th.status')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const utilization = r.budget > 0 ? (r.spent / r.budget) * 100 : 0;
              return (
                <tr
                  key={r.id}
                  data-testid={`reports-pacing-row-${r.id}`}
                  className="border-t border-zinc-100 hover:bg-zinc-50/60"
                >
                  <td className="px-5 py-2.5 text-xs text-zinc-900 truncate max-w-[280px]">
                    {r.name}
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-zinc-600 uppercase">
                    {r.marketplace}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-700 text-right tabular-nums">
                    {fmtMoney(r.budget)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-900 text-right tabular-nums">
                    {fmtMoney(r.spent)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-right tabular-nums">
                    <span className={utilization > 100 ? 'text-red-600' : 'text-zinc-700'}>
                      {fmtPct(utilization)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-700 text-right tabular-nums">
                    {fmtMoney(r.projected)}
                  </td>
                  <td className="px-3 py-2.5">
                    <Sparkline data={r.spark} status={r.status} />
                  </td>
                  <td className="px-5 py-2.5">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
};
