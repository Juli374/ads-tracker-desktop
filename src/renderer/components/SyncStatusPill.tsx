import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw, AlertTriangle, ChevronDown, X } from 'lucide-react';
import { syncApi, type SyncJobStatus, type SyncOption } from '../api/syncApi';
import { ApiError } from '../api/client';
import { useToast } from '../contexts/ToastContext';

const LAST_SYNC_KEY = 'ads-tracker:last-sync-at';
const POLL_INTERVAL_ACTIVE_MS = 5_000;
const POLL_INTERVAL_IDLE_MS = 60_000;
const DEFAULT_OPTIONS: SyncOption[] = [
  'campaigns',
  'ad_groups',
  'keywords',
  'product_targets',
  'negatives',
];

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function aggregateProgress(jobs: SyncJobStatus[]): number {
  const running = jobs.filter((j) => j.status === 'queued' || j.status === 'running');
  if (running.length === 0) return 0;
  const sum = running.reduce((a, j) => a + (j.progress ?? 0), 0);
  return Math.round(sum / running.length);
}

export const SyncStatusPill: React.FC = () => {
  const { t } = useTranslation('common');
  const toast = useToast();
  const [active, setActive] = useState<SyncJobStatus[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(LAST_SYNC_KEY);
    } catch {
      return null;
    }
  });
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  // Track which jobs we've already seen to detect running→done transitions.
  const prevJobIdsRef = useRef<Set<string>>(new Set());

  const refreshActive = useCallback(async () => {
    try {
      const jobs = await syncApi.active();
      const safe = Array.isArray(jobs) ? jobs : [];
      // If a job we were watching is gone from `active`, treat it as completed
      // (`active` endpoint excludes done/failed/cancelled). Stamp last-sync.
      const stillActive = new Set(safe.map((j) => j.jobId));
      let finishedAny = false;
      prevJobIdsRef.current.forEach((id) => {
        if (!stillActive.has(id)) finishedAny = true;
      });
      if (finishedAny) {
        const now = new Date().toISOString();
        setLastSyncAt(now);
        try {
          window.localStorage.setItem(LAST_SYNC_KEY, now);
        } catch {
          // Storage quota / privacy mode — pill still works, just won't survive reload.
        }
      }
      prevJobIdsRef.current = stillActive;
      setActive(safe);
      setError(null);
    } catch (err) {
      // Backend might not have /sync/active wired in the current env. Don't
      // toast — just keep the pill quiet so the user isn't spammed every poll.
      if (err instanceof ApiError && err.status !== 404) {
        setError(err.message);
      }
    }
  }, []);

  // Polling cadence depends on whether something is currently running.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      if (cancelled) return;
      await refreshActive();
      if (cancelled) return;
      const isActive = active.length > 0;
      timer = setTimeout(tick, isActive ? POLL_INTERVAL_ACTIVE_MS : POLL_INTERVAL_IDLE_MS);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // We intentionally key the effect on the boolean "is anything running",
    // not the array identity — otherwise every poll restarts the timer.
  }, [active.length === 0, refreshActive]);

  // Close popover on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const runningCount = active.filter((j) => j.status === 'running' || j.status === 'queued').length;
  const isRunning = runningCount > 0;
  const progressPct = aggregateProgress(active);

  const onSyncNow = async () => {
    setStarting(true);
    try {
      // Default sync — backend resolves "all connected accounts × all
      // marketplaces" when accounts/countries are empty. If a Settings → Full
      // Sync configurator is later added, surface its preferences here.
      const res = await syncApi.start({
        accounts: [],
        countries: [],
        options: DEFAULT_OPTIONS,
      });
      toast.success(t('sync.started', { defaultValue: 'Sync started' }) + (res.message ? `: ${res.message}` : ''));
      await refreshActive();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('sync.startFailed', { defaultValue: 'Failed to start sync' }));
    } finally {
      setStarting(false);
    }
  };

  const onCancel = async (jobId: string) => {
    try {
      await syncApi.cancel(jobId);
      await refreshActive();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('sync.cancelFailed', { defaultValue: 'Failed to cancel job' }));
    }
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        data-testid="sync-status-pill"
        onClick={() => setOpen((v) => !v)}
        title={
          isRunning
            ? t('sync.runningTitle', { defaultValue: 'Sync in progress' })
            : t('sync.idleTitle', { defaultValue: 'Open sync menu' })
        }
        className={`
          flex items-center gap-1.5 h-7 px-2.5 rounded-md
          text-xs transition-colors border
          ${isRunning
            ? 'text-blue-700 border-blue-200 bg-blue-50 hover:bg-blue-100'
            : error
            ? 'text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100'
            : 'text-zinc-600 border-zinc-200 bg-white hover:bg-zinc-50 hover:text-zinc-900'}
        `}
      >
        {isRunning ? (
          <Loader2 size={12} className="animate-spin" />
        ) : error ? (
          <AlertTriangle size={12} />
        ) : (
          <RefreshCw size={12} />
        )}
        <span className="tabular-nums">
          {isRunning
            ? `Syncing ${progressPct}%`
            : lastSyncAt
            ? `Synced ${formatRelative(lastSyncAt)}`
            : 'Not synced'}
        </span>
        <ChevronDown size={11} className="text-zinc-400" />
      </button>

      {open && (
        <div
          data-testid="sync-status-popover"
          className="absolute right-0 top-9 z-40 w-80 rounded-lg border border-zinc-200 bg-white shadow-lg p-3 space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-zinc-900">
              Amazon Ads sync
            </div>
            <button
              type="button"
              onClick={onSyncNow}
              disabled={starting || isRunning}
              data-testid="sync-now-button"
              className="
                inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md
                text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors
              "
            >
              {starting ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              {isRunning ? 'Running…' : 'Sync now'}
            </button>
          </div>

          {error && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              {error}
            </div>
          )}

          {active.length === 0 ? (
            <div className="text-[11px] text-zinc-500">
              {lastSyncAt
                ? `Last successful sync: ${formatRelative(lastSyncAt)}`
                : 'No sync has run yet on this device.'}
            </div>
          ) : (
            <ul className="space-y-1.5 max-h-64 overflow-y-auto">
              {active.map((j) => (
                <li
                  key={j.jobId}
                  className="flex items-center gap-2 text-[11px] text-zinc-700 border border-zinc-100 rounded px-2 py-1.5"
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium text-zinc-900">
                      {j.country} · {j.accountId}
                    </div>
                    <div className="text-zinc-500 mt-0.5 flex items-center gap-1.5">
                      <span className="capitalize">{j.status}</span>
                      <span className="tabular-nums">{Math.round(j.progress ?? 0)}%</span>
                      {j.error && <span className="text-red-600 truncate">— {j.error}</span>}
                    </div>
                    <div className="mt-1 h-1 bg-zinc-100 rounded overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${Math.min(100, Math.max(0, j.progress ?? 0))}%` }}
                      />
                    </div>
                  </div>
                  {(j.status === 'queued' || j.status === 'running') && (
                    <button
                      type="button"
                      onClick={() => onCancel(j.jobId)}
                      data-testid={`sync-cancel-${j.jobId}`}
                      title="Cancel this job"
                      className="h-6 w-6 inline-flex items-center justify-center rounded text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100"
                    >
                      <X size={11} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="text-[10px] text-zinc-400 leading-relaxed border-t border-zinc-100 pt-2">
            Need granular control (per-account, per-marketplace, specific entity types)?{' '}
            Open Settings → Full Sync.
          </div>
        </div>
      )}
    </div>
  );
};
