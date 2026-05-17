import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader,
  RefreshCw,
  Rocket,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from './ui';
import { useToast } from '../contexts/ToastContext';
import type { UpdateStatus } from '../../shared/ipc';

/**
 * Phase Q.5+ — small toggle for an updater preference (e.g. autoDownload).
 * Wired to a controlled boolean; emits onChange on click.
 */
const SettingToggle: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  testId?: string;
}> = ({ checked, onChange, disabled = false, testId }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    data-testid={testId}
    className={`
      relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full
      transition-colors duration-fast ease-smooth
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40
      disabled:opacity-50 disabled:cursor-not-allowed
      ${checked ? 'bg-emerald-500' : 'bg-zinc-300'}
    `}
  >
    <span
      className={`
        inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm
        transition-transform duration-fast ease-smooth
        ${checked ? 'translate-x-[18px]' : 'translate-x-[3px]'}
      `}
    />
  </button>
);

/**
 * UI авто-апдейтера. Подписывается на push-обновления state из main и
 * перерисовывается при каждом изменении (checking → available → downloading
 * → downloaded → error). В dev / unpackaged build — рисует disabled-state.
 *
 * Состояния:
 *   idle / disabled       → "Auto-update disabled (dev build)" + Check button
 *   checking              → spinner + "Checking…"
 *   available             → "Update {version} available" + сообщение, что
 *                           autoDownload скачает автоматически (autoDownload=true).
 *   downloading           → progress bar + percent
 *   downloaded            → "Restart to update" button + version
 *   not-available         → "You are on the latest version"
 *   error                 → red icon + error text + Check button (retry)
 */
export const UpdateChecker: React.FC = () => {
  const { t } = useTranslation('settings');
  const toast = useToast();
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [autoDownloadPending, setAutoDownloadPending] = useState(false);

  useEffect(() => {
    if (!window.api?.update) return;
    // Initial fetch.
    window.api.update
      .getStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
    // Subscribe to push-changes (main эмитит при каждом смене state).
    const unsubscribe = window.api.update.onChange?.((next) => {
      setStatus(next);
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  const handleCheck = async () => {
    if (!window.api?.update) {
      toast.error(t('updates.errors.ipcUnavailable'));
      return;
    }
    setChecking(true);
    try {
      const next = await window.api.update.check();
      setStatus(next);
      if (!next.enabled) {
        toast.info(t('updates.scaffoldDisabled'));
      } else if (next.state === 'available') {
        toast.success(t('updates.available', { version: next.version ?? '' }));
      } else if (next.state === 'not-available') {
        toast.success(t('updates.upToDate'));
      } else if (next.state === 'error') {
        toast.error(next.error ?? t('updates.errors.checkFailed'));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('updates.errors.checkFailed'));
    } finally {
      setChecking(false);
    }
  };

  const handleRestartAndInstall = async () => {
    if (!window.api?.update?.quitAndInstall) {
      toast.error(t('updates.errors.ipcUnavailable'));
      return;
    }
    setInstalling(true);
    try {
      await window.api.update.quitAndInstall();
      // Если quitAndInstall сработает — app закроется сразу, эта строчка не
      // выполнится. Если нет (ошибка / state не downloaded) — освобождаем UI.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('updates.errors.checkFailed'));
    } finally {
      setInstalling(false);
    }
  };

  // Phase Q.5+ — toggle auto-download preference. Persists in main (userData).
  const handleAutoDownloadToggle = async (next: boolean) => {
    if (!window.api?.update?.setAutoDownload) {
      toast.error(t('updates.errors.ipcUnavailable'));
      return;
    }
    setAutoDownloadPending(true);
    try {
      const nextStatus = await window.api.update.setAutoDownload(next);
      setStatus(nextStatus);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('updates.errors.checkFailed'));
    } finally {
      setAutoDownloadPending(false);
    }
  };

  // Phase Q.5+ — manual download (when autoDownload is OFF and update is available).
  const handleDownloadNow = async () => {
    if (!window.api?.update?.downloadNow) {
      toast.error(t('updates.errors.ipcUnavailable'));
      return;
    }
    setDownloading(true);
    try {
      const next = await window.api.update.downloadNow();
      setStatus(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('updates.errors.checkFailed'));
    } finally {
      setDownloading(false);
    }
  };

  const state = status?.state ?? 'idle';
  const enabled = status?.enabled ?? false;

  // === Иконка статуса ===
  const StatusIcon = (() => {
    if (state === 'error') return AlertCircle;
    if (state === 'checking' || state === 'downloading') return Loader;
    if (state === 'available') return Download;
    if (state === 'downloaded') return Rocket;
    return CheckCircle2;
  })();
  const iconClass = (() => {
    if (state === 'error') return 'text-rose-600';
    if (state === 'downloaded') return 'text-emerald-600';
    if (!enabled) return 'text-zinc-400';
    return 'text-emerald-600';
  })();
  const isSpinning = state === 'checking' || state === 'downloading';

  // === Сводный текст состояния ===
  const stateLabel = (() => {
    if (!enabled) return t('updates.scaffoldHint');
    if (state === 'idle') return t('updates.idle');
    if (state === 'checking') return t('updates.checking');
    if (state === 'available') {
      return t('updates.availableLine', { version: status?.version ?? '' });
    }
    if (state === 'downloading') {
      const pct = status?.progress_percent ?? 0;
      return t('updates.downloading', { percent: pct });
    }
    if (state === 'downloaded') {
      return t('updates.downloaded', { version: status?.version ?? '' });
    }
    if (state === 'not-available') return t('updates.upToDate');
    if (state === 'error') return status?.error ?? t('updates.errors.checkFailed');
    return '';
  })();

  const autoDownload = status?.auto_download ?? true;
  const showDownloadNow = enabled && state === 'available' && !autoDownload;
  const releaseUrl =
    status?.release_url ??
    'https://github.com/Juli374/ads-tracker-desktop/releases/latest';
  // Phase Q.5+ — when an unsigned macOS update fails code-signature validation,
  // ShipIt surfaces a `state='error'` with the signature error. Offer a
  // direct download link to the release page so the user can install the
  // new version manually (drag DMG to Applications).
  const showManualDownload = enabled && (state === 'error' || state === 'available');

  const handleOpenRelease = () => {
    if (!window.api?.shell?.openExternal) {
      // Fallback: window.open works in renderer for https URLs.
      window.open(releaseUrl, '_blank');
      return;
    }
    void window.api.shell.openExternal(releaseUrl).catch(() => {
      window.open(releaseUrl, '_blank');
    });
  };

  return (
    <Card title={t('updates.cardTitle')}>
      <div className="px-5 py-4 space-y-3">
        <div className="flex items-center gap-2">
          <StatusIcon
            size={14}
            className={`${iconClass} ${isSpinning ? 'animate-spin' : ''}`}
          />
          <span className="text-sm text-zinc-900">
            {t('updates.currentVersion', { version: status?.current_version ?? '—' })}
          </span>
        </div>
        <div className="text-xs text-zinc-500">{stateLabel}</div>

        {/* Прогресс-бар при скачивании */}
        {state === 'downloading' && typeof status?.progress_percent === 'number' ? (
          <div className="h-1 w-full bg-zinc-100 rounded-sm overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-200 ease-out"
              style={{ width: `${Math.max(0, Math.min(100, status.progress_percent))}%` }}
            />
          </div>
        ) : null}

        <div className="flex items-center gap-2 flex-wrap">
          {/* Restart-кнопка появляется только когда обновление скачано */}
          {state === 'downloaded' ? (
            <button
              type="button"
              onClick={handleRestartAndInstall}
              disabled={installing}
              data-testid="update-restart"
              className="
                inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium
                text-white border border-emerald-500 bg-emerald-500 hover:bg-emerald-600 transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              <Rocket size={12} />
              {t('updates.restartButton')}
            </button>
          ) : null}

          {/* Phase Q.5+ — Download now appears when autoDownload is OFF and update is available */}
          {showDownloadNow ? (
            <button
              type="button"
              onClick={handleDownloadNow}
              disabled={downloading}
              data-testid="update-download-now"
              className="
                inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium
                text-white border border-emerald-500 bg-emerald-500 hover:bg-emerald-600 transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              <Download size={12} className={downloading ? 'animate-pulse' : ''} />
              {t('updates.downloadNow', { defaultValue: 'Download now' })}
            </button>
          ) : null}

          {/* Кнопка ручной проверки — всегда доступна, кроме периода скачивания */}
          <button
            type="button"
            onClick={handleCheck}
            disabled={checking || state === 'checking' || state === 'downloading'}
            data-testid="update-check"
            className="
              inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium
              text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            <RefreshCw size={12} className={checking ? 'animate-spin' : ''} />
            {t('updates.checkButton')}
          </button>

          {/* Phase Q.5+ — manual download escape hatch. Visible when auto-update
              has detected an update OR failed. macOS Sequoia+ rejects unsigned
              .app on code-signature validation regardless of SHA, so this is
              the reliable path. */}
          {showManualDownload ? (
            <button
              type="button"
              onClick={handleOpenRelease}
              data-testid="update-manual-download"
              className="
                inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium
                text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors
              "
            >
              <ExternalLink size={12} />
              {t('updates.manualDownload', { defaultValue: 'Download manually' })}
            </button>
          ) : null}
        </div>

        {/* Phase Q.5+ — explanatory hint when auto-update fails on macOS unsigned builds. */}
        {state === 'error' ? (
          <div className="text-[11px] text-zinc-500 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 leading-relaxed">
            {t('updates.signatureHint', {
              defaultValue:
                'If macOS rejected the update with a signature error, download the new version manually from the release page and drag it into your Applications folder.',
            })}
          </div>
        ) : null}

        {/* Phase Q.5+ — auto-download toggle. Default ON; user can disable. */}
        {enabled ? (
          <div className="pt-3 mt-1 border-t border-zinc-100 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium text-zinc-900">
                {t('updates.autoDownloadLabel', { defaultValue: 'Automatically download updates' })}
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">
                {autoDownload
                  ? t('updates.autoDownloadOnHint', {
                      defaultValue:
                        'New versions download in the background as soon as they appear.',
                    })
                  : t('updates.autoDownloadOffHint', {
                      defaultValue:
                        "You'll see a Download button when a new version is available.",
                    })}
              </div>
            </div>
            <SettingToggle
              checked={autoDownload}
              onChange={handleAutoDownloadToggle}
              disabled={autoDownloadPending}
              testId="update-auto-download-toggle"
            />
          </div>
        ) : null}
      </div>
    </Card>
  );
};
