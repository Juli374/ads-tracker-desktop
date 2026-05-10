import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { XCircle } from 'lucide-react';
import type { SyncJobStatus } from '../../../api/syncApi';
import { syncApi } from '../../../api/syncApi';
import { ApiError } from '../../../api/client';
import { useToast } from '../../../contexts/ToastContext';
import { EmptyState } from '../../ui';

const POLL_INTERVAL_MS = 3000;

interface Props {
  jobIds: string[];
  jobs: SyncJobStatus[];
  onJobsUpdate: (jobs: SyncJobStatus[]) => void;
}

function statusBadgeClass(status: SyncJobStatus['status']): string {
  switch (status) {
    case 'queued':
      return 'bg-zinc-100 text-zinc-600';
    case 'running':
      return 'bg-blue-50 text-blue-700';
    case 'done':
      return 'bg-emerald-50 text-emerald-700';
    case 'failed':
      return 'bg-red-50 text-red-700';
    case 'cancelled':
      return 'bg-zinc-100 text-zinc-500';
    default:
      return 'bg-zinc-100 text-zinc-600';
  }
}

export const SyncQueue: React.FC<Props> = ({ jobIds, jobs, onJobsUpdate }) => {
  const { t } = useTranslation('settings');
  const toast = useToast();

  // Keep latest jobs/callback in refs so the polling interval closure
  // always sees current values without needing to restart the interval.
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const onJobsUpdateRef = useRef(onJobsUpdate);
  onJobsUpdateRef.current = onJobsUpdate;

  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    if (jobIds.length === 0) return;

    const activeStatuses: SyncJobStatus['status'][] = ['queued', 'running'];

    const poll = async () => {
      const currentJobs = jobsRef.current;
      const pendingIds = jobIds.filter((id) => {
        const job = currentJobs.find((j) => j.jobId === id);
        return !job || activeStatuses.includes(job.status);
      });

      if (pendingIds.length === 0) return;

      const updates = await Promise.allSettled(
        pendingIds.map((id) => syncApi.getStatus(id)),
      );

      if (cancelledRef.current) return;

      const newStatuses: SyncJobStatus[] = [];
      updates.forEach((result) => {
        if (result.status === 'fulfilled') {
          newStatuses.push(result.value);
        }
      });

      if (newStatuses.length > 0) {
        const latestJobs = jobsRef.current;
        onJobsUpdateRef.current(
          jobIds
            .map((id) => {
              const updated = newStatuses.find((j) => j.jobId === id);
              const existing = latestJobs.find((j) => j.jobId === id);
              return updated ?? existing ?? null;
            })
            .filter((j): j is SyncJobStatus => j !== null),
        );
      }
    };

    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelledRef.current = true;
      clearInterval(timer);
    };
  }, [jobIds]);

  const handleCancel = async (jobId: string) => {
    try {
      await syncApi.cancel(jobId);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('fullSync.errors.cancelFailed'));
    }
  };

  if (jobs.length === 0) {
    return <EmptyState title={t('fullSync.queue.empty')} />;
  }

  return (
    <div className="divide-y divide-zinc-100" data-testid="sync-queue">
      {jobs.map((job) => {
        const isActive = job.status === 'queued' || job.status === 'running';
        return (
          <div
            key={job.jobId}
            className="px-5 py-3 flex items-center gap-3 text-xs"
            data-testid={`sync-queue-row-${job.jobId}`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-zinc-900 truncate">
                  {job.accountId}
                </span>
                <span className="text-zinc-400">{job.country}</span>
                <span
                  className={`inline-flex items-center px-1.5 h-4 rounded-full text-[10px] font-medium uppercase tracking-wider ${statusBadgeClass(job.status)}`}
                >
                  {t(`fullSync.queue.${job.status}` as 'fullSync.queue.done')}
                </span>
              </div>
              {isActive && (
                <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-zinc-700 h-full rounded-full transition-all duration-500"
                    style={{ width: `${job.progress}%` }}
                    aria-label={t('fullSync.queue.progress', { value: job.progress })}
                  />
                </div>
              )}
              {job.error && (
                <p className="text-[10px] text-red-600 mt-0.5 truncate">{job.error}</p>
              )}
            </div>
            {isActive && (
              <button
                type="button"
                onClick={() => handleCancel(job.jobId)}
                data-testid={`sync-cancel-${job.jobId}`}
                aria-label={t('fullSync.queue.cancel')}
                className="flex-shrink-0 text-zinc-400 hover:text-red-600 transition-colors"
              >
                <XCircle size={14} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};
