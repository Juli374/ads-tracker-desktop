import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X } from 'lucide-react';
import { reportsQueueApi, type ReportJob } from '../../../api/reportsQueue';
import { Card, EmptyState } from '../../ui';
import { useToast } from '../../../contexts/ToastContext';
import { ApiError } from '../../../api/client';

const STATUS_CLASS: Record<ReportJob['status'], string> = {
  queued: 'bg-zinc-100 text-zinc-600',
  running: 'bg-blue-50 text-blue-700',
  done: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-700',
};

interface Props {
  jobs: ReportJob[];
  onJobsChange: (jobs: ReportJob[]) => void;
}

export const ReportQueue: React.FC<Props> = ({ jobs, onJobsChange }) => {
  const { t } = useTranslation('settings');
  const toast = useToast();
  const [cancelling, setCancelling] = useState<string | null>(null);

  useEffect(() => {
    const active = jobs.filter((j) => j.status === 'queued' || j.status === 'running');
    if (active.length === 0) return;

    const interval = setInterval(async () => {
      try {
        const updated = await reportsQueueApi.getActiveJobs();
        onJobsChange(updated);
      } catch {
        // ignore poll errors
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [jobs, onJobsChange]);

  const handleCancel = async (jobId: string) => {
    setCancelling(jobId);
    try {
      await reportsQueueApi.cancelJob(jobId);
      const updated = await reportsQueueApi.getActiveJobs();
      onJobsChange(updated);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('searchTerm.errors.statusFailed'));
    } finally {
      setCancelling(null);
    }
  };

  if (jobs.length === 0) {
    return (
      <Card title={t('searchTerm.queue.title')}>
        <EmptyState title={t('searchTerm.queue.empty')} />
      </Card>
    );
  }

  return (
    <Card title={t('searchTerm.queue.title')}>
      <div className="divide-y divide-zinc-100">
        {jobs.map((job) => (
          <div
            key={job.jobId}
            data-testid={`search-term-queue-row-${job.jobId}`}
            className="px-5 py-3 flex items-center gap-3"
          >
            {job.status === 'running' && (
              <Loader2 size={13} className="animate-spin text-blue-600 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-zinc-700 truncate">{job.jobId}</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_CLASS[job.status]}`}
                >
                  {t(`searchTerm.queue.${job.status}`)}
                </span>
              </div>
              {job.status === 'running' && (
                <div className="mt-1 h-1 bg-zinc-100 rounded-full overflow-hidden w-full">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
              )}
              {job.error && (
                <div className="text-[11px] text-red-600 mt-0.5 truncate">{job.error}</div>
              )}
            </div>
            {(job.status === 'queued' || job.status === 'running') && (
              <button
                type="button"
                onClick={() => handleCancel(job.jobId)}
                disabled={cancelling === job.jobId}
                aria-label={t('searchTerm.queue.cancel')}
                className="h-6 w-6 flex items-center justify-center rounded text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {cancelling === job.jobId ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <X size={11} />
                )}
              </button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
};
