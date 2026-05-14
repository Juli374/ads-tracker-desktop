import React from 'react';
import { useTranslation } from 'react-i18next';
import { DollarSign, PiggyBank, Target, Percent } from 'lucide-react';
import type { PnLTotals } from '../../api/pnl';
import { Kpi } from '../ui';
import { fmtMoney, fmtPct } from '../../lib/format';

interface PnLKpiRowProps {
  totals: PnLTotals;
  loading?: boolean;
}

export const PnLKpiRow: React.FC<PnLKpiRowProps> = ({ totals, loading = false }) => {
  const { t } = useTranslation('pnl');
  const marginPct = totals.margin * 100;
  return (
    <div className="grid grid-cols-4 gap-3" data-testid="pnl-kpi-row">
      <Kpi
        label={t('kpi.revenue')}
        value={fmtMoney(totals.revenue)}
        hint={
          <span className="inline-flex items-center gap-1">
            <DollarSign size={11} /> {t('kpiHint.revenue')}
          </span>
        }
        loading={loading}
      />
      <Kpi
        label={t('kpi.spend')}
        value={fmtMoney(totals.spend)}
        hint={
          <span className="inline-flex items-center gap-1">
            <Target size={11} /> {t('kpiHint.spend')}
          </span>
        }
        loading={loading}
      />
      <Kpi
        label={t('kpi.netProfit')}
        value={fmtMoney(totals.netProfit)}
        tone={totals.netProfit < 0 ? 'negative' : 'positive'}
        hint={
          <span className="inline-flex items-center gap-1">
            <PiggyBank size={11} /> {t('kpiHint.netProfit')}
          </span>
        }
        loading={loading}
      />
      <Kpi
        label={t('kpi.margin')}
        value={totals.revenue > 0 ? fmtPct(marginPct) : '—'}
        tone={marginPct < 0 ? 'negative' : 'positive'}
        hint={
          <span className="inline-flex items-center gap-1">
            <Percent size={11} /> {t('kpiHint.margin')}
          </span>
        }
        loading={loading}
      />
    </div>
  );
};
