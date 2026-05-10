import React, { useEffect, useState } from 'react';
import {
  Cpu,
  ExternalLink,
  KeyRound,
  Loader2,
  LogOut,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '../ui';
import { UpdateChecker } from '../UpdateChecker';
import { useAuth } from '../../contexts/AuthContext';
import type { AppInfo } from '../../../shared/ipc';

export const ApplicationTab: React.FC = () => {
  const { t } = useTranslation('settings');
  const { user, signOut } = useAuth();
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    window.api.app
      .getInfo()
      .then((info) => {
        if (!cancelled) {
          setAppInfo(info);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6" data-testid="settings-application-tab">
      <Card title={t('account.cardTitle')}>
        {loading ? (
          <Row
            label={t('account.status')}
            value={<Loader2 size={14} className="animate-spin text-zinc-400" />}
          />
        ) : (
          <>
            <Row
              label={t('account.email')}
              value={user?.email ?? '—'}
              icon={<KeyRound size={14} className="text-zinc-400" />}
            />
            <Row
              label={t('account.role')}
              value={<RoleBadge role={user?.role ?? 'user'} />}
            />
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

      <UpdateChecker />

      <Card title={t('app.cardTitle')}>
        <Row label={t('app.version')} value={appInfo?.version ?? '—'} />
        <Row
          label={t('app.platform')}
          value={
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-700">
              <Cpu size={13} className="text-zinc-400" />
              {appInfo?.platform ?? '—'}
            </span>
          }
        />
        <Row
          label={t('app.build')}
          value={appInfo?.isPackaged ? t('app.buildProduction') : t('app.buildDev')}
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
