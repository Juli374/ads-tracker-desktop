import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { PnLBookRow } from '../../api/pnl';
import { Card, EmptyState, LoadingRow } from '../ui';
import { fmtMoney, fmtPct } from '../../lib/format';
import { flagFor } from '../../lib/marketplaceFlags';

type SortKey =
  | 'title'
  | 'marketplace'
  | 'revenue'
  | 'spend'
  | 'printCost'
  | 'returns'
  | 'netProfit'
  | 'margin';

interface PnLMatrixProps {
  rows: PnLBookRow[];
  loading?: boolean;
}

const NUM_KEYS: ReadonlyArray<SortKey> = [
  'revenue',
  'spend',
  'printCost',
  'returns',
  'netProfit',
  'margin',
];

export const PnLMatrix: React.FC<PnLMatrixProps> = ({ rows, loading = false }) => {
  const { t } = useTranslation('pnl');
  const [sortKey, setSortKey] = useState<SortKey>('netProfit');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') {
        const cmp = av.localeCompare(bv);
        return sortDir === 'desc' ? -cmp : cmp;
      }
      const an = typeof av === 'number' ? av : 0;
      const bn = typeof bv === 'number' ? bv : 0;
      return sortDir === 'desc' ? bn - an : an - bn;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(NUM_KEYS.includes(key) ? 'desc' : 'asc');
    }
  };

  const renderHeader = (key: SortKey, label: string, align: 'left' | 'right') => (
    <th
      className={`px-3 py-2 font-medium cursor-pointer select-none whitespace-nowrap ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
      onClick={() => toggleSort(key)}
      data-testid={`pnl-sort-${key}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === key && (
          sortDir === 'desc' ? <ArrowDown size={10} /> : <ArrowUp size={10} />
        )}
      </span>
    </th>
  );

  return (
    <Card title={t('matrix.title')} data-testid="pnl-matrix">
      {loading && rows.length === 0 ? (
        <LoadingRow />
      ) : rows.length === 0 ? (
        <EmptyState title={t('matrix.empty')} />
      ) : (
        <table className="w-full text-sm table-sticky-head">
          <thead>
            <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
              {renderHeader('title', t('matrix.th.book'), 'left')}
              {renderHeader('marketplace', t('matrix.th.marketplace'), 'left')}
              {renderHeader('revenue', t('matrix.th.revenue'), 'right')}
              {renderHeader('spend', t('matrix.th.spend'), 'right')}
              {renderHeader('printCost', t('matrix.th.printCost'), 'right')}
              {renderHeader('returns', t('matrix.th.returns'), 'right')}
              {renderHeader('netProfit', t('matrix.th.netProfit'), 'right')}
              {renderHeader('margin', t('matrix.th.margin'), 'right')}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr
                key={`${r.bookId ?? r.title}-${r.marketplace}-${i}`}
                className="border-t border-zinc-100 hover:bg-zinc-50/60"
                data-testid="pnl-row"
              >
                <td className="px-3 py-2.5 text-xs text-zinc-900 truncate max-w-xs">
                  {r.title}
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-600 uppercase whitespace-nowrap">
                  {r.marketplace ? (
                    <>
                      {flagFor(r.marketplace) && (
                        <span className="mr-1">{flagFor(r.marketplace)}</span>
                      )}
                      {r.marketplace}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-900 text-right tabular-nums">
                  {fmtMoney(r.revenue, r.currency)}
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-900 text-right tabular-nums">
                  {fmtMoney(r.spend, r.currency)}
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-700 text-right tabular-nums">
                  {fmtMoney(r.printCost, r.currency)}
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-700 text-right tabular-nums">
                  {fmtMoney(r.returns, r.currency)}
                </td>
                <td className="px-3 py-2.5 text-xs text-right tabular-nums">
                  <span
                    className={
                      r.netProfit < 0 ? 'text-red-600' : 'text-emerald-700 font-medium'
                    }
                  >
                    {fmtMoney(r.netProfit, r.currency)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs text-right tabular-nums">
                  <span className={r.margin < 0 ? 'text-red-600' : 'text-zinc-700'}>
                    {r.revenue > 0 ? fmtPct(r.margin * 100) : '—'}
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
