import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  BookOpen,
  Search,
  Target,
  FileText,
  Settings,
  Ban,
  Command,
  Key,
  History,
  Zap,
  Activity,
  GitCompare,
  Wallet,
  ClipboardList,
  Coins,
  Sparkles,
  Loader2,
} from 'lucide-react';

// Eagerly loaded — самые посещаемые страницы (стартовый экран).
import { DashboardPage } from '../pages/DashboardPage';
import { BooksPage } from '../pages/BooksPage';
import { CampaignsPage } from '../pages/CampaignsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { CalendarBell } from './CalendarBell';

// Lazy-loaded — остальные страницы вытягиваются по требованию.
// Каждая идёт в отдельный chunk → ~150–250 KB gzip с initial bundle.
// Recharts тащится через Dashboard (eager), но также через Reports (lazy) —
// будет split в свой chunk автоматически.
const SearchTermsPage = lazy(() =>
  import('../pages/SearchTermsPage').then((m) => ({ default: m.SearchTermsPage })),
);
const CampaignDetailsPage = lazy(() =>
  import('../pages/CampaignDetailsPage').then((m) => ({ default: m.CampaignDetailsPage })),
);
const KeywordsPage = lazy(() =>
  import('../pages/KeywordsPage').then((m) => ({ default: m.KeywordsPage })),
);
const ActionCenterPage = lazy(() =>
  import('../pages/ActionCenterPage').then((m) => ({ default: m.ActionCenterPage })),
);
const AutomationPage = lazy(() =>
  import('../pages/AutomationPage').then((m) => ({ default: m.AutomationPage })),
);
const AlertsPage = lazy(() =>
  import('../pages/AlertsPage').then((m) => ({ default: m.AlertsPage })),
);
const ComparisonPage = lazy(() =>
  import('../pages/ComparisonPage').then((m) => ({ default: m.ComparisonPage })),
);
const RoyaltiesPage = lazy(() =>
  import('../pages/RoyaltiesPage').then((m) => ({ default: m.RoyaltiesPage })),
);
const OperationsCenterPage = lazy(() =>
  import('../pages/OperationsCenterPage').then((m) => ({ default: m.OperationsCenterPage })),
);
const AccountingPage = lazy(() =>
  import('../pages/AccountingPage').then((m) => ({ default: m.AccountingPage })),
);
const ReportsPage = lazy(() =>
  import('../pages/ReportsPage').then((m) => ({ default: m.ReportsPage })),
);
const NegativesPage = lazy(() =>
  import('../pages/NegativesPage').then((m) => ({ default: m.NegativesPage })),
);
const ProfilePage = lazy(() =>
  import('../pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);
// Phase L Lane A — Listing Studio is a heavy AI page; lazy-load it so the
// initial bundle doesn't ship the variant-history code path until requested.
const ListingStudioPage = lazy(() =>
  import('../pages/ListingStudioPage').then((m) => ({ default: m.ListingStudioPage })),
);
import { NavProvider, useNav, ViewId } from '../contexts/NavContext';
import { CommandPalette } from './CommandPalette';
import { GlobalFilters } from './GlobalFilters';
import { NotificationsBell } from './NotificationsBell';
import { UserMenu } from './UserMenu';
import { useEntitlement } from '../hooks/useEntitlement';
import type { FeatureKey } from '../../shared/entitlements';

interface NavItem {
  id: ViewId;
  icon: React.ElementType;
  shortcut?: string;
  /**
   * Phase K: если задан — sidebar item получает Pro/Business badge, когда
   * фича закрыта. Клик не блокируется (юзер попадёт на страницу, где сам
   * AutomationPage / etc. рендерит "upgrade card").
   */
  feature?: FeatureKey;
}

// labelKey для каждого item — `items.<id>` в namespace 'nav'.
const mainNav: NavItem[] = [
  { id: 'dashboard', icon: LayoutDashboard, shortcut: 'G O' },
  { id: 'books', icon: BookOpen, shortcut: 'G B' },
  { id: 'campaigns', icon: Target, shortcut: 'G C' },
  { id: 'keywords', icon: Key, shortcut: 'G K' },
  { id: 'search_terms', icon: Search, shortcut: 'G S' },
  { id: 'negatives', icon: Ban, shortcut: 'G N' },
  { id: 'reports', icon: FileText, shortcut: 'G R' },
  { id: 'comparison', icon: GitCompare, shortcut: 'G P' },
];

const actionsNav: NavItem[] = [
  { id: 'action_center', icon: History, shortcut: 'G A' },
  { id: 'automation', icon: Zap, shortcut: 'G U', feature: 'automation.rules' },
  { id: 'alerts', icon: Activity, shortcut: 'G L' },
  { id: 'operations', icon: ClipboardList, shortcut: 'G T', feature: 'automation.rules' },
  // Phase L Lane A — Listing Studio (Pro tier). Sidebar item shows Pro badge
  // when locked, but navigation still works — the page itself renders the
  // upgrade card.
  { id: 'listing_studio', icon: Sparkles, shortcut: 'G E', feature: 'ai.title_generator' },
];

const financeNav: NavItem[] = [
  { id: 'royalties', icon: Coins, shortcut: 'G Y' },
  { id: 'accounting', icon: Wallet, shortcut: 'G F' },
];

const bottomNav: NavItem[] = [
  { id: 'settings', icon: Settings },
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
  k: 'keywords',
  r: 'reports',
  p: 'comparison',
  n: 'negatives',
  a: 'action_center',
  u: 'automation',
  l: 'alerts',
  t: 'operations',
  y: 'royalties',
  f: 'accounting',
  i: 'profile',
  // Phase L Lane A — Listing Studio. `G E` (Editor / listing editor) — picked
  // because `L` is Alerts and `I` is Profile.
  e: 'listing_studio',
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

const Layout: React.FC = () => {
  const { t } = useTranslation('nav');
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
      case 'campaign_details':
        return <CampaignDetailsPage />;
      case 'keywords':
        return <KeywordsPage />;
      case 'action_center':
        return <ActionCenterPage />;
      case 'automation':
        return <AutomationPage />;
      case 'alerts':
        return <AlertsPage />;
      case 'comparison':
        return <ComparisonPage />;
      case 'royalties':
        return <RoyaltiesPage />;
      case 'operations':
        return <OperationsCenterPage />;
      case 'accounting':
        return <AccountingPage />;
      case 'reports':
        return <ReportsPage />;
      case 'negatives':
        return <NegativesPage />;
      case 'profile':
        return <ProfilePage />;
      case 'listing_studio':
        return <ListingStudioPage />;
      case 'settings':
        return <SettingsPage />;
    }
  };

  const renderNavItem = (item: NavItem) => (
    <NavItemRow
      key={item.id}
      item={item}
      isActive={page === item.id}
      onClick={() => navigate(item.id)}
    />
  );

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
            data-testid="topbar-command-palette-trigger"
            onClick={() => setPaletteOpen(true)}
            className="
              flex items-center gap-2 h-7 px-2.5 rounded-md
              text-xs text-zinc-500 hover:text-zinc-900
              hover:bg-zinc-100 transition-colors
            "
            aria-label={t('topbar.openCommandPalette')}
          >
            <Command size={12} strokeWidth={2} />
            <span>{t('topbar.search')}</span>
            <span className="ml-1 px-1.5 py-0.5 text-[10px] font-mono rounded bg-zinc-100 group-hover:bg-zinc-200 border border-zinc-200">
              ⌘K
            </span>
          </button>

          <CalendarBell />

          <NotificationsBell />

          <UserMenu />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-56 flex-shrink-0 border-r border-zinc-200 bg-white flex flex-col">
          <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
            <div className="px-3 pb-1.5 pt-2 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
              {t('sections.analytics')}
            </div>
            {mainNav.map(renderNavItem)}

            <div className="px-3 pb-1.5 pt-3 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
              {t('sections.actions')}
            </div>
            {actionsNav.map(renderNavItem)}

            <div className="px-3 pb-1.5 pt-3 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
              {t('sections.finance')}
            </div>
            {financeNav.map(renderNavItem)}
          </nav>

          <div className="p-2 border-t border-zinc-100 space-y-0.5">
            {bottomNav.map(renderNavItem)}
          </div>

          <ConnectionIndicator />
        </aside>
        <main className="flex-1 overflow-auto bg-zinc-50">
          <div className="max-w-6xl mx-auto px-8 py-8">
            <Suspense fallback={<PageFallback />}>{renderContent()}</Suspense>
          </div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
};

const PageFallback: React.FC = () => (
  <div className="flex items-center justify-center py-20">
    <Loader2 size={18} className="animate-spin text-zinc-400" />
  </div>
);

interface NavItemRowProps {
  item: NavItem;
  isActive: boolean;
  onClick(): void;
}

/**
 * Phase K: вынесли в отдельный компонент чтобы можно было дёрнуть
 * `useEntitlement` per-item. Sidebar item рендерит Pro/Business badge
 * рядом с label если фича закрыта, но навигация всё равно работает —
 * страница сама покажет upgrade-card.
 */
const NavItemRow: React.FC<NavItemRowProps> = ({ item, isActive, onClick }) => {
  const { t } = useTranslation('nav');
  const { t: tCommon } = useTranslation('common');
  // useEntitlement дёрнем безусловно (one hook order). Если у item нет
  // feature — `locked=false` всегда.
  const ent = useEntitlement(item.feature ?? 'ai.title_generator');
  const isLocked = item.feature ? !ent.on : false;
  const tierRequired = item.feature ? ent.tierRequired : 'pro';
  const Icon = item.icon;

  const badgeLabel =
    tierRequired === 'business'
      ? tCommon('entitlements.lockedBadgeBusiness')
      : tCommon('entitlements.lockedBadge');

  return (
    <button
      data-testid={`nav-${item.id}`}
      data-locked={isLocked ? 'true' : undefined}
      onClick={onClick}
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
      <span className="flex-1 text-left truncate">
        {t(`items.${item.id}` as 'items.dashboard')}
      </span>
      {isLocked && (
        <span
          data-testid={`nav-badge-${item.id}`}
          className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-violet-100 text-violet-700"
        >
          {badgeLabel}
        </span>
      )}
      {item.shortcut && !isLocked && (
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

type ConnState = 'online' | 'offline' | 'checking';

const ConnectionIndicator: React.FC = () => {
  const { t } = useTranslation('nav');
  const [state, setState] = useState<ConnState>('checking');
  const failureCountRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const ping = async () => {
      try {
        // Lightweight call — first 1 row of tasks works for both API-key and JWT auth.
        await window.api.request<unknown>({
          method: 'GET',
          path: '/api/auth/verify',
        });
        if (!cancelled) {
          failureCountRef.current = 0;
          setState('online');
        }
      } catch {
        if (cancelled) return;
        failureCountRef.current += 1;
        if (failureCountRef.current >= 2) setState('offline');
      }
    };

    ping();
    const id = setInterval(ping, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const dotColor =
    state === 'online'
      ? 'bg-emerald-500'
      : state === 'offline'
      ? 'bg-red-500'
      : 'bg-zinc-300';
  const label =
    state === 'online'
      ? t('topbar.online')
      : state === 'offline'
      ? t('topbar.offline')
      : t('topbar.checking');

  return (
    <div className="px-4 py-2.5 border-t border-zinc-100 text-[11px] text-zinc-400 flex items-center justify-between">
      <span>{t('topbar.connected')}</span>
      <span className="flex items-center gap-1.5" data-testid="connection-indicator">
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
        {label}
      </span>
    </div>
  );
};
