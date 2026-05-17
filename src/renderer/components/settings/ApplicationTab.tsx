import React, { useEffect, useState } from 'react';
import {
  Copyright,
  Cpu,
  ExternalLink,
  FileText,
  FolderOpen,
  GitCommitHorizontal,
  Hash,
  Info,
  KeyRound,
  Loader2,
  LogOut,
  Scale,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '../ui';
import { UpdateChecker } from '../UpdateChecker';
import { ChangePasswordSection } from './ChangePasswordSection';
import { useAuth } from '../../contexts/AuthContext';
import type { AppInfo } from '../../../shared/ipc';

/**
 * Repository URL — single source of truth for the About section's GitHub link.
 * Kept here (not in i18n JSON) so the value can't drift between locales and
 * so the validation in `shell.openExternal` (https-only) is pinned.
 */
const REPO_URL = 'https://github.com/Juli374/ads-tracker-desktop';

export const ApplicationTab: React.FC = () => {
  const { t } = useTranslation('settings');
  const { user, signOut } = useAuth();
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [loading, setLoading] = useState(true);
  // Phase I.2 Lane B — log file path for the Diagnostics block.
  const [logPath, setLogPath] = useState<string | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);
  // Phase I.7 Lane G — Build-time git short SHA, surfaced via IPC.
  // `null` = pending; `'unknown'` is a real value returned for shallow clones / CI snapshots.
  const [gitCommit, setGitCommit] = useState<string | null>(null);

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
    // Best-effort fetch; if the IPC channel is missing (e.g. legacy preload in
    // a hot-reload session) we silently fall back to 'unknown'.
    window.api.app
      .getGitCommit()
      .then((commit) => {
        if (!cancelled) setGitCommit(commit || 'unknown');
      })
      .catch(() => {
        if (!cancelled) setGitCommit('unknown');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // getLogPath landed in Phase I.2 Lane B; older preloads may lack it.
    const getter = window.api?.app?.getLogPath;
    if (typeof getter !== 'function') return;
    getter()
      .then((p) => {
        if (!cancelled) setLogPath(p);
      })
      .catch(() => {
        // Silent — diagnostics row simply shows '—' if path lookup fails.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRevealLog = async () => {
    setRevealError(null);
    try {
      if (!logPath) return;
      await window.api.shell.showItemInFolder(logPath);
    } catch (err) {
      setRevealError(err instanceof Error ? err.message : String(err));
    }
  };

  const openRepo = () => {
    window.api.shell.openExternal(REPO_URL).catch(() => {
      // shell.openExternal rejects on non-https URLs only; REPO_URL is a
      // hard-coded https-prefixed constant, so a rejection here is unexpected
      // and not actionable for the user. Swallow silently.
    });
  };

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

      {/* Phase R.7 — change password section. Only renders for email/password
          accounts; api_key role users (legacy at_live_* installs) skip this. */}
      {user?.role !== 'api_key' && <ChangePasswordSection />}

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

      {/* Phase I.7 Lane G — Branding / About */}
      <Card title={t('about.cardTitle')} data-testid="settings-about-card">
        <Row
          label={t('about.appName')}
          icon={<Info size={13} className="text-zinc-400" />}
          value={
            <span className="text-sm text-zinc-900">{t('about.appNameValue')}</span>
          }
        />
        <Row
          label={t('about.version')}
          icon={<Hash size={13} className="text-zinc-400" />}
          value={
            <span className="font-mono tabular-nums text-xs text-zinc-700">
              {appInfo?.version ?? '—'}
            </span>
          }
        />
        <Row
          label={t('about.commit')}
          icon={<GitCommitHorizontal size={13} className="text-zinc-400" />}
          value={
            <span
              className="font-mono tabular-nums text-xs text-zinc-700"
              data-testid="settings-about-commit"
            >
              {gitCommit ?? '—'}
            </span>
          }
        />
        <Row
          label={t('about.license')}
          icon={<Scale size={13} className="text-zinc-400" />}
          value={
            <span className="text-xs text-zinc-700">{t('about.licenseValue')}</span>
          }
        />
        <Row
          label={t('about.repo')}
          icon={<Copyright size={13} className="text-zinc-400" />}
          value={
            <button
              type="button"
              onClick={openRepo}
              aria-label={t('about.openRepoAria')}
              data-testid="settings-about-repo-link"
              className="inline-flex items-center gap-1 text-xs text-zinc-700 hover:text-zinc-900 transition-colors"
            >
              {t('about.repoLink')}
              <ExternalLink size={11} />
            </button>
          }
        />
      </Card>

      {/* Phase I.2 Lane B — Diagnostics */}
      <Card title={t('diagnostics.cardTitle')}>
        <Row
          label={t('diagnostics.logFile')}
          icon={<FileText size={14} className="text-zinc-400" />}
          value={
            <span
              data-testid="settings-diagnostics-log-path"
              className="text-[11px] font-mono text-zinc-700 break-all"
            >
              {logPath ?? '—'}
            </span>
          }
        />
        <div className="px-5 py-3 border-t border-zinc-100">
          <button
            type="button"
            onClick={handleRevealLog}
            disabled={!logPath}
            data-testid="settings-diagnostics-reveal-log"
            className="
              inline-flex items-center gap-2 h-8 px-3 rounded-md
              text-xs font-medium text-zinc-700
              border border-zinc-200 bg-white
              hover:bg-zinc-50 transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            <FolderOpen size={13} />
            {t('diagnostics.revealLog')}
          </button>
          <p className="text-[11px] text-zinc-400 mt-2">
            {t('diagnostics.revealLogHint')}
          </p>
          {revealError && (
            <p
              role="alert"
              data-testid="settings-diagnostics-reveal-error"
              className="text-[11px] text-red-600 mt-2"
            >
              {revealError}
            </p>
          )}
        </div>
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
