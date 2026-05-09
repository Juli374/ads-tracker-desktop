import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  RefreshCw,
  LogOut,
  Copy,
  Search,
} from 'lucide-react';
import { useNav, ViewId } from '../contexts/NavContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

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

export const CommandPalette: React.FC<Props> = ({ open, onClose }) => {
  const { navigate } = useNav();
  const { signOut } = useAuth();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const goto = useCallback(
    (page: ViewId) => () => {
      navigate(page);
      onClose();
    },
    [navigate, onClose],
  );

  const items: PaletteItem[] = useMemo(
    () => [
      {
        id: 'go-dashboard',
        label: 'Перейти на Обзор',
        hint: 'G O',
        icon: LayoutDashboard,
        onRun: goto('dashboard'),
      },
      {
        id: 'go-books',
        label: 'Перейти на Книги',
        hint: 'G B',
        icon: BookOpen,
        onRun: goto('books'),
      },
      {
        id: 'go-search',
        label: 'Перейти на Поисковые запросы',
        hint: 'G S',
        icon: SearchIcon,
        onRun: goto('search_terms'),
      },
      {
        id: 'go-campaigns',
        label: 'Перейти на Кампании',
        hint: 'G C',
        icon: Target,
        onRun: goto('campaigns'),
      },
      {
        id: 'go-keywords',
        label: 'Перейти на Ключи',
        hint: 'G K',
        icon: Key,
        onRun: goto('keywords'),
      },
      {
        id: 'go-reports',
        label: 'Перейти на Отчёты',
        hint: 'G R',
        icon: FileText,
        onRun: goto('reports'),
      },
      {
        id: 'go-comparison',
        label: 'Перейти на Сравнение',
        hint: 'G P',
        icon: GitCompare,
        onRun: goto('comparison'),
      },
      {
        id: 'go-negatives',
        label: 'Перейти на Минус-слова',
        hint: 'G N',
        icon: Ban,
        onRun: goto('negatives'),
      },
      {
        id: 'go-action-center',
        label: 'Перейти в Центр действий',
        hint: 'G A',
        icon: History,
        onRun: goto('action_center'),
      },
      {
        id: 'go-automation',
        label: 'Перейти в Автоматизацию',
        hint: 'G U',
        icon: Zap,
        onRun: goto('automation'),
      },
      {
        id: 'go-alerts',
        label: 'Перейти в Мониторинг',
        hint: 'G L',
        icon: Activity,
        onRun: goto('alerts'),
      },
      {
        id: 'go-operations',
        label: 'Перейти в Операционный центр',
        hint: 'G T',
        icon: ClipboardList,
        onRun: goto('operations'),
      },
      {
        id: 'go-royalties',
        label: 'Перейти в Royalty',
        hint: 'G Y',
        icon: Coins,
        onRun: goto('royalties'),
      },
      {
        id: 'go-accounting',
        label: 'Перейти в Бухгалтерию',
        hint: 'G F',
        icon: Wallet,
        onRun: goto('accounting'),
      },
      {
        id: 'go-settings',
        label: 'Перейти на Настройки',
        icon: Settings,
        onRun: goto('settings'),
      },
      {
        id: 'reload',
        label: 'Обновить страницу',
        icon: RefreshCw,
        onRun: () => {
          window.location.reload();
        },
      },
      {
        id: 'copy-api-url',
        label: 'Скопировать API URL',
        icon: Copy,
        onRun: async () => {
          try {
            const url = await window.api.app.getApiBaseUrl();
            await navigator.clipboard.writeText(url);
            toast.success(`Скопировано: ${url}`);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Не удалось скопировать');
          }
          onClose();
        },
      },
      {
        id: 'sign-out',
        label: 'Выйти из аккаунта',
        icon: LogOut,
        onRun: async () => {
          await signOut();
          onClose();
        },
      },
    ],
    [goto, signOut, toast, onClose],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.label.toLowerCase().includes(q));
  }, [query, items]);

  // Reset state on open / re-open
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
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
      const item = filtered[activeIdx];
      if (item) item.onRun();
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
        aria-label="Команды"
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
            placeholder="Найти команду…"
            className="flex-1 text-sm bg-transparent border-0 outline-none placeholder:text-zinc-400"
          />
          <span className="text-[10px] font-mono text-zinc-400 px-1.5 py-0.5 rounded bg-zinc-100 border border-zinc-200">
            esc
          </span>
        </div>

        <div ref={listRef} className="max-h-[320px] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-zinc-400">
              Ничего не нашлось
            </div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon;
              const active = idx === activeIdx;
              return (
                <button
                  key={item.id}
                  data-palette-idx={idx}
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
            <span><kbd className="font-mono">↑↓</kbd> навигация</span>
            <span><kbd className="font-mono">↵</kbd> выбор</span>
          </div>
          <span><kbd className="font-mono">⌘K</kbd> открыть/закрыть</span>
        </div>
      </div>
    </div>
  );
};
