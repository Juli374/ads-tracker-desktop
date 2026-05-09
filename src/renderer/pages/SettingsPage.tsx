import React, { useEffect, useState } from 'react';
import {
  KeyRound,
  LogOut,
  Server,
  ShieldCheck,
  Cpu,
  Loader2,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Card, PageHeader } from '../components/ui';
import { AmazonAdsSection } from '../components/AmazonAdsSection';
import { UpdateChecker } from '../components/UpdateChecker';
import { AppInfo } from '../../shared/ipc';

interface ConnectionInfo {
  appInfo: AppInfo | null;
  apiBaseUrl: string | null;
  hasToken: boolean;
  loading: boolean;
}

export const SettingsPage: React.FC = () => {
  const { t } = useTranslation('settings');
  const { user, signOut } = useAuth();
  const toast = useToast();
  const [info, setInfo] = useState<ConnectionInfo>({
    appInfo: null,
    apiBaseUrl: null,
    hasToken: false,
    loading: true,
  });
  const [tokenPreview, setTokenPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
        setInfo({
          appInfo,
          apiBaseUrl,
          hasToken: !!token,
          loading: false,
        });
        if (token) {
          setTokenPreview(maskToken(token));
        }
      } catch (err) {
        if (cancelled) return;
        setInfo((s) => ({ ...s, loading: false }));
        toast.error(err instanceof Error ? err.message : t('errors.load'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const handleCopyUrl = async () => {
    if (!info.apiBaseUrl) return;
    await navigator.clipboard.writeText(info.apiBaseUrl);
    setCopied(true);
    toast.success(t('backend.copied'));
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-6" data-testid="settings-page">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <Card title={t('account.cardTitle')}>
        {info.loading ? (
          <Row label={t('account.status')} value={<Loader2 size={14} className="animate-spin text-zinc-400" />} />
        ) : (
          <>
            <Row
              label={t('account.email')}
              value={user?.email ?? '—'}
              icon={<KeyRound size={14} className="text-zinc-400" />}
            />
            <Row label={t('account.role')} value={<RoleBadge role={user?.role ?? 'user'} />} />
            {user?.full_name && <Row label={t('account.fullName')} value={user.full_name} />}
            <div className="px-5 py-3 border-t border-zinc-100">
              <button
                onClick={signOut}
                className="
                  inline-flex items-center gap-2 h-8 px-3 rounded-md
                  text-xs font-medium text-zinc-700
                  border border-zinc-200 bg-white
                  hover:bg-zinc-50 transition-colors
                "
              >
                <LogOut size={13} />
                {t('account.signOut')}
              </button>
              <p className="text-[11px] text-zinc-400 mt-2">{t('account.signOutHint')}</p>
            </div>
          </>
        )}
      </Card>

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
            <span className="font-mono text-xs text-zinc-700">
              {tokenPreview ?? '—'}
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
      </Card>

      <AmazonAdsSection />

      <UpdateChecker />

      <Card title={t('backend.cardTitle')}>
        <Row
          label={t('backend.baseUrl')}
          value={
            info.apiBaseUrl ? (
              <span className="inline-flex items-center gap-2">
                <Server size={13} className="text-zinc-400" />
                <span className="font-mono text-xs text-zinc-700">{info.apiBaseUrl}</span>
                <button
                  onClick={handleCopyUrl}
                  className="text-zinc-400 hover:text-zinc-700 transition-colors"
                  title={t('backend.copyTitle')}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
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

      <Card title={t('app.cardTitle')}>
        <Row label={t('app.version')} value={info.appInfo?.version ?? '—'} />
        <Row
          label={t('app.platform')}
          value={
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-700">
              <Cpu size={13} className="text-zinc-400" />
              {info.appInfo?.platform ?? '—'}
            </span>
          }
        />
        <Row
          label={t('app.build')}
          value={info.appInfo?.isPackaged ? t('app.buildProduction') : t('app.buildDev')}
        />
        <Row
          label={t('app.language')}
          value={
            <select
              value="en"
              disabled
              aria-label={t('app.language')}
              className="
                h-7 px-2 pr-7 text-xs rounded-md cursor-not-allowed
                border border-zinc-200 bg-zinc-50 text-zinc-700
                focus:outline-none
              "
            >
              <option value="en">{t('app.languageEn')}</option>
              <option value="ru" disabled>{t('app.languageRu')}</option>
            </select>
          }
        />
        <Row
          label={t('app.backendRepo')}
          value={
            <a
              href="https://github.com/Juli374/ads-tracker"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-zinc-700 hover:text-zinc-900"
            >
              Juli374/ads-tracker
              <ExternalLink size={11} />
            </a>
          }
        />
      </Card>
    </div>
  );
};

const Row: React.FC<{
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}> = ({ label, value, icon }) => (
  <div className="px-5 py-3 border-t border-zinc-100 first:border-t-0 flex items-center justify-between gap-4">
    <div className="flex items-center gap-2 text-xs text-zinc-500 min-w-[140px]">
      {icon}
      {label}
    </div>
    <div className="text-sm text-zinc-900 text-right truncate">{value}</div>
  </div>
);

const RoleBadge: React.FC<{ role: string }> = ({ role }) => {
  const tone =
    role === 'admin'
      ? 'bg-violet-50 text-violet-700 border-violet-200'
      : role === 'api_key'
      ? 'bg-zinc-100 text-zinc-700 border-zinc-200'
      : 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return (
    <span
      className={`inline-flex items-center px-2 h-5 rounded-full text-[10px] font-medium uppercase tracking-wider border ${tone}`}
    >
      {role}
    </span>
  );
};

function maskToken(token: string): string {
  if (token.length < 12) return '••••';
  const head = token.slice(0, 8);
  const tail = token.slice(-4);
  return `${head}…${tail}`;
}
