import React, { useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApiQuery } from '../../../lib/useApiQuery';
import { useSessionState } from '../../../lib/useSessionState';
import { amazonAdsApi } from '../../../api/amazonAds';
import { syncApi } from '../../../api/syncApi';
import type { SyncOption, SyncJobStatus } from '../../../api/syncApi';
import { ApiError } from '../../../api/client';
import { useToast } from '../../../contexts/ToastContext';
import { Card, ErrorBanner, LoadingRow } from '../../ui';
import { AccountSelector } from './AccountSelector';
import { CountrySelector } from './CountrySelector';
import { SyncOptionsGrid } from './SyncOptionsGrid';
import { SyncQueue } from './SyncQueue';

const DEFAULT_OPTIONS: SyncOption[] = [
  'campaigns',
  'ad_groups',
  'keywords',
  'product_targets',
  'negatives',
  'sb',
];

export const FullSyncTab: React.FC = () => {
  const { t } = useTranslation('settings');
  const toast = useToast();

  const {
    data: profiles,
    loading: profilesLoading,
    error: profilesError,
  } = useApiQuery(() => amazonAdsApi.getProfiles(), [], { silentStatuses: [401, 403, 404] });

  const {
    data: activeJobs,
    loading: activeLoading,
  } = useApiQuery(() => syncApi.active(), [], { silentStatuses: [404] });

  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>(['US']);
  const [selectedOptions, setSelectedOptions] = useState<SyncOption[]>(DEFAULT_OPTIONS);
  const [starting, setStarting] = useState(false);

  const [queueIds, setQueueIds] = useSessionState<string[]>('fullSync:queue', []);
  const [queueJobs, setQueueJobs] = useState<SyncJobStatus[]>(() => activeJobs ?? []);

  // Merge active jobs from bootstrap into local queue once loading completes.
  // activeJobsRef lets us read the latest value inside the effect without
  // re-running whenever the array reference changes.
  const activeJobsRef = useRef(activeJobs);
  activeJobsRef.current = activeJobs;

  React.useEffect(() => {
    if (activeLoading) return;
    const jobs = activeJobsRef.current;
    if (!jobs || jobs.length === 0) return;
    const bootstrapIds = jobs.map((j) => j.jobId);
    setQueueIds((prev) => Array.from(new Set([...prev, ...bootstrapIds])));
    setQueueJobs((prev) => {
      const map = new Map(prev.map((j) => [j.jobId, j]));
      for (const j of jobs) map.set(j.jobId, j);
      return Array.from(map.values());
    });
  }, [activeLoading, setQueueIds]);

  const handleStart = async () => {
    if (selectedAccounts.length === 0) {
      toast.error(t('fullSync.errors.noAccounts'));
      return;
    }
    if (selectedCountries.length === 0) {
      toast.error(t('fullSync.errors.noCountries'));
      return;
    }
    if (selectedOptions.length === 0) {
      toast.error(t('fullSync.errors.noOptions'));
      return;
    }
    setStarting(true);
    try {
      const res = await syncApi.start({
        accounts: selectedAccounts,
        countries: selectedCountries,
        options: selectedOptions,
      });
      setQueueIds((prev) => Array.from(new Set([...prev, res.jobId])));
      toast.success(res.message ?? t('fullSync.started'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('fullSync.errors.startFailed'));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="settings-full-sync-tab">
      <Card title={t('fullSync.title')}>
        {profilesLoading ? (
          <LoadingRow />
        ) : profilesError ? (
          <div className="px-5 py-4">
            <ErrorBanner message={profilesError} />
          </div>
        ) : (
          <div className="px-5 py-4 space-y-5">
            <AccountSelector
              profiles={profiles ?? []}
              selected={selectedAccounts}
              onChange={setSelectedAccounts}
            />
            <CountrySelector
              selected={selectedCountries}
              onChange={setSelectedCountries}
            />
            <SyncOptionsGrid
              selected={selectedOptions}
              onChange={setSelectedOptions}
            />
            <button
              type="button"
              onClick={handleStart}
              disabled={starting}
              data-testid="sync-start-button"
              className="inline-flex items-center gap-1.5 h-8 px-4 rounded-md text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {starting ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RefreshCw size={12} />
              )}
              {t('fullSync.start')}
            </button>
          </div>
        )}
      </Card>

      <Card title={t('fullSync.queueTitle')}>
        <SyncQueue
          jobIds={queueIds}
          jobs={queueJobs}
          onJobsUpdate={setQueueJobs}
        />
      </Card>
    </div>
  );
};
