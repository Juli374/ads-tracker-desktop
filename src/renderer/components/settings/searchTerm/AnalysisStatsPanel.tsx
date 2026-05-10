import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Play } from 'lucide-react';
import { reportsQueueApi, type AnalysisStats } from '../../../api/reportsQueue';
import { Card } from '../../ui';
import { useToast } from '../../../contexts/ToastContext';
import { ApiError } from '../../../api/client';

interface Props {
  stats: AnalysisStats | null;
  onRefresh: () => void;
}

export const AnalysisStatsPanel: React.FC<Props> = ({ stats, onRefresh }) => {
  const { t } = useTranslation('settings');
  const toast = useToast();
  const [running, setRunning] = useState(false);

  const handleRunNow = async () => {
    setRunning(true);
    try {
      await reportsQueueApi.runAnalysis();
      toast.success(t('searchTerm.analysis.started'));
      onRefresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('searchTerm.errors.startFailed'));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card
      title={t('searchTerm.analysis.title')}
      rightSlot={
        <button
          type="button"
          onClick={handleRunNow}
          disabled={running}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-medium text-white bg-zinc-900 hover:bg-zinc-800 transition-colors disabled:opacity-50"
        >
          {running ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Play size={11} />
          )}
          {t('searchTerm.analysis.runNow')}
        </button>
      }
    >
      <div className="px-5 py-4 grid grid-cols-2 gap-4">
        <div className="space-y-0.5">
          <div className="text-[11px] text-zinc-500">{t('searchTerm.analysis.total')}</div>
          <div className="text-xl font-semibold text-zinc-900 tabular-nums">
            {stats != null ? stats.totalTerms.toLocaleString() : '—'}
          </div>
        </div>
        <div className="space-y-0.5">
          <div className="text-[11px] text-zinc-500">{t('searchTerm.analysis.unanalyzed')}</div>
          <div
            className={`text-xl font-semibold tabular-nums ${
              stats != null && stats.unanalyzed > 0 ? 'text-amber-600' : 'text-zinc-900'
            }`}
          >
            {stats != null ? stats.unanalyzed.toLocaleString() : '—'}
          </div>
        </div>
      </div>
      {stats?.lastRunAt ? (
        <div className="px-5 pb-4 text-[11px] text-zinc-400">
          {t('searchTerm.analysis.lastRun', { date: new Date(stats.lastRunAt).toLocaleString() })}
        </div>
      ) : (
        <div className="px-5 pb-4 text-[11px] text-zinc-400">
          {t('searchTerm.analysis.neverRun')}
        </div>
      )}
    </Card>
  );
};
