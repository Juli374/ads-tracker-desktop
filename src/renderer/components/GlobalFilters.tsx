import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Filter, X, BookOpen, User, Globe, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGlobalFilters } from '../contexts/GlobalFiltersContext';
import { useMarketplaces } from '../contexts/MarketplacesContext';
import { useBooks } from '../contexts/BooksContext';
import { useEntitlement } from '../hooks/useEntitlement';
import { UpgradeModal } from './UpgradeModal';
import { useToast } from '../contexts/ToastContext';

export const GlobalFilters: React.FC = () => {
  const { t } = useTranslation('common');
  const { reset, hasAny } = useGlobalFilters();
  const { list: books } = useBooks();

  const accounts = useMemo(() => {
    const set = new Set<string>();
    for (const b of books) if (b.account) set.add(b.account);
    return [...set].sort();
  }, [books]);

  const showAccountFilter = accounts.length > 1;

  return (
    <div className="flex items-center gap-1.5">
      <BookFilter />
      {showAccountFilter && <AccountFilter accounts={accounts} />}
      <MarketplaceFilter />
      {hasAny && (
        <button
          onClick={reset}
          className="
            h-7 px-2 flex items-center gap-1 rounded-md text-[11px]
            text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100
            transition-colors
          "
          title={t('globalFilters.resetAllTitle')}
        >
          <X size={11} />
          {t('globalFilters.resetAll')}
        </button>
      )}
      <span className="hidden">
        <Filter size={1} />
      </span>
    </div>
  );
};

const BookFilter: React.FC = () => {
  const { t } = useTranslation('common');
  const { filters, setBookId } = useGlobalFilters();
  const { list: books } = useBooks();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return books;
    return books.filter((b) => b.title.toLowerCase().includes(q));
  }, [books, query]);

  const selected = useMemo(
    () => books.find((b) => b.id === filters.bookId),
    [books, filters.bookId],
  );

  const label = selected ? selected.title : t('globalFilters.books.all');
  const active = filters.bookId != null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`
          flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs transition-colors border
          ${active
            ? 'bg-zinc-900 text-white border-zinc-900 hover:bg-zinc-800'
            : 'bg-white text-zinc-600 border-zinc-200 hover:text-zinc-900 hover:bg-zinc-50'}
        `}
        aria-expanded={open}
      >
        <BookOpen size={11} />
        <span className="font-medium max-w-[140px] truncate">{label}</span>
        {active && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              setBookId(undefined);
            }}
            className="ml-1 hover:text-zinc-300 transition-colors cursor-pointer"
            role="button"
            aria-label={t('globalFilters.books.resetAria')}
          >
            <X size={11} />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-40 w-72 bg-white border border-zinc-200 rounded-lg shadow-card overflow-hidden">
          <div className="px-3 py-2 border-b border-zinc-100">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('globalFilters.books.search')}
              className="w-full h-7 px-2 text-xs bg-transparent border-0 outline-none placeholder:text-zinc-400"
              autoFocus
            />
          </div>
          <div className="max-h-[280px] overflow-y-auto py-1">
            <button
              onClick={() => {
                setBookId(undefined);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 h-8 text-sm text-left hover:bg-zinc-50 transition-colors"
            >
              <RadioDot selected={filters.bookId == null} />
              <span className="text-xs text-zinc-700">{t('globalFilters.books.all')}</span>
            </button>
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-zinc-400">{t('globalFilters.books.noMatch')}</div>
            ) : (
              filtered.map((b) => {
                const sel = filters.bookId === b.id;
                return (
                  <button
                    key={b.id}
                    onClick={() => {
                      setBookId(b.id);
                      setOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 h-8 text-sm text-left hover:bg-zinc-50 transition-colors"
                  >
                    <RadioDot selected={sel} />
                    <span className="text-xs text-zinc-700 truncate flex-1">
                      {b.title}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const MarketplaceFilter: React.FC = () => {
  const { t } = useTranslation('common');
  const { list: marketplaces } = useMarketplaces();
  const { filters, toggleMarketplace, setMarketplaces } = useGlobalFilters();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  // Phase K: marketplace.multi — feature gate. start=1 marketplace, pro=3,
  // business=unlimited. Превышение лимита → toast + UpgradeModal.
  const multiEnt = useEntitlement('marketplace.multi');
  const toast = useToast();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  // Computed limit: на основе tier и текущего entitlement state.
  const marketplaceLimit = useMemo(() => {
    // Если фича marketplace.multi включена → unlimited (business).
    if (multiEnt.on) return Infinity;
    // pro по плану позволяет до 3 (фича всё ещё `off`, но dampened).
    // Backend пока этого не различает; для UX используем mapping через
    // entitlements.tier — компонент Provider'а делает это видимым.
    return 1; // start
  }, [multiEnt.on]);

  // Перехватчик toggle: на старт-плане при попытке добавить 2-й marketplace
  // — toast + open UpgradeModal вместо изменения state.
  const guardedToggle = (code: string) => {
    const isAdding = !filters.marketplaces.includes(code);
    if (isAdding && filters.marketplaces.length >= marketplaceLimit) {
      toast.error(
        t('entitlements.marketplaceLimit.subtitleStart' as 'entitlements.marketplaceLimit.subtitleStart'),
      );
      setUpgradeOpen(true);
      return;
    }
    toggleMarketplace(code);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const count = filters.marketplaces.length;
  const label =
    count === 0
      ? t('globalFilters.marketplaces.all')
      : count === 1
      ? filters.marketplaces[0]
      : `${count} ${t('globalFilters.marketplaces.countSuffix')}`;
  const active = count > 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`
          flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs transition-colors border
          ${active
            ? 'bg-zinc-900 text-white border-zinc-900 hover:bg-zinc-800'
            : 'bg-white text-zinc-600 border-zinc-200 hover:text-zinc-900 hover:bg-zinc-50'}
        `}
        aria-expanded={open}
      >
        <Globe size={11} />
        <span className="font-medium">{label}</span>
        {active && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              setMarketplaces([]);
            }}
            className="ml-1 hover:text-zinc-300 transition-colors cursor-pointer"
            role="button"
            aria-label={t('globalFilters.marketplaces.resetAria')}
          >
            <X size={11} />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-40 w-64 bg-white border border-zinc-200 rounded-lg shadow-card overflow-hidden">
          <div className="px-3 py-2 border-b border-zinc-100 flex items-center justify-between">
            <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
              {t('globalFilters.marketplaces.label')}
            </div>
            {active && (
              <button
                onClick={() => setMarketplaces([])}
                className="text-[10px] text-zinc-500 hover:text-zinc-900 transition-colors"
              >
                {t('actions.reset')}
              </button>
            )}
          </div>
          <div className="max-h-[280px] overflow-y-auto py-1">
            {!multiEnt.on && (
              <div
                data-testid="marketplace-tier-hint"
                className="mx-3 my-2 px-2 py-1.5 rounded text-[10px] text-violet-700 bg-violet-50 border border-violet-100 inline-flex items-center gap-1.5"
              >
                <Lock size={9} />
                {t('entitlements.marketplaceLimit.subtitleStart')}
              </div>
            )}
            {marketplaces.length === 0 ? (
              <div className="px-3 py-2 text-xs text-zinc-400">{t('globalFilters.marketplaces.loading')}</div>
            ) : (
              marketplaces.map((code) => {
                const selected = filters.marketplaces.includes(code);
                return (
                  <button
                    key={code}
                    onClick={() => guardedToggle(code)}
                    className="w-full flex items-center gap-2.5 px-3 h-8 text-sm text-left hover:bg-zinc-50 transition-colors"
                  >
                    <Checkbox selected={selected} />
                    <span className="text-xs text-zinc-700 uppercase font-mono">{code}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        triggeredBy="marketplace.multi"
        recommendedTier={multiEnt.tierRequired}
      />
    </div>
  );
};

const AccountFilter: React.FC<{ accounts: string[] }> = ({ accounts }) => {
  const { t } = useTranslation('common');
  const { filters, toggleAccount, setAccounts } = useGlobalFilters();
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

  const count = filters.accounts.length;
  const label =
    count === 0
      ? t('globalFilters.accounts.all')
      : count === 1
      ? filters.accounts[0]
      : `${count} ${t('globalFilters.accounts.countSuffix')}`;
  const active = count > 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`
          flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs transition-colors border
          ${active
            ? 'bg-zinc-900 text-white border-zinc-900 hover:bg-zinc-800'
            : 'bg-white text-zinc-600 border-zinc-200 hover:text-zinc-900 hover:bg-zinc-50'}
        `}
        aria-expanded={open}
      >
        <User size={11} />
        <span className="font-medium max-w-[100px] truncate">{label}</span>
        {active && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              setAccounts([]);
            }}
            className="ml-1 hover:text-zinc-300 transition-colors cursor-pointer"
            role="button"
            aria-label={t('globalFilters.accounts.resetAria')}
          >
            <X size={11} />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-40 w-56 bg-white border border-zinc-200 rounded-lg shadow-card overflow-hidden">
          <div className="px-3 py-2 border-b border-zinc-100 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
            {t('globalFilters.accounts.label')}
          </div>
          <div className="max-h-[240px] overflow-y-auto py-1">
            {accounts.map((acc) => {
              const selected = filters.accounts.includes(acc);
              return (
                <button
                  key={acc}
                  onClick={() => toggleAccount(acc)}
                  className="w-full flex items-center gap-2.5 px-3 h-8 text-sm text-left hover:bg-zinc-50 transition-colors"
                >
                  <Checkbox selected={selected} />
                  <span className="text-xs text-zinc-700 truncate">{acc}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const Checkbox: React.FC<{ selected: boolean }> = ({ selected }) => (
  <span
    className={`
      w-3.5 h-3.5 rounded border flex items-center justify-center
      ${selected ? 'bg-zinc-900 border-zinc-900' : 'bg-white border-zinc-300'}
    `}
  >
    {selected && (
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
        <path d="M1 4.5L3.5 7L8 1.5" stroke="white" strokeWidth="1.5" />
      </svg>
    )}
  </span>
);

const RadioDot: React.FC<{ selected: boolean }> = ({ selected }) => (
  <span
    className={`
      w-3.5 h-3.5 rounded-full border flex items-center justify-center
      ${selected ? 'border-zinc-900' : 'border-zinc-300'}
    `}
  >
    {selected && <span className="w-1.5 h-1.5 rounded-full bg-zinc-900" />}
  </span>
);
