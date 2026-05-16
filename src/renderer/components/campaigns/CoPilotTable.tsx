// Phase M.3 — Bid Co-pilot bulk-apply table.
//
// Rendered inside AIAdvisorPanel when mode='copilot'. Pure presentation:
// the parent owns advice state, selection, and "Apply" wiring.
//
// Why split out:
//   - keeps AIAdvisorPanel small (already 300+ lines)
//   - lets us unit-test row math (newBid computation, action badge) without
//     mounting the full streaming-aware panel
//   - reusable later for action-center recommendations

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, PauseCircle } from 'lucide-react';
import type { CoPilotAdviceItem } from '../../api/ai';
import type { Target } from '../../api/targets';
import { fmtMoneyPrecise } from '../../lib/format';

export interface CoPilotRow {
  advice: CoPilotAdviceItem;
  target: Target | undefined;
}

interface Props {
  rows: CoPilotRow[];
  selectedIds: Set<number>;
  onToggle: (targetId: number) => void;
  onToggleAll: (next: boolean) => void;
  currency?: string | null;
  disabled?: boolean;
}

/**
 * Calculate the new bid given the advice item and the current bid. Returns
 * `null` for pause actions or when the math is undefined (e.g. unknown
 * current bid + delta-only advice).
 *
 * Exported for unit-testability — UI uses `formatNewBid` below for display.
 */
export function computeNewBid(
  advice: CoPilotAdviceItem,
  currentBid: number | undefined,
): number | null {
  if (advice.action === 'pause') return null;
  if (typeof currentBid !== 'number' || !Number.isFinite(currentBid)) return null;
  if (typeof advice.multiplier === 'number' && Number.isFinite(advice.multiplier)) {
    return Math.max(0, currentBid * advice.multiplier);
  }
  if (typeof advice.delta === 'number' && Number.isFinite(advice.delta)) {
    return Math.max(0, currentBid + advice.delta);
  }
  return null;
}

export const CoPilotTable: React.FC<Props> = ({
  rows,
  selectedIds,
  onToggle,
  onToggleAll,
  currency,
  disabled,
}) => {
  const { t } = useTranslation('campaigns');
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.advice.target_id));

  return (
    <div
      data-testid="copilot-table"
      className="border border-zinc-200 rounded-md overflow-hidden"
    >
      <table className="w-full text-[11px]">
        <thead className="bg-zinc-50 text-zinc-600">
          <tr>
            <th className="px-2 py-1.5 text-left w-7">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => onToggleAll(e.target.checked)}
                disabled={disabled}
                aria-label={t('details.advisor.coPilot.selectAllAria')}
                data-testid="copilot-select-all"
              />
            </th>
            <th className="px-2 py-1.5 text-left">
              {t('details.advisor.coPilot.th.target')}
            </th>
            <th className="px-2 py-1.5 text-right">
              {t('details.advisor.coPilot.th.currentBid')}
            </th>
            <th className="px-2 py-1.5 text-left">
              {t('details.advisor.coPilot.th.action')}
            </th>
            <th className="px-2 py-1.5 text-right">
              {t('details.advisor.coPilot.th.newBid')}
            </th>
            <th className="px-2 py-1.5 text-left">
              {t('details.advisor.coPilot.th.reason')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { advice, target } = row;
            const selected = selectedIds.has(advice.target_id);
            const label = target?.keyword_text ?? target?.asin ?? target?.category ?? `#${advice.target_id}`;
            const newBid = computeNewBid(advice, target?.bid);
            return (
              <tr
                key={advice.target_id}
                data-testid={`copilot-row-${advice.target_id}`}
                className={`border-t border-zinc-100 ${selected ? 'bg-amber-50/50' : ''}`}
              >
                <td className="px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggle(advice.target_id)}
                    disabled={disabled}
                    aria-label={t('details.advisor.coPilot.selectAria', { target: label })}
                    data-testid={`copilot-select-${advice.target_id}`}
                  />
                </td>
                <td className="px-2 py-1.5 text-zinc-900 truncate max-w-[140px]" title={label}>
                  {label}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-zinc-700">
                  {target ? fmtMoneyPrecise(target.bid, currency) : '—'}
                </td>
                <td className="px-2 py-1.5">
                  <ActionBadge action={advice.action} />
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-zinc-900">
                  {advice.action === 'pause'
                    ? '—'
                    : newBid !== null
                      ? fmtMoneyPrecise(newBid, currency)
                      : '—'}
                </td>
                <td className="px-2 py-1.5 text-zinc-600 max-w-[200px]" title={advice.reason}>
                  <div className="line-clamp-2">{advice.reason}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const ActionBadge: React.FC<{ action: CoPilotAdviceItem['action'] }> = ({ action }) => {
  const { t } = useTranslation('campaigns');
  const map = {
    lower: {
      label: t('details.advisor.coPilot.action.lower'),
      icon: <ArrowDown size={10} />,
      cls: 'bg-amber-100 text-amber-800',
    },
    raise: {
      label: t('details.advisor.coPilot.action.raise'),
      icon: <ArrowUp size={10} />,
      cls: 'bg-emerald-100 text-emerald-800',
    },
    pause: {
      label: t('details.advisor.coPilot.action.pause'),
      icon: <PauseCircle size={10} />,
      cls: 'bg-zinc-200 text-zinc-800',
    },
  } as const;
  const cfg = map[action];
  return (
    <span
      data-testid={`copilot-badge-${action}`}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${cfg.cls}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
};
