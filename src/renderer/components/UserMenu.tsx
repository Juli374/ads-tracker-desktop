import React, { useEffect, useRef, useState } from 'react';
import { Settings, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNav } from '../contexts/NavContext';

export const UserMenu: React.FC = () => {
  const { user, signOut } = useAuth();
  const { navigate } = useNav();
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

  const onSignOut = async () => {
    setOpen(false);
    await signOut();
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="ml-1 h-7 w-7 rounded-full bg-zinc-200 hover:bg-zinc-300 transition-colors flex items-center justify-center text-xs font-medium text-zinc-700"
        aria-label="Меню пользователя"
        aria-expanded={open}
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-40 w-60 bg-white border border-zinc-200 rounded-lg shadow-card overflow-hidden">
          <div className="px-3 py-2.5 border-b border-zinc-100">
            <div className="text-xs font-medium text-zinc-900 truncate">
              {user?.full_name || 'Пользователь'}
            </div>
            <div className="text-[11px] text-zinc-500 truncate">
              {user?.email || '—'}
            </div>
          </div>
          <div className="py-1">
            <MenuItem icon={Settings} label="Настройки" onClick={goToSettings} />
            <MenuItem icon={LogOut} label="Выйти" onClick={onSignOut} tone="danger" />
          </div>
        </div>
      )}
    </div>
  );
};

const MenuItem: React.FC<{
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  tone?: 'default' | 'danger';
}> = ({ icon: Icon, label, onClick, tone = 'default' }) => (
  <button
    onClick={onClick}
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
