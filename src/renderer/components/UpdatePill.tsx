import React, { useEffect, useState } from 'react';
import { AlertTriangle, Download, Rocket } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import type { UpdateStatus } from '../../shared/ipc';

/**
 * Top-bar update pill. Renders nothing in the quiet states (`idle`,
 * `checking`, `available`, `not-available`, or when auto-update is disabled
 * in dev). Surfaces only the three states a user actually needs to act on:
 *
 *   - downloading → grey "Downloading update X%" with progress bar.
 *   - downloaded  → prominent green "Update vX ready · Restart" button that
 *                   triggers quitAndInstall(). This is the main CTA.
 *   - error       → amber "Update failed · Retry" → calls check() again.
 *
 * Full state breakdown + manual check button live in Settings →
 * Application → UpdateChecker — this pill is the always-on top-bar surface
 * for the actionable transitions only.
 */
export const UpdatePill: React.FC = () => {
  const toast = useToast();
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!window.api?.update) return;
    window.api.update.getStatus().then(setStatus).catch(() => setStatus(null));
    const unsubscribe = window.api.update.onChange?.((next) => setStatus(next));
    return () => {
      unsubscribe?.();
    };
  }, []);

  if (!status || !status.enabled) return null;

  const onRestart = async () => {
    if (!window.api?.update?.quitAndInstall) return;
    setBusy(true);
    try {
      await window.api.update.quitAndInstall();
      // App will quit & relaunch — no further UI needed.
    } catch (err) {
      setBusy(false);
      toast.error(err instanceof Error ? err.message : 'Failed to restart');
    }
  };

  const onRetryCheck = async () => {
    if (!window.api?.update?.check) return;
    setBusy(true);
    try {
      const next = await window.api.update.check();
      setStatus(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update check failed');
    } finally {
      setBusy(false);
    }
  };

  if (status.state === 'downloaded') {
    return (
      <button
        type="button"
        onClick={onRestart}
        disabled={busy}
        data-testid="update-pill-restart"
        title="Restart KDPBook to apply the downloaded update"
        className="
          inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium
          text-white bg-emerald-600 hover:bg-emerald-700 border border-emerald-700
          transition-colors disabled:opacity-50
        "
      >
        <Rocket size={12} />
        Update {status.version ?? ''} ready · Restart
      </button>
    );
  }

  if (status.state === 'downloading') {
    const pct = Math.round(status.progress_percent ?? 0);
    return (
      <div
        data-testid="update-pill-downloading"
        className="
          inline-flex items-center gap-2 h-7 px-2.5 rounded-md text-xs
          text-zinc-600 border border-zinc-200 bg-white
        "
        title={`Downloading update ${status.version ?? ''}`}
      >
        <Download size={12} className="text-zinc-500" />
        <span className="tabular-nums">Downloading {pct}%</span>
        <div className="w-16 h-1 bg-zinc-100 rounded overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
      </div>
    );
  }

  if (status.state === 'error') {
    return (
      <button
        type="button"
        onClick={onRetryCheck}
        disabled={busy}
        data-testid="update-pill-error"
        title={status.error ?? 'Update check failed'}
        className="
          inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs
          text-amber-700 border border-amber-200 bg-amber-50 hover:bg-amber-100
          transition-colors disabled:opacity-50
        "
      >
        <AlertTriangle size={12} />
        Update failed · Retry
      </button>
    );
  }

  // idle / checking / available / not-available → quiet (no surface).
  return null;
};
