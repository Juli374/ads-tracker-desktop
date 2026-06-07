import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  BookOpen,
  Search as SearchIcon,
  Target,
  FileText,
  Settings,
  Ban,
  Key,
  History,
  Zap,
  Activity,
  GitCompare,
  Wallet,
  ClipboardList,
  Coins,
  PiggyBank,
  RefreshCw,
  LogOut,
  Copy,
  Search,
  User,
  Sparkles,
  Loader2,
  AlertTriangle,
  Compass,
  Mail,
} from 'lucide-react';
import { useNav, ViewId } from '../contexts/NavContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTheme } from '../contexts/ThemeContext';
import { useGlobalFilters } from '../contexts/GlobalFiltersContext';
import { useEntitlement } from '../hooks/useEntitlement';
import { useModuleActivation } from '../hooks/useModuleActivation';
import { moduleForView } from '../../shared/modules';
import { aiApi } from '../api/ai';
import { Sun, Filter } from 'lucide-react';

interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  icon: React.ElementType;
  onRun(): void | Promise<void>;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Phase L Lane E — quick AI verbs surfaced as palette entries. */
type AiVerb = 'ask' | 'rewrite-blurb' | 'explain-spike' | 'suggest-negatives';

interface AiVerbDef {
  id: AiVerb;
  label: string;
  prompt(query: string): string;
}

export const CommandPalette: React.FC<Props> = ({ open, onClose }) => {
  const { t } = useTranslation('nav');
  const { navigate, page } = useNav();
  const { signOut } = useAuth();
  const toast = useToast();
  const theme = useTheme();
  const globalFilters = useGlobalFilters();
  const aiEnt = useEntitlement('ai.title_generator');
  const { isModuleActive, setModuleActive } = useModuleActivation();
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  // Phase L.5 — Ask AI panel state. Lives on the Palette so closing the
  // modal resets it; we don't persist AI answers between opens.
  const [askLoading, setAskLoading] = useState(false);
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const goto = useCallback(
    (page: ViewId) => () => {
      // Phase R — opening a view from the palette also reveals its module, so a
      // page reached via ⌘K sticks in the sidebar afterwards (the palette is the
      // discovery surface for hidden modules). Locked (un-entitled) modules stay
      // gated by the resolver, so this is a visual no-op for them until upgrade.
      const m = moduleForView(page);
      if (m && !m.core && !isModuleActive(m.id)) {
        void setModuleActive(m.id, true, 'user');
      }
      navigate(page);
      onClose();
    },
    [navigate, onClose, isModuleActive, setModuleActive],
  );

  const goLabel = useCallback(
    (id: ViewId) => t('palette.goTo', { target: t(`items.${id}` as 'items.dashboard') }),
    [t],
  );

  const items: PaletteItem[] = useMemo(
    () => [
      { id: 'go-dashboard', label: goLabel('dashboard'), hint: 'G O', icon: LayoutDashboard, onRun: goto('dashboard') },
      { id: 'go-books', label: goLabel('books'), hint: 'G B', icon: BookOpen, onRun: goto('books') },
      { id: 'go-search', label: goLabel('search_terms'), hint: 'G S', icon: SearchIcon, onRun: goto('search_terms') },
      { id: 'go-campaigns', label: goLabel('campaigns'), hint: 'G C', icon: Target, onRun: goto('campaigns') },
      { id: 'go-keywords', label: goLabel('keywords'), hint: 'G K', icon: Key, onRun: goto('keywords') },
      { id: 'go-reports', label: goLabel('reports'), hint: 'G R', icon: FileText, onRun: goto('reports') },
      { id: 'go-comparison', label: goLabel('comparison'), hint: 'G P', icon: GitCompare, onRun: goto('comparison') },
      { id: 'go-negatives', label: goLabel('negatives'), hint: 'G N', icon: Ban, onRun: goto('negatives') },
      { id: 'go-action-center', label: goLabel('action_center'), hint: 'G A', icon: History, onRun: goto('action_center') },
      { id: 'go-automation', label: goLabel('automation'), hint: 'G U', icon: Zap, onRun: goto('automation') },
      { id: 'go-alerts', label: goLabel('alerts'), hint: 'G L', icon: Activity, onRun: goto('alerts') },
      { id: 'go-operations', label: goLabel('operations'), hint: 'G T', icon: ClipboardList, onRun: goto('operations') },
      { id: 'go-royalties', label: goLabel('royalties'), hint: 'G Y', icon: Coins, onRun: goto('royalties') },
      { id: 'go-pnl', label: goLabel('pnl'), hint: 'G E', icon: PiggyBank, onRun: goto('pnl') },
      { id: 'go-accounting', label: goLabel('accounting'), hint: 'G F', icon: Wallet, onRun: goto('accounting') },
      { id: 'go-profile', label: goLabel('profile'), hint: 'G I', icon: User, onRun: goto('profile') },
      // Phase Q.4.2 — hint corrected from stale `G E` (taken by P&L) to actual `G W`.
      { id: 'go-listing-studio', label: goLabel('listing_studio'), hint: 'G W', icon: Sparkles, onRun: goto('listing_studio') },
      // Phase M.1 — Niche Explorer
      { id: 'go-research', label: goLabel('research'), hint: 'G H', icon: Compass, onRun: goto('research') },
      // Phase M.5 Lane E — Weekly briefing page + on-demand run command.
      { id: 'go-briefing', label: goLabel('briefing'), hint: 'G J', icon: Mail, onRun: goto('briefing') },
      {
        id: 'run-briefing-now',
        label: t('palette.runBriefingNow'),
        icon: Sparkles,
        onRun: async () => {
          try {
            const result = await window.api.briefing.runNow();
            if (result.error) {
              toast.error(result.error);
            } else {
              toast.success(t('palette.briefingGenerated'));
              navigate('briefing');
            }
          } catch (err) {
            toast.error(err instanceof Error ? err.message : String(err));
          }
          onClose();
        },
      },
      { id: 'go-settings', label: goLabel('settings'), icon: Settings, onRun: goto('settings') },
      {
        id: 'reload',
        label: t('palette.reload'),
        icon: RefreshCw,
        onRun: () => {
          window.location.reload();
        },
      },
      {
        id: 'copy-api-url',
        label: t('palette.copyApiUrl'),
        icon: Copy,
        onRun: async () => {
          try {
            const url = await window.api.app.getApiBaseUrl();
            await navigator.clipboard.writeText(url);
            toast.success(t('palette.copiedToast', { url }));
          } catch (err) {
            toast.error(err instanceof Error ? err.message : t('palette.copyFailed'));
          }
          onClose();
        },
      },
      // Phase Q.4.4 — 3 utility actions surfaced via ⌘K so keyboard users can run
      // them without opening UserMenu / topbar / Settings tabs.
      {
        id: 'toggle-theme',
        label: t('palette.toggleTheme', {
          defaultValue: 'Toggle theme (light / dark / system)',
        }),
        icon: Sun,
        onRun: () => {
          theme.cycle();
          onClose();
        },
      },
      {
        id: 'reset-filters',
        label: t('palette.resetFilters', { defaultValue: 'Reset global filters' }),
        icon: Filter,
        onRun: () => {
          globalFilters.reset();
          toast.success(
            t('palette.filtersReset', { defaultValue: 'Filters cleared.' }),
          );
          onClose();
        },
      },
      {
        id: 'open-full-sync',
        label: t('palette.openFullSync', {
          defaultValue: 'Open Settings → Full Sync',
        }),
        icon: RefreshCw,
        onRun: () => {
          navigate('settings');
          onClose();
        },
      },
      {
        id: 'sign-out',
        label: t('palette.signOut'),
        icon: LogOut,
        onRun: async () => {
          await signOut();
          onClose();
        },
      },
    ],
    [t, goLabel, goto, signOut, toast, onClose, theme, globalFilters, navigate],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.label.toLowerCase().includes(q));
  }, [query, items]);

  // Phase L.5 — strip a leading "?" or "ask " prefix to decide whether
  // to surface the Ask AI entry. We also surface it whenever there are NO
  // matching commands, so unknown queries always have an actionable fallback.
  const askPrompt = useMemo(() => {
    const raw = query.trim();
    if (raw.length === 0) return '';
    if (raw.startsWith('?')) return raw.slice(1).trim();
    const lower = raw.toLowerCase();
    if (lower.startsWith('ask ')) return raw.slice(4).trim();
    return raw;
  }, [query]);

  const showAskAi = useMemo(() => {
    if (!query.trim()) return false;
    if (query.trim().startsWith('?')) return true;
    if (query.trim().toLowerCase().startsWith('ask ')) return true;
    // Fallback: no command matches user's query → surface Ask AI as the
    // primary action so the palette is never a dead-end.
    return filtered.length === 0;
  }, [query, filtered]);

  // Phase L.5 — AI verbs (cached). Each verb composes a context-aware prompt
  // out of the current page; the query becomes the noun.
  const aiVerbs: readonly AiVerbDef[] = useMemo(
    () => [
      {
        id: 'rewrite-blurb',
        label: 'AI: rewrite book blurb',
        prompt: (q) => `Rewrite this book blurb to be punchier and more conversion-focused. Keep it under ~250 words.\n\n${q}`,
      },
      {
        id: 'explain-spike',
        label: 'AI: explain ACOS / spend spike',
        prompt: (q) =>
          `I'm seeing an unexpected spike on a campaign. Walk me through likely causes (audience, bid changes, competitor activity, day-of-week effects). Context: ${q || '(no extra details)'}.`,
      },
      {
        id: 'suggest-negatives',
        label: 'AI: suggest negative keywords',
        prompt: (q) =>
          `Suggest 8-12 negative keywords I should add for this niche / theme. Briefly justify each.\n\nContext: ${q || '(no extra details)'}.`,
      },
    ],
    [],
  );

  /** Hit the IPC + render result inline. Never closes the palette on success. */
  const runAsk = useCallback(
    async (prompt: string) => {
      if (!aiEnt.on) {
        setAskError(
          'AI quick actions require Pro tier. Upgrade in Settings → Subscription.',
        );
        return;
      }
      if (!prompt.trim()) return;
      setAskLoading(true);
      setAskError(null);
      setAskAnswer(null);
      try {
        const result = await aiApi.generate({
          task: 'ask',
          prompt,
          context: { page, source: 'command-palette' },
        });
        setAskAnswer(result.text);
      } catch (err) {
        setAskError(err instanceof Error ? err.message : String(err));
      } finally {
        setAskLoading(false);
      }
    },
    [aiEnt.on, page],
  );

  // Reset state on open / re-open
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setAskAnswer(null);
      setAskError(null);
      setAskLoading(false);
      // Focus после рендера
      setTimeout(() => inputRef.current?.focus(), 0);
      document.body.dataset.modalOpen = 'true';
    } else {
      delete document.body.dataset.modalOpen;
    }
    return () => {
      delete document.body.dataset.modalOpen;
    };
  }, [open]);

  // Когда фильтр меняется, активный сбрасывается на 0
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // Прокрутка к активному элементу
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-palette-idx="${activeIdx}"]`,
    );
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      // Phase L.5 — when Ask AI is surfaced and no command match is highlighted,
      // Enter triggers the AI request inline. Otherwise standard run.
      if (showAskAi && (filtered.length === 0 || activeIdx === 0 && filtered.length === 0)) {
        void runAsk(askPrompt);
        return;
      }
      const item = filtered[activeIdx];
      if (item) item.onRun();
      // Even with a matched command, if user prefixed "?" they probably want AI.
      else if (showAskAi) {
        void runAsk(askPrompt);
      }
      return;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-zinc-900/20 backdrop-blur-sm"
      onMouseDown={(e) => {
        // Закрыть по клику вне модалки
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label={t('palette.title')}
        className="w-full max-w-lg bg-white border border-zinc-200 rounded-xl shadow-card overflow-hidden"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 px-4 h-11 border-b border-zinc-100">
          <Search size={14} className="text-zinc-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('palette.placeholder')}
            className="flex-1 text-sm bg-transparent border-0 outline-none placeholder:text-zinc-400"
          />
          <span className="text-[10px] font-mono text-zinc-400 px-1.5 py-0.5 rounded bg-zinc-100 border border-zinc-200">
            esc
          </span>
        </div>

        <div ref={listRef} className="max-h-[320px] overflow-y-auto py-1">
          {/* Phase L.5 — Ask AI entry surfaces when query has no match or starts with "?". */}
          {showAskAi && askAnswer === null && (
            <button
              type="button"
              data-testid="palette-ask-ai"
              onClick={() => void runAsk(askPrompt)}
              disabled={askLoading || !askPrompt}
              className={`
                flex items-center gap-2.5 w-full px-3 mx-1 h-8 rounded-md text-left
                text-sm transition-colors
                ${askLoading ? 'bg-violet-50 text-violet-700' : 'text-violet-700 hover:bg-violet-50'}
                disabled:opacity-50
              `}
            >
              {askLoading ? (
                <Loader2 size={14} className="animate-spin flex-shrink-0" />
              ) : (
                <Sparkles size={14} className="flex-shrink-0" />
              )}
              <span className="flex-1 truncate">
                {askLoading
                  ? t('palette.askAiLoading')
                  : t('palette.askAi', { query: askPrompt || '…' })}
              </span>
              <span className="text-[10px] font-mono text-zinc-400 tracking-wider">↵</span>
            </button>
          )}

          {/* Phase L.5 — AI quick verbs: visible only when user typed something. */}
          {showAskAi && askPrompt && askAnswer === null && !askLoading && (
            <div className="px-2 pt-1">
              <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-1 pb-0.5">
                Quick AI actions
              </div>
              {aiVerbs.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  data-testid={`palette-ai-verb-${v.id}`}
                  onClick={() => void runAsk(v.prompt(askPrompt))}
                  className="
                    flex items-center gap-2.5 w-full px-2.5 h-7 rounded-md text-left
                    text-xs text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 transition-colors
                  "
                >
                  <Sparkles size={11} className="text-violet-500 flex-shrink-0" />
                  <span className="flex-1 truncate">{v.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* AI answer panel — replaces command list while we have a response. */}
          {askAnswer !== null && (
            <div className="px-3 py-2 space-y-1" data-testid="palette-ask-ai-answer">
              <div className="text-[10px] font-semibold text-violet-700 uppercase tracking-wider">
                {t('palette.askAiAnswerLabel')}
              </div>
              <pre className="text-xs text-zinc-800 whitespace-pre-wrap font-sans max-h-[200px] overflow-y-auto">
                {askAnswer}
              </pre>
            </div>
          )}

          {/* AI error inline. */}
          {askError && (
            <div
              data-testid="palette-ask-ai-error"
              className="mx-2 my-1 px-2.5 py-1.5 rounded-md border border-amber-300 bg-amber-50 text-[11px] text-amber-900 inline-flex items-start gap-1.5"
            >
              <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
              <span>{askError}</span>
            </div>
          )}

          {filtered.length === 0 && askAnswer === null && !showAskAi ? (
            <div className="px-4 py-6 text-center text-xs text-zinc-400">
              {t('palette.empty')}
            </div>
          ) : (
            askAnswer === null &&
            filtered.map((item, idx) => {
              const Icon = item.icon;
              const active = idx === activeIdx;
              return (
                <button
                  key={item.id}
                  data-palette-idx={idx}
                  data-testid={`palette-${item.id}`}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => item.onRun()}
                  className={`
                    flex items-center gap-2.5 w-full px-3 mx-1 h-8 rounded-md text-left
                    text-sm transition-colors
                    ${active ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-zinc-50'}
                  `}
                >
                  <Icon size={14} className="text-zinc-500 flex-shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.hint && (
                    <span className="text-[10px] font-mono text-zinc-400 tracking-wider">
                      {item.hint}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="px-3 py-1.5 border-t border-zinc-100 flex items-center justify-between text-[10px] text-zinc-400">
          <div className="flex items-center gap-3">
            <span><kbd className="font-mono">↑↓</kbd> {t('palette.hint.navigate')}</span>
            <span><kbd className="font-mono">↵</kbd> {t('palette.hint.select')}</span>
          </div>
          <span><kbd className="font-mono">⌘K</kbd> {t('palette.hint.toggle')}</span>
        </div>
      </div>
    </div>
  );
};
