import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { reportsQueueApi, type ScheduleProfile } from '../../../api/reportsQueue';
import { Card, EmptyState } from '../../ui';
import { useToast } from '../../../contexts/ToastContext';
import { ApiError } from '../../../api/client';

interface Props {
  profiles: ScheduleProfile[];
  onProfilesChange: (profiles: ScheduleProfile[]) => void;
}

export const ScheduleProfilesPanel: React.FC<Props> = ({ profiles, onProfilesChange }) => {
  const { t } = useTranslation('settings');
  const toast = useToast();
  const [toggling, setToggling] = useState<string | null>(null);

  const handleToggle = async (profile: ScheduleProfile) => {
    setToggling(profile.profileId);
    try {
      await reportsQueueApi.setScheduleProfile(profile.profileId, !profile.scheduled);
      onProfilesChange(
        profiles.map((p) =>
          p.profileId === profile.profileId ? { ...p, scheduled: !p.scheduled } : p,
        ),
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('searchTerm.errors.scheduleFailed'));
    } finally {
      setToggling(null);
    }
  };

  if (profiles.length === 0) {
    return (
      <Card title={t('searchTerm.schedule.title')}>
        <EmptyState title={t('searchTerm.schedule.noProfiles')} />
      </Card>
    );
  }

  return (
    <Card title={t('searchTerm.schedule.title')}>
      <div className="divide-y divide-zinc-100">
        {profiles.map((profile) => (
          <div
            key={profile.profileId}
            data-testid={`search-term-schedule-row-${profile.profileId}`}
            className="px-5 py-3 flex items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-zinc-900 truncate">
                {profile.accountName || profile.profileId}
              </div>
              <div className="text-[11px] font-mono text-zinc-400">{profile.profileId}</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={profile.scheduled}
              aria-label={t('searchTerm.schedule.toggleAria', { name: profile.accountName || profile.profileId })}
              onClick={() => handleToggle(profile)}
              disabled={toggling === profile.profileId}
              className={`
                relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent
                transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-zinc-900/20
                disabled:opacity-50 cursor-pointer
                ${profile.scheduled ? 'bg-zinc-900' : 'bg-zinc-200'}
              `}
            >
              {toggling === profile.profileId ? (
                <span className="absolute inset-0 flex items-center justify-center">
                  <Loader2 size={10} className="animate-spin text-white" />
                </span>
              ) : (
                <span
                  className={`
                    pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow
                    transform transition duration-200
                    ${profile.scheduled ? 'translate-x-4' : 'translate-x-0'}
                  `}
                />
              )}
            </button>
            <span className="text-[11px] text-zinc-500 w-16 text-right">
              {profile.scheduled
                ? t('searchTerm.schedule.enabled')
                : t('searchTerm.schedule.disabled')}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
};
