import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BellOff, History as HistoryIcon } from 'lucide-react';
import { ApiError } from '../api/client';
import {
  actionCenterApi,
  actionTypeLabel,
  entityTypeLabel,
  type ActionLog,
  type MetricsSnapshot,
} from '../api/actionCenter';
import { Card, EmptyState, ErrorBanner, LoadingRow, PageHeader } from '../components/ui';
import { fmtMoney, fmtNumber, fmtPct } from '../lib/format';
import { useToast } from '../contexts/ToastContext';
import { useNav } from '../contexts/NavContext';

export const ActionCenterPage: React.FC = () => {
  const toast = useToast();
  const { navigate } = useNav();
  const [actions, setActions] = useState<ActionLog[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');

  const load = useMemo(
    () => async () => {
      setLoading(true);
      setUnsupported(false);
      try {
        const res = await actionCenterApi.recent({ limit: 100 });
        // Backend на разных деплоях возвращает либо массив, либо { actions, total }.
        const arr = Array.isArray(res) ? res : Array.isArray(res?.actions) ? res.actions : [];
        setActions(arr);
      } catch (err) {
        if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
          setUnsupported(true);
          setActions([]);
          return;
        }
        toast.error(err instanceof ApiError ? err.message : 'Не удалось загрузить ленту');
        setActions([]);
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    load();
  }, [load]);

  const types = useMemo(() => {
    const set = new Set<string>();
    actions?.forEach((a) => a.action_type && set.add(a.action_type));
    return Array.from(set).sort();
  }, [actions]);

  const filtered = useMemo(() => {
    if (!actions) return [];
    if (filterType === 'all') return actions;
    return actions.filter((a) => a.action_type === filterType);
  }, [actions, filterType]);

  // Группируем по дню (created_at YYYY-MM-DD).
  const grouped = useMemo(() => {
    const map = new Map<string, ActionLog[]>();
    for (const a of filtered) {
      const day = (a.created_at || '').slice(0, 10) || 'без даты';
      const existing = map.get(day);
      if (existing) {
        existing.push(a);
      } else {
        map.set(day, [a]);
      }
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Центр действий"
        subtitle={
          unsupported
            ? 'Endpoint недоступен в текущем окружении'
            : actions != null
            ? `${filtered.length} событий за последний период`
            : 'Загрузка…'
        }
      />

      {unsupported && (
        <ErrorBanner message="Endpoint /api/actions/recent вернул 401/403/404. Возможно, фича не задеплоена на этом окружении." />
      )}

      {!unsupported && (
        <Card
          title="Лента"
          rightSlot={
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="
                h-7 pl-2 pr-7 text-xs rounded-md cursor-pointer
                border border-zinc-200 bg-white text-zinc-700
                focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
              "
            >
              <option value="all">Все типы</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {actionTypeLabel(t)}
                </option>
              ))}
            </select>
          }
        >
          {loading && !actions ? (
            <LoadingRow />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={actions?.length === 0 ? 'Нет событий' : 'Ничего не нашлось'}
              hint={
                actions?.length === 0 ? (
                  <span className="inline-flex items-center gap-1.5">
                    <BellOff size={11} />
                    Действия начнут появляться после первых изменений в кампаниях
                  </span>
                ) : undefined
              }
            />
          ) : (
            <div className="divide-y divide-zinc-100">
              {grouped.map(([day, items]) => (
                <DayGroup key={day} day={day} items={items} onNav={navigate} />
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

const DayGroup: React.FC<{
  day: string;
  items: ActionLog[];
  onNav: ReturnType<typeof useNav>['navigate'];
}> = ({ day, items, onNav }) => (
  <div>
    <div className="px-5 py-2 bg-zinc-50/60 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider sticky top-0">
      {day}
    </div>
    <ul className="divide-y divide-zinc-100">
      {items.map((a) => (
        <ActionRow key={a.id} action={a} onNav={onNav} />
      ))}
    </ul>
  </div>
);

const ActionRow: React.FC<{
  action: ActionLog;
  onNav: ReturnType<typeof useNav>['navigate'];
}> = ({ action, onNav }) => {
  const time = (action.created_at || '').slice(11, 16);
  const canDrillCampaign = action.campaign_id != null;

  return (
    <li className="px-5 py-3 hover:bg-zinc-50/40 transition-colors">
      <div className="flex items-start gap-3">
        <HistoryIcon size={13} className="text-zinc-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-semibold text-zinc-900">
              {actionTypeLabel(action.action_type)}
            </span>
            <span className="text-[11px] text-zinc-500">
              · {entityTypeLabel(action.entity_type)}
              {action.entity_name && (
                <span className="text-zinc-700 font-medium ml-1">
                  «{action.entity_name}»
                </span>
              )}
            </span>
            {time && <span className="text-[10px] text-zinc-400 ml-auto">{time}</span>}
          </div>

          {(action.field || action.old_value || action.new_value) && (
            <div className="text-[11px] text-zinc-600 font-mono">
              {action.field && <span className="text-zinc-500">{action.field}: </span>}
              <span className="text-red-600 line-through">{action.old_value ?? '—'}</span>
              <ArrowRight size={10} className="inline mx-1.5 text-zinc-400" />
              <span className="text-emerald-700">{action.new_value ?? '—'}</span>
            </div>
          )}

          {action.reason && (
            <div className="text-[11px] text-zinc-500 italic">{action.reason}</div>
          )}

          {(action.metrics_before || action.metrics_after) && (
            <ImpactRow before={action.metrics_before} after={action.metrics_after} />
          )}

          <div className="flex items-center gap-2 text-[10px] text-zinc-400">
            {action.book_title && <span>📖 {action.book_title}</span>}
            {action.marketplace && <span>· {action.marketplace}</span>}
            {action.source && <span>· {action.source}</span>}
            {canDrillCampaign && (
              <button
                type="button"
                onClick={() =>
                  onNav('campaign_details', { campaignId: action.campaign_id as number })
                }
                className="ml-auto text-zinc-500 hover:text-zinc-900 hover:underline"
              >
                К кампании →
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
};

const ImpactRow: React.FC<{
  before: MetricsSnapshot | null;
  after: MetricsSnapshot | null;
}> = ({ before, after }) => {
  const cells: Array<{ label: string; before?: number; after?: number; fmt: (n?: number) => string }> = [
    { label: 'Spend', before: before?.spend, after: after?.spend, fmt: (n) => fmtMoney(n) },
    { label: 'Sales', before: before?.sales, after: after?.sales, fmt: (n) => fmtMoney(n) },
    { label: 'Orders', before: before?.orders, after: after?.orders, fmt: (n) => fmtNumber(n) },
    { label: 'ACOS', before: before?.acos, after: after?.acos, fmt: (n) => (n != null && n > 0 ? fmtPct(n) : '—') },
  ];
  // Не показываем если все before/after пустые.
  if (cells.every((c) => c.before == null && c.after == null)) return null;

  return (
    <div className="flex flex-wrap gap-3 text-[10px] tabular-nums">
      {cells.map((c) => (
        <span key={c.label} className="text-zinc-500">
          {c.label}:{' '}
          <span className="text-zinc-700">{c.fmt(c.before)}</span>
          <ArrowRight size={9} className="inline mx-1 text-zinc-300" />
          <span className="text-zinc-900 font-medium">{c.fmt(c.after)}</span>
        </span>
      ))}
    </div>
  );
};
