import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  BookOpen,
  Search,
  Target,
  FileText,
  Settings,
  Command,
} from 'lucide-react';

import { DashboardPage } from '../pages/DashboardPage';
import { BooksPage } from '../pages/BooksPage';
import { SearchTermsPage } from '../pages/SearchTermsPage';
import { CampaignsPage } from '../pages/CampaignsPage';
import { ReportsPage } from '../pages/ReportsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { NavProvider, useNav, ViewId } from '../contexts/NavContext';
import { CommandPalette } from './CommandPalette';
import { GlobalFilters } from './GlobalFilters';
import { NotificationsBell } from './NotificationsBell';

interface NavItem {
  id: ViewId;
  label: string;
  icon: React.ElementType;
  shortcut?: string;
}

const mainNav: NavItem[] = [
  { id: 'dashboard', label: 'Обзор', icon: LayoutDashboard, shortcut: 'G O' },
  { id: 'books', label: 'Книги', icon: BookOpen, shortcut: 'G B' },
  { id: 'search_terms', label: 'Поисковые запросы', icon: Search, shortcut: 'G S' },
  { id: 'campaigns', label: 'Кампании', icon: Target, shortcut: 'G C' },
  { id: 'reports', label: 'Отчёты', icon: FileText, shortcut: 'G R' },
];

const bottomNav: NavItem[] = [
  { id: 'settings', label: 'Настройки', icon: Settings },
];

export const MainLayout: React.FC = () => (
  <NavProvider initial="dashboard">
    <Layout />
  </NavProvider>
);

// Хоткеи: 'g' включает pending-режим на 1.5 сек, следующая буква в HOTKEY_MAP
// переключает страницу. Игнорируется в input/textarea/contenteditable, при
// активном модификаторе и при открытом модале (data-modal-open на body).
const HOTKEY_MAP: Record<string, ViewId> = {
  o: 'dashboard',
  b: 'books',
  s: 'search_terms',
  c: 'campaigns',
  r: 'reports',
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

const Layout: React.FC = () => {
  const { page, navigate } = useNav();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pendingG = useRef(false);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cmd+K / Ctrl+K — открыть палитру
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (document.body.dataset.modalOpen === 'true') return;

      const key = e.key.toLowerCase();
      if (key === 'g') {
        pendingG.current = true;
        if (pendingTimer.current) clearTimeout(pendingTimer.current);
        pendingTimer.current = setTimeout(() => {
          pendingG.current = false;
        }, 1500);
        return;
      }

      if (pendingG.current && HOTKEY_MAP[key]) {
        e.preventDefault();
        navigate(HOTKEY_MAP[key]);
        pendingG.current = false;
        if (pendingTimer.current) clearTimeout(pendingTimer.current);
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
    };
  }, [navigate]);

  const renderContent = () => {
    switch (page) {
      case 'dashboard':
        return <DashboardPage />;
      case 'books':
        return <BooksPage />;
      case 'search_terms':
        return <SearchTermsPage />;
      case 'campaigns':
        return <CampaignsPage />;
      case 'reports':
        return <ReportsPage />;
      case 'settings':
        return <SettingsPage />;
    }
  };

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = page === item.id;
    return (
      <button
        key={item.id}
        onClick={() => navigate(item.id)}
        className={`
          group flex items-center gap-2.5 w-full h-9 px-3 rounded-md text-sm
          transition-colors duration-100 select-none
          ${isActive
            ? 'bg-zinc-100 text-zinc-900 font-medium'
            : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50'}
        `}
      >
        <Icon
          size={16}
          strokeWidth={2}
          className={isActive ? 'text-zinc-900' : 'text-zinc-500 group-hover:text-zinc-700'}
        />
        <span className="flex-1 text-left truncate">{item.label}</span>
        {item.shortcut && (
          <span
            className={`
              text-[10px] font-mono tracking-wider opacity-0 group-hover:opacity-100
              transition-opacity ${isActive ? 'opacity-60' : ''}
            `}
          >
            {item.shortcut}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-white text-foreground overflow-hidden">
      <header className="h-12 flex-shrink-0 border-b border-zinc-200 flex items-center justify-between px-4 bg-white">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-zinc-900 flex items-center justify-center">
            <span className="text-white text-xs font-bold tracking-tight">A</span>
          </div>
          <span className="text-sm font-semibold text-zinc-900 tracking-tight">
            Ads Tracker
          </span>
          <span className="text-xs text-zinc-400 ml-1">v0.1.0</span>
        </div>

        <div className="flex items-center gap-2">
          <GlobalFilters />
          <button
            onClick={() => setPaletteOpen(true)}
            className="
              flex items-center gap-2 h-7 px-2.5 rounded-md
              text-xs text-zinc-500 hover:text-zinc-900
              hover:bg-zinc-100 transition-colors
            "
            aria-label="Открыть командную палитру"
          >
            <Command size={12} strokeWidth={2} />
            <span>Поиск</span>
            <span className="ml-1 px-1.5 py-0.5 text-[10px] font-mono rounded bg-zinc-100 group-hover:bg-zinc-200 border border-zinc-200">
              ⌘K
            </span>
          </button>

          <NotificationsBell />

          <button className="ml-1 h-7 w-7 rounded-full bg-zinc-200 hover:bg-zinc-300 transition-colors flex items-center justify-center text-xs font-medium text-zinc-700">
            J
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-56 flex-shrink-0 border-r border-zinc-200 bg-white flex flex-col">
          <nav className="flex-1 p-2 space-y-0.5">
            <div className="px-3 pb-1.5 pt-2 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
              Аналитика
            </div>
            {mainNav.map(renderNavItem)}
          </nav>

          <div className="p-2 border-t border-zinc-100 space-y-0.5">
            {bottomNav.map(renderNavItem)}
          </div>

          <div className="px-4 py-2.5 border-t border-zinc-100 text-[11px] text-zinc-400 flex items-center justify-between">
            <span>Подключено</span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Online
            </span>
          </div>
        </aside>

        <main className="flex-1 overflow-auto bg-zinc-50">
          <div className="max-w-6xl mx-auto px-8 py-8">{renderContent()}</div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
};
