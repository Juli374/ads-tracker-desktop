import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Kpi,
  EmptyState,
  TableSkeletonBody,
  ErrorBanner,
  Pagination,
} from '../ui';
import { useApiQuery } from '../../lib/useApiQuery';
import { marketingStreamApi } from '../../api/marketingStream';
import type { StreamSyncRun, StreamAuditEntry } from '../../api/marketingStream';

const HISTORY_PER_PAGE = 20;

const SILENT = [401, 403, 404];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(startedAt: string, completedAt?: string): string {
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const diffMs = end - start;
  if (isNaN(diffMs) || diffMs < 0) return '—';
  const secs = Math.round(diffMs / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return remainSecs > 0 ? `${mins}m ${remainSecs}s` : `${mins}m`;
}

function formatCountdown(nextRunAt?: string): string | null {
  if (!nextRunAt) return null;
  const diffMs = new Date(nextRunAt).getTime() - Date.now();
  if (isNaN(diffMs) || diffMs <= 0) return null;
  const totalSecs = Math.round(diffMs / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const StatusBadge: React.FC<{ status: StreamSyncRun['status'] }> = ({ status }) => {
  const { t } = useTranslation('settings');
  const classes =
    status === 'success'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : status === 'failed'
      ? 'bg-red-50 text-red-700 border-red-200'
      : 'bg-amber-50 text-amber-700 border-amber-200';
  const labelKey =
    status === 'success'
      ? 'stream.status.idle'
      : status === 'failed'
      ? 'stream.status.error'
      : 'stream.status.running';
  return (
    <span
      className={`inline-flex items-center px-2 h-5 rounded-full text-[10px] font-medium uppercase tracking-wider border ${classes}`}
    >
      {t(labelKey)}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export const StreamTab: React.FC = () => {
  const { t } = useTranslation('settings');

  const statusQ = useApiQuery(() => marketingStreamApi.getStatus(), [], {
    silentStatuses: SILENT,
  });
  const statsQ = useApiQuery(() => marketingStreamApi.getStats(), [], {
    silentStatuses: SILENT,
  });
  const historyQ = useApiQuery(() => marketingStreamApi.getHistory(), [], {
    silentStatuses: SILENT,
  });
  const auditQ = useApiQuery(() => marketingStreamApi.getAudit(), [], {
    silentStatuses: SILENT,
  });

  // Phase J.3 Lane C — countdown ticker.
  // `nextRunAt` is a static ISO string from the server, so we re-render the
  // formatted countdown once a second to keep the "Xm Ys" display live without
  // polling the backend. Cleanup on unmount + when the upstream nextRunAt
  // changes (so we restart cleanly on a new schedule).
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!statusQ.data?.nextRunAt) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [statusQ.data?.nextRunAt]);

  // Re-evaluated on every render — Date.now() inside formatCountdown reads
  // the current clock, and the 1s tick above forces re-renders.
  const countdown = formatCountdown(statusQ.data?.nextRunAt);

  // History pagination — paginate the in-memory list returned by the
  // backend (the endpoint already returns the most-recent slice). We default
  // to 20 rows per page; resetting to page 1 when the upstream list changes
  // length protects against pointing at a now-out-of-bounds page after refetch.
  const runs = historyQ.data?.runs ?? [];
  const auditEntries = auditQ.data?.entries ?? [];

  const [historyPage, setHistoryPage] = useState(1);
  useEffect(() => {
    setHistoryPage(1);
  }, [runs.length]);
  const historyPages = Math.max(1, Math.ceil(runs.length / HISTORY_PER_PAGE));
  const pageRuns = useMemo(
    () =>
      runs.slice(
        (historyPage - 1) * HISTORY_PER_PAGE,
        historyPage * HISTORY_PER_PAGE,
      ),
    [runs, historyPage],
  );

  // Determine global status badge for KPI
  const isRunning = statusQ.data?.isRunning ?? false;
  const statusLabel = isRunning ? t('stream.status.running') : t('stream.status.idle');
  const statusTone = isRunning ? 'positive' : 'default';

  return (
    <div className="space-y-6" data-testid="settings-stream-tab">
      <div>
        <h2 className="text-base font-semibold text-zinc-900">{t('stream.title')}</h2>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi
          label={t('stream.kpi.totalEvents')}
          value={statsQ.loading ? '…' : (statsQ.data?.totalEvents?.toLocaleString() ?? '—')}
          loading={statsQ.loading}
        />
        <Kpi
          label={t('stream.kpi.last24h')}
          value={statsQ.loading ? '…' : (statsQ.data?.last24h?.toLocaleString() ?? '—')}
          loading={statsQ.loading}
        />
        <Kpi
          label={t('stream.kpi.last7d')}
          value={statsQ.loading ? '…' : (statsQ.data?.last7d?.toLocaleString() ?? '—')}
          loading={statsQ.loading}
        />
        <Kpi
          label={t('stream.kpi.status')}
          value={statusQ.loading ? '…' : statusLabel}
          loading={statusQ.loading}
          tone={statusTone}
        />
      </div>

      {/* Countdown — ticks every second via setInterval above. */}
      {!statusQ.loading && countdown != null && (
        <p
          className="text-sm text-zinc-500 tabular-nums"
          data-testid="stream-countdown"
          aria-live="polite"
          aria-label={t('stream.countdown.tickAria')}
        >
          {t('stream.countdown.nextRun', { duration: countdown })}
        </p>
      )}
      {!statusQ.loading && !isRunning && countdown == null && statusQ.data != null && (
        <p
          className="text-sm text-zinc-400"
          data-testid="stream-countdown-never"
        >
          {t('stream.countdown.never')}
        </p>
      )}

      {/* History table */}
      <Card title={t('stream.history.title')}>
        {historyQ.error ? (
          <div className="px-5 py-4">
            <ErrorBanner message={t('stream.history.loadFailed')} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full text-xs text-zinc-700"
              data-testid="stream-history-table"
            >
              <thead>
                <tr className="border-b border-zinc-100 text-[11px] text-zinc-400 uppercase tracking-wide">
                  <th className="px-5 py-2.5 text-left font-medium">
                    {t('stream.history.th.startedAt')}
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium">
                    {t('stream.history.th.status')}
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium">
                    {t('stream.history.th.events')}
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium pr-5">
                    {t('stream.history.th.duration')}
                  </th>
                </tr>
              </thead>
              {historyQ.loading ? (
                <TableSkeletonBody rows={5} columns={4} />
              ) : runs.length === 0 ? (
                <tbody>
                  <tr>
                    <td colSpan={4}>
                      <EmptyState title={t('stream.history.empty')} />
                    </td>
                  </tr>
                </tbody>
              ) : (
                <tbody>
                  {pageRuns.map((run: StreamSyncRun) => (
                    <tr key={run.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                      <td className="px-5 py-2.5">{formatTimestamp(run.startedAt)}</td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={run.status} />
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {run.eventsProcessed.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums pr-5">
                        {formatDuration(run.startedAt, run.completedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
            <Pagination
              page={historyPage}
              pages={historyPages}
              total={runs.length}
              perPage={HISTORY_PER_PAGE}
              onChange={setHistoryPage}
              disabled={historyQ.loading}
            />
          </div>
        )}
      </Card>

      {/* Audit panel */}
      <Card title={t('stream.audit.title')}>
        <div data-testid="stream-audit-panel">
          {auditQ.error ? (
            <div className="px-5 py-4">
              <ErrorBanner message={t('stream.audit.loadFailed')} />
            </div>
          ) : auditQ.loading ? (
            <div className="px-5 py-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-4 bg-zinc-100 animate-pulse rounded-md" />
              ))}
            </div>
          ) : auditEntries.length === 0 ? (
            <EmptyState title={t('stream.audit.empty')} />
          ) : (
            <ul className="divide-y divide-zinc-100">
              {auditEntries.slice(0, 20).map((entry: StreamAuditEntry, idx: number) => (
                <li key={idx} className="px-5 py-2.5 flex items-start gap-3 text-xs">
                  <span className="text-zinc-400 whitespace-nowrap tabular-nums">
                    {formatTimestamp(entry.timestamp)}
                  </span>
                  <span className="text-zinc-700 font-medium">{entry.action}</span>
                  <span className="text-zinc-500">{entry.actor}</span>
                  {entry.details && (
                    <span className="text-zinc-400 truncate">{entry.details}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
};
