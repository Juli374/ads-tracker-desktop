import React, { useCallback, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../api/client';
import { amazonAdsApi } from '../../api/amazonAds';
import { Card } from '../ui';
import { useToast } from '../../contexts/ToastContext';
import { useDeepLink } from '../../lib/useDeepLink';

const REDIRECT_URI = 'ads-tracker-desktop://callback';

export const CredentialsTab: React.FC = () => {
  const { t } = useTranslation('settings');
  const toast = useToast();
  const [connecting, setConnecting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [oauthState, setOauthState] = useState<string | null>(null);

  useDeepLink(
    useCallback(
      async (event) => {
        let url: URL;
        try {
          url = new URL(event.url);
        } catch {
          return;
        }
        if (url.host !== 'callback' && url.pathname.replace(/\/+/g, '') !== 'callback')
          return;
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
        } catch (err) {
          toast.error(
            err instanceof ApiError ? err.message : t('amazonAds.errors.callbackFailed'),
          );
        } finally {
          setCompleting(false);
        }
      },
      [oauthState, toast],
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

  return (
    <Card title={t('credentials.cardTitle')} data-testid="settings-credentials-tab">
      <div className="px-5 py-4 space-y-3">
        <div className="text-xs text-zinc-500">{t('credentials.subtitle')}</div>
        <button
          type="button"
          onClick={handleConnect}
          disabled={connecting || completing}
          data-testid="credentials-connect-button"
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
    </Card>
  );
};
