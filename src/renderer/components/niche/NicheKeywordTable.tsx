// Phase M.1 — Niche Explorer: top-competing-books table.
//
// Renders one row per `NicheKeyword`. The "Est. revenue" column prefers PR's
// own number when present and falls back to our `bsrToRevenue` formula —
// either way we tag the cell with a tooltip explaining the source.
//
// `weakCovers` (set after AI synthesis) is a set of ASINs that earned a
// "weak cover" flag; we render a small badge on those rows so the author can
// scan-find them quickly.

import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ImageOff } from 'lucide-react';
import { fmtNumber, fmtMoney } from '../../lib/format';
import { bsrToRevenue, type Marketplace, type NicheKeyword } from '../../api/niche';

interface Props {
  rows: NicheKeyword[];
  marketplace: Marketplace;
  /** ASINs that the AI synthesis tagged as weak covers. Optional. */
  weakCovers?: Set<string>;
}

/**
 * Render a numeric cell that's either the PR-supplied "estimated revenue"
 * value or a derived BSR-to-revenue estimate. We tag the cell title with a
 * provenance hint so QA / curious users can tell which one they're looking at.
 */
function RevenueCell({ row, marketplace }: { row: NicheKeyword; marketplace: Marketplace }): React.ReactElement {
  const { t } = useTranslation('research');
  // Prefer PR's number when provided; otherwise derive from BSR.
  const derived = !row.estimatedRevenue || row.estimatedRevenue <= 0;
  const value = derived ? bsrToRevenue(row.bsr, marketplace) : row.estimatedRevenue;
  return (
    <span
      className={`tabular-nums ${derived ? 'text-zinc-500 italic' : 'text-zinc-900'}`}
      title={derived ? t('table.estimatedRevenueDerived') : undefined}
    >
      {fmtMoney(value, 'USD')}
    </span>
  );
}

export const NicheKeywordTable: React.FC<Props> = ({ rows, marketplace, weakCovers }) => {
  const { t } = useTranslation('research');

  if (rows.length === 0) {
    return (
      <div
        className="rounded-lg border border-zinc-200 bg-zinc-50 p-6 text-center text-sm text-zinc-500"
        data-testid="niche-table-empty"
      >
        {t('table.noData')}
      </div>
    );
  }

  const weakSet = weakCovers ?? new Set<string>();

  return (
    <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
      <table className="w-full text-sm" data-testid="niche-keyword-table">
        <thead className="bg-white">
          <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide border-b border-zinc-200">
            <th className="text-left px-3 py-2">{t('table.asin')}</th>
            <th className="text-left px-2 py-2">{t('table.bookTitle')}</th>
            <th className="text-right px-2 py-2">{t('table.bsr')}</th>
            <th className="text-right px-2 py-2">{t('table.estimatedRevenue')}</th>
            <th className="text-right px-2 py-2">{t('table.pageCount')}</th>
            <th className="text-right px-2 py-2">{t('table.reviewCount')}</th>
            <th className="text-left px-3 py-2">{t('table.releaseDate')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const isWeak = weakSet.has(row.asin);
            return (
              <tr
                key={`${row.asin || 'noasin'}-${idx}`}
                className="border-b border-zinc-100 hover:bg-zinc-50/60"
                data-testid={`niche-row-${idx}`}
              >
                <td className="px-3 py-2 font-mono text-zinc-900">
                  <div className="flex items-center gap-1.5">
                    {row.asin || <span className="text-zinc-400 italic">—</span>}
                    {isWeak && (
                      <span
                        className="
                          inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded
                          text-[9px] font-semibold uppercase tracking-wider
                          bg-amber-100 text-amber-800
                        "
                        title={t('table.weakCoverHint')}
                        data-testid={`niche-weak-cover-${row.asin}`}
                      >
                        <ImageOff size={9} />
                        {t('table.weakCover')}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-2 text-zinc-900 max-w-[280px] truncate" title={row.title}>
                  {row.title || <span className="text-zinc-400 italic">—</span>}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-zinc-700">
                  {row.bsr > 0 ? fmtNumber(row.bsr) : <span className="text-zinc-300">—</span>}
                </td>
                <td className="px-2 py-2 text-right">
                  <RevenueCell row={row} marketplace={marketplace} />
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-zinc-700">
                  {row.pageCount > 0 ? fmtNumber(row.pageCount) : <span className="text-zinc-300">—</span>}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-zinc-700">
                  {fmtNumber(row.reviewCount)}
                </td>
                <td className="px-3 py-2 text-zinc-500">
                  {row.releaseDate || <span className="text-zinc-300">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-3 py-2 border-t border-zinc-100 flex items-center gap-1.5 text-[11px] text-zinc-400">
        <AlertTriangle size={11} />
        <span>{t('estimateDisclaimer')}</span>
      </div>
    </div>
  );
};
