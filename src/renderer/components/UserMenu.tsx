import React, { useEffect, useRef, useState } from 'react';
import { Settings, LogOut, Moon, Sun, Monitor, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useNav } from '../contexts/NavContext';
import { useTheme, type ThemeMode } from '../contexts/ThemeContext';

export const UserMenu: React.FC = () => {
  const { t } = useTranslation('settings');
  const { user, signOut } = useAuth();
  const { navigate } = useNav();
  const { mode, setMode } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const initial = (user?.full_name || user?.email || '?').trim().charAt(0).toUpperCase();

  const goToSettings = () => {
    navigate('settings');
    setOpen(false);
  };

  const goToProfile = () => {
    navigate('profile');
    setOpen(false);
  };

  const onSignOut = async () => {
    setOpen(false);
    await signOut();
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="ml-1 h-7 w-7 rounded-full bg-zinc-200 hover:bg-zinc-300 transition-colors flex items-center justify-center text-xs font-medium text-zinc-700"
        aria-label={t('userMenu.userAria')}
        aria-expanded={open}
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-40 w-60 bg-white border border-zinc-200 rounded-lg shadow-card overflow-hidden">
          <div className="px-3 py-2.5 border-b border-zinc-100">
            <div className="text-xs font-medium text-zinc-900 truncate">
              {user?.full_name || t('userMenu.fallbackUser')}
            </div>
            <div className="text-[11px] text-zinc-500 truncate">
              {user?.email || '—'}
            </div>
          </div>
          <div className="px-3 py-2 border-b border-zinc-100">
            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              {t('userMenu.themeLabel')}
            </div>
            <ThemeSegment mode={mode} onChange={setMode} />
          </div>
          <div className="py-1">
            <MenuItem icon={User} label={t('userMenu.profile')} onClick={goToProfile} testId="user-menu-profile" />
            <MenuItem icon={Settings} label={t('userMenu.settings')} onClick={goToSettings} />
            <MenuItem icon={LogOut} label={t('userMenu.signOut')} onClick={onSignOut} tone="danger" />
          </div>
        </div>
      )}
    </div>
  );
};

const ThemeSegment: React.FC<{
  mode: ThemeMode;
  onChange: (m: ThemeMode) => void;
}> = ({ mode, onChange }) => {
  const { t } = useTranslation('settings');
  const opts: Array<{ id: ThemeMode; labelKey: 'userMenu.themeLight' | 'userMenu.themeDark' | 'userMenu.themeSystem'; Icon: React.ElementType }> = [
    { id: 'light', labelKey: 'userMenu.themeLight', Icon: Sun },
    { id: 'dark', labelKey: 'userMenu.themeDark', Icon: Moon },
    { id: 'system', labelKey: 'userMenu.themeSystem', Icon: Monitor },
  ];
  return (
    <div role="radiogroup" aria-label={t('userMenu.themeAria')} className="inline-flex w-full bg-zinc-100 rounded-md p-0.5">
      {opts.map(({ id, labelKey, Icon }) => {
        const label = t(labelKey);
        const active = mode === id;
        return (
          <button
            key={id}
            role="radio"
            aria-checked={active}
            aria-label={t('userMenu.themeOptionAria', { label })}
            type="button"
            onClick={() => onChange(id)}
            className={`
              flex-1 inline-flex items-center justify-center gap-1 h-7 rounded text-[11px] font-medium
              transition-colors
              ${active ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'}
            `}
          >
            <Icon size={11} />
            {label}
          </button>
        );
      })}
    </div>
  );
};

const MenuItem: React.FC<{
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  tone?: 'default' | 'danger';
  testId?: string;
}> = ({ icon: Icon, label, onClick, tone = 'default', testId }) => (
  <button
    onClick={onClick}
    data-testid={testId}
    className={`
      w-full flex items-center gap-2.5 px-3 h-8 text-sm text-left
      transition-colors
      ${tone === 'danger'
        ? 'text-red-600 hover:bg-red-50'
        : 'text-zinc-700 hover:bg-zinc-50'}
    `}
  >
    <Icon size={13} className="flex-shrink-0" />
    <span className="text-xs">{label}</span>
  </button>
);
