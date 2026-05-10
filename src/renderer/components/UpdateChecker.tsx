import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader,
  RefreshCw,
  Rocket,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from './ui';
import { useToast } from '../contexts/ToastContext';
import type { UpdateStatus } from '../../shared/ipc';

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
              className="h-full bg-violet-600 transition-all duration-200 ease-out"
              style={{ width: `${Math.max(0, Math.min(100, status.progress_percent))}%` }}
            />
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          {/* Restart-кнопка появляется только когда обновление скачано */}
          {state === 'downloaded' ? (
            <button
              type="button"
              onClick={handleRestartAndInstall}
              disabled={installing}
              data-testid="update-restart"
              className="
                inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium
                text-white border border-violet-600 bg-violet-600 hover:bg-violet-700 transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              <Rocket size={12} />
              {t('updates.restartButton')}
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
        </div>
      </div>
    </Card>
  );
};
