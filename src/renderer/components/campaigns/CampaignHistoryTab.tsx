import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, EmptyState, LoadingRow } from '../ui';
import { metricsApi, type CampaignChange } from '../../api/metrics';
import { ApiError } from '../../api/client';

interface Props {
  campaignId: number;
}

interface DayGroup {
  date: string; // YYYY-MM-DD
  changes: CampaignChange[];
}

function groupByDay(changes: CampaignChange[]): DayGroup[] {
  const map = new Map<string, CampaignChange[]>();
  changes.forEach((c) => {
    const date = (c.date ?? '').slice(0, 10) || 'unknown';
    const list = map.get(date);
    if (list) {
      list.push(c);
    } else {
      map.set(date, [c]);
    }
  });
  return Array.from(map.entries())
    .map(([date, list]) => ({ date, changes: list }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export const CampaignHistoryTab: React.FC<Props> = ({ campaignId }) => {
  const { t } = useTranslation('campaigns');
  const [changes, setChanges] = useState<CampaignChange[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    metricsApi
      .campaignAllChanges(campaignId)
      .then((res) => {
        if (!cancelled) setChanges(Array.isArray(res.changes) ? res.changes : []);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setChanges([]);
        } else {
          setError(err instanceof ApiError ? err.message : t('details.history.loadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const groups = useMemo(() => (changes ? groupByDay(changes) : []), [changes]);

  return (
    <Card title={t('details.history.title')}>
      {loading && !changes ? (
        <LoadingRow />
      ) : error ? (
        <div className="px-5 py-4 text-sm text-red-600">{error}</div>
      ) : groups.length === 0 ? (
        <EmptyState title={t('details.history.empty')} />
      ) : (
        <div className="px-5 py-3 space-y-4" data-testid="campaign-history-timeline">
          {groups.map((g) => (
            <div key={g.date}>
              <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide mb-1.5">
                {t('details.history.groupSingleDay', { date: g.date })}
              </div>
              <ul className="space-y-1.5 border-l-2 border-zinc-100 pl-3">
                {g.changes.map((c, i) => (
                  <li
                    key={c.id ?? `${g.date}-${i}`}
                    className="text-xs text-zinc-700"
                  >
                    <span className="font-medium text-zinc-900">{c.field ?? '—'}</span>
                    {c.from_value != null || c.to_value != null ? (
                      <span className="text-zinc-500">
                        {' '}
                        {String(c.from_value ?? '—')} → {String(c.to_value ?? '—')}
                      </span>
                    ) : null}
                    {c.note ? <span className="text-zinc-500"> · {c.note}</span> : null}
                    {c.author ? (
                      <span className="text-zinc-400"> · {c.author}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
