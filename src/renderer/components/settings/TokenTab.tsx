import React, { useEffect, useState } from 'react';
import { Check, Copy, RefreshCw, Server, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '../ui';
import { ApiError } from '../../api/client';
import { amazonAdsApi } from '../../api/amazonAds';
import { useToast } from '../../contexts/ToastContext';
import type { AppInfo } from '../../../shared/ipc';

interface ConnectionInfo {
  apiBaseUrl: string | null;
  appInfo: AppInfo | null;
  hasToken: boolean;
  loading: boolean;
}

function maskToken(token: string): string {
  if (token.length < 12) return '••••';
  const head = token.slice(0, 8);
  const tail = token.slice(-4);
  return `${head}…${tail}`;
}

export const TokenTab: React.FC = () => {
  const { t } = useTranslation('settings');
  const toast = useToast();
  const [info, setInfo] = useState<ConnectionInfo>({
    apiBaseUrl: null,
    appInfo: null,
    hasToken: false,
    loading: true,
  });
  const [tokenPreview, setTokenPreview] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedField, setCopiedField] = useState<'url' | 'token' | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [appInfo, apiBaseUrl, token] = await Promise.all([
          window.api.app.getInfo(),
          window.api.app.getApiBaseUrl(),
          window.api.auth.getToken(),
        ]);
        if (cancelled) return;
        setInfo({ appInfo, apiBaseUrl, hasToken: !!token, loading: false });
        if (token) setTokenPreview(maskToken(token));
      } catch (err) {
        if (cancelled) return;
        setInfo((s) => ({ ...s, loading: false }));
        toast.error(err instanceof Error ? err.message : t('errors.load'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast, t]);

  const handleCopy = async (
    text: string | null | undefined,
    field: 'url' | 'token',
  ) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success(t('backend.copied'));
      setTimeout(() => setCopiedField((c) => (c === field ? null : c)), 1500);
    } catch {
      // ignore
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await amazonAdsApi.refreshToken();
      toast.success(t('amazonAds.connected'));
    } catch (err) {
      if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
        toast.error(t('amazonAds.errors.endpointUnavailable'));
      } else {
        toast.error(err instanceof ApiError ? err.message : t('errors.load'));
      }
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="settings-token-tab">
      <Card title={t('apiKey.cardTitle')}>
        <Row
          label={t('apiKey.storage')}
          value={
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-700">
              <ShieldCheck size={13} className="text-emerald-600" />
              {t('apiKey.storageValue')}
            </span>
          }
        />
        <Row
          label={t('apiKey.preview')}
          value={
            <span className="inline-flex items-center gap-2">
              <span className="font-mono text-xs text-zinc-700">
                {tokenPreview ?? '—'}
              </span>
              {tokenPreview ? (
                <button
                  onClick={() =>
                    window.api.auth.getToken().then((tok) => handleCopy(tok, 'token'))
                  }
                  className="text-zinc-400 hover:text-zinc-700 transition-colors"
                  title={t('backend.copyTitle')}
                  aria-label={t('backend.copyTitle')}
                >
                  {copiedField === 'token' ? <Check size={12} /> : <Copy size={12} />}
                </button>
              ) : null}
            </span>
          }
        />
        <Row
          label={t('apiKey.type')}
          value={
            tokenPreview?.startsWith('at_live_')
              ? t('apiKey.typeApiKey')
              : tokenPreview
              ? t('apiKey.typeJwt')
              : '—'
          }
        />
        <div className="px-5 py-3 border-t border-zinc-100">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            data-testid="token-refresh-button"
            className="
              inline-flex items-center gap-2 h-8 px-3 rounded-md
              text-xs font-medium text-zinc-700
              border border-zinc-200 bg-white
              hover:bg-zinc-50 transition-colors disabled:opacity-50
            "
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? t('amazonAds.completing') : t('amazonAds.reconnect')}
          </button>
        </div>
      </Card>

      <Card title={t('backend.cardTitle')}>
        <Row
          label={t('backend.baseUrl')}
          value={
            info.apiBaseUrl ? (
              <span className="inline-flex items-center gap-2">
                <Server size={13} className="text-zinc-400" />
                <span className="font-mono text-xs text-zinc-700">{info.apiBaseUrl}</span>
                <button
                  onClick={() => handleCopy(info.apiBaseUrl, 'url')}
                  className="text-zinc-400 hover:text-zinc-700 transition-colors"
                  title={t('backend.copyTitle')}
                >
                  {copiedField === 'url' ? <Check size={12} /> : <Copy size={12} />}
                </button>
              </span>
            ) : (
              '—'
            )
          }
        />
        <Row
          label={t('backend.overrideEnv')}
          value={
            <span className="font-mono text-[11px] text-zinc-500">
              ADS_TRACKER_API_URL
            </span>
          }
        />
      </Card>
    </div>
  );
};

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="px-5 py-3 border-t border-zinc-100 first:border-t-0 flex items-center justify-between gap-4">
    <div className="flex items-center gap-2 text-xs text-zinc-500 min-w-[140px]">
      {label}
    </div>
    <div className="text-sm text-zinc-900 text-right truncate">{value}</div>
  </div>
);
