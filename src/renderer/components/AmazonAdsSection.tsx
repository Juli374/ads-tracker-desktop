import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import { amazonAdsApi, type AmazonAdsProfile } from '../api/amazonAds';
import { Card } from './ui';
import { useToast } from '../contexts/ToastContext';
import { useDeepLink } from '../lib/useDeepLink';

const REDIRECT_URI = 'ads-tracker-desktop://callback';

export const AmazonAdsSection: React.FC = () => {
  const { t } = useTranslation('settings');
  const toast = useToast();
  const [profiles, setProfiles] = useState<AmazonAdsProfile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [oauthState, setOauthState] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    setUnsupported(false);
    try {
      const list = await amazonAdsApi.getProfiles();
      setProfiles(Array.isArray(list) ? list : []);
    } catch (err) {
      if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
        setUnsupported(true);
        setProfiles([]);
        return;
      }
      toast.error(err instanceof ApiError ? err.message : t('amazonAds.loadFailed'));
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  useDeepLink(
    useCallback(
      async (event) => {
        let url: URL;
        try {
          url = new URL(event.url);
        } catch {
          return;
        }
        if (url.host !== 'callback' && url.pathname.replace(/\/+/g, '') !== 'callback') return;
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        if (!code) {
          toast.error(t('amazonAds.errors.missingCode'));
          return;
        }
        if (!oauthState || !state || state !== oauthState) {
          toast.error(t('amazonAds.errors.stateMismatch'));
          return;
        }
        setCompleting(true);
        try {
          await amazonAdsApi.completeOAuth(code, state ?? '', REDIRECT_URI);
          toast.success(t('amazonAds.connected'));
          setOauthState(null);
          loadProfiles();
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : t('amazonAds.errors.callbackFailed'));
        } finally {
          setCompleting(false);
        }
      },
      [oauthState, loadProfiles, toast],
    ),
  );

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await amazonAdsApi.startOAuth(REDIRECT_URI);
      setOauthState(res.state);
      await window.api.shell.openExternal(res.url);
      toast.info(t('amazonAds.openHint'));
    } catch (err) {
      if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
        toast.error(t('amazonAds.errors.endpointUnavailable'));
      } else {
        toast.error(err instanceof ApiError ? err.message : t('amazonAds.errors.startFailed'));
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    try {
      await amazonAdsApi.syncProfiles();
      toast.success(t('amazonAds.syncSuccess'));
      await loadProfiles();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('amazonAds.syncFailed'));
    }
  };

  return (
    <Card
      title={t('amazonAds.cardTitle')}
      rightSlot={
        !unsupported && profiles && profiles.length > 0 ? (
          <button
            type="button"
            onClick={handleSync}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-medium text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors"
          >
            <RefreshCw size={11} />
            {t('amazonAds.syncProfiles')}
          </button>
        ) : null
      }
    >
      {unsupported ? (
        <div className="px-5 py-4 text-xs text-zinc-500">{t('amazonAds.unsupported')}</div>
      ) : loading && !profiles ? (
        <div className="px-5 py-4 text-xs text-zinc-400">{t('amazonAds.loading')}</div>
      ) : !profiles || profiles.length === 0 ? (
        <div className="px-5 py-4 space-y-3">
          <div className="text-xs text-zinc-500">{t('amazonAds.emptyHint')}</div>
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting || completing}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {connecting || completing ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <ExternalLink size={12} />
            )}
            {completing
              ? t('amazonAds.completing')
              : connecting
              ? t('amazonAds.connecting')
              : t('amazonAds.connect')}
          </button>
          <div className="text-[10px] text-zinc-400 font-mono">
            {t('amazonAds.redirectUriPrefix', { uri: REDIRECT_URI })}
          </div>
        </div>
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
                  {p.country_code ?? '—'}
                  {p.currency_code ? ` · ${p.currency_code}` : ''}
                  {p.account_type ? ` · ${p.account_type}` : ''}
                </div>
              </div>
              <div className="text-[10px] font-mono text-zinc-400">
                {p.profile_id}
              </div>
            </div>
          ))}
          <div className="px-5 py-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleConnect}
              disabled={connecting || completing}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-medium text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors disabled:opacity-50"
            >
              {connecting || completing ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <ExternalLink size={11} />
              )}
              {completing ? t('amazonAds.reconnectShort') : t('amazonAds.reconnect')}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
};
