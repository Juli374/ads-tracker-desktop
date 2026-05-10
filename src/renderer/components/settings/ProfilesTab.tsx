import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../api/client';
import { amazonAdsApi, type AmazonAdsProfile } from '../../api/amazonAds';
import { Card, EmptyState, LoadingRow } from '../ui';
import { useToast } from '../../contexts/ToastContext';
import { flagFor } from '../../lib/marketplaceFlags';

interface Props {
  onCount?: (count: number) => void;
}

export const ProfilesTab: React.FC<Props> = ({ onCount }) => {
  const { t } = useTranslation('settings');
  const toast = useToast();
  const [profiles, setProfiles] = useState<AmazonAdsProfile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setUnsupported(false);
    try {
      const list = await amazonAdsApi.getProfiles();
      const arr = Array.isArray(list) ? list : [];
      setProfiles(arr);
      onCount?.(arr.length);
    } catch (err) {
      if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
        setUnsupported(true);
        setProfiles([]);
        onCount?.(0);
        return;
      }
      toast.error(err instanceof ApiError ? err.message : t('amazonAds.loadFailed'));
      setProfiles([]);
      onCount?.(0);
    } finally {
      setLoading(false);
    }
  }, [toast, onCount]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await amazonAdsApi.syncProfiles();
      toast.success(t('amazonAds.syncSuccess'));
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('amazonAds.syncFailed'));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card
      title={
        profiles && profiles.length > 0
          ? t('tabs.profilesWithCount', { count: profiles.length })
          : t('tabs.profiles')
      }
      data-testid="settings-profiles-tab"
      rightSlot={
        !unsupported && profiles && profiles.length > 0 ? (
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-medium text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
            {t('amazonAds.syncProfiles')}
          </button>
        ) : null
      }
    >
      {unsupported ? (
        <div className="px-5 py-4 text-xs text-zinc-500">{t('amazonAds.unsupported')}</div>
      ) : loading && !profiles ? (
        <LoadingRow />
      ) : !profiles || profiles.length === 0 ? (
        <EmptyState title={t('amazonAds.emptyHint')} />
      ) : (
        <div className="divide-y divide-zinc-100">
          {profiles.map((p) => (
            <div
              key={p.profile_id}
              className="px-5 py-3 flex items-center gap-3 text-xs"
            >
              <CheckCircle2 size={13} className="text-emerald-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-zinc-900 truncate">
                  {p.account_name ?? t('amazonAds.fallbackProfile', { id: p.profile_id })}
                </div>
                <div className="text-[11px] text-zinc-500">
                  {p.country_code ? (
                    <>
                      {flagFor(p.country_code) ? (
                        <span className="mr-1">{flagFor(p.country_code)}</span>
                      ) : null}
                      {p.country_code}
                    </>
                  ) : (
                    '—'
                  )}
                  {p.currency_code ? ` · ${p.currency_code}` : ''}
                  {p.account_type ? ` · ${p.account_type}` : ''}
                </div>
              </div>
              <div className="text-[10px] font-mono text-zinc-400">
                {p.profile_id}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
