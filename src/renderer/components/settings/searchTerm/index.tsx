import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Loader2 } from 'lucide-react';
import { reportsQueueApi, type ReportJob, type ScheduleProfile } from '../../../api/reportsQueue';
import { useApiQuery } from '../../../lib/useApiQuery';
import { ReportQueue } from './ReportQueue';
import { CoverageGrid } from './CoverageGrid';
import { ScheduleProfilesPanel } from './ScheduleProfilesPanel';
import { AnalysisStatsPanel } from './AnalysisStatsPanel';
import { NegativeListsTab } from '../../NegativeListsTab';
import { useToast } from '../../../contexts/ToastContext';
import { ApiError } from '../../../api/client';

export const SearchTermTab: React.FC = () => {
  const { t } = useTranslation('settings');
  const toast = useToast();
  const [starting, setStarting] = useState(false);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [jobs, setJobs] = useState<ReportJob[]>([]);

  const coverageQuery = useApiQuery(
    () => reportsQueueApi.getCoverage(),
    [],
    { silentStatuses: [401, 403, 404] },
  );

  const scheduleProfilesQuery = useApiQuery(
    () => reportsQueueApi.getScheduleProfiles(),
    [],
    { silentStatuses: [401, 403, 404] },
  );

  const analysisStatsQuery = useApiQuery(
    () => reportsQueueApi.getAnalysisStats(),
    [],
    { silentStatuses: [401, 403, 404] },
  );

  // Seed jobs from active queue on mount
  useApiQuery(
    async () => {
      const active = await reportsQueueApi.getActiveJobs();
      setJobs(active);
      return active;
    },
    [],
    { silentStatuses: [401, 403, 404] },
  );

  // Derive account list from coverage or schedule profiles
  const availableAccounts: string[] = React.useMemo(() => {
    const fromCoverage = (coverageQuery.data?.days ?? []).map((d) => d.profileId);
    const fromSchedule = (scheduleProfilesQuery.data ?? []).map((p) => p.profileId);
    return Array.from(new Set([...fromCoverage, ...fromSchedule])).sort();
  }, [coverageQuery.data, scheduleProfilesQuery.data]);

  const handleRunNow = async () => {
    const accounts = selectedAccounts.length > 0 ? selectedAccounts : availableAccounts;
    if (accounts.length === 0) {
      toast.error(t('searchTerm.errors.noAccounts'));
      return;
    }
    setStarting(true);
    try {
      await reportsQueueApi.startQueue(accounts);
      const updated = await reportsQueueApi.getActiveJobs();
      setJobs(updated);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('searchTerm.errors.startFailed'));
    } finally {
      setStarting(false);
    }
  };

  const handleScheduleProfilesChange = (updated: ScheduleProfile[]) => {
    scheduleProfilesQuery.refetch();
    // optimistic update via callback — just refetch
    void updated;
  };

  return (
    <div data-testid="settings-search-term-tab" className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {availableAccounts.length > 0 && (
          <select
            multiple
            value={selectedAccounts}
            onChange={(e) => {
              const opts = Array.from(e.target.selectedOptions).map((o) => o.value);
              setSelectedAccounts(opts);
            }}
            className="h-8 px-2 text-xs rounded-md border border-zinc-200 bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 min-w-[180px] max-h-[64px]"
            aria-label="Select accounts"
          >
            {availableAccounts.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={handleRunNow}
          disabled={starting}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 transition-colors disabled:opacity-50"
        >
          {starting ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Play size={12} />
          )}
          {t('searchTerm.runNow')}
        </button>
      </div>

      <ReportQueue jobs={jobs} onJobsChange={setJobs} />

      <CoverageGrid days={coverageQuery.data?.days ?? []} />

      <ScheduleProfilesPanel
        profiles={scheduleProfilesQuery.data ?? []}
        onProfilesChange={handleScheduleProfilesChange}
      />

      <AnalysisStatsPanel
        stats={analysisStatsQuery.data ?? null}
        onRefresh={() => { void analysisStatsQuery.refetch(); }}
      />

      <NegativeListsTab />
    </div>
  );
};
