import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  DollarSign,
  Package,
  Percent,
  PiggyBank,
  ShoppingCart,
  Target as TargetIcon,
  TrendingDown,
} from 'lucide-react';
import {
  metricsApi,
  type BookMetric,
  type BookSummary,
  type DailySummary,
  type MarketplaceSummary,
  type OverviewMetrics,
  type TopPerformersData,
} from '../api/metrics';
import { ApiError } from '../api/client';
import { localRoyaltyApi } from '../api/localRoyalty';
import { amazonAdsApi } from '../api/amazonAds';
import {
  ActiveFiltersBar,
  Card,
  EmptyState,
  KpiDelta,
  PageHeader,
  RangePicker,
  TableSkeletonBody,
} from '../components/ui';
import { dateRangeFor, RangeId } from '../lib/dateRange';
import { fmtMoney, fmtNumber, fmtPct } from '../lib/format';
import { flagFor } from '../lib/marketplaceFlags';
import { useSessionState } from '../lib/useSessionState';
import { useToast } from '../contexts/ToastContext';
import {
  useGlobalFilters,
  useGlobalFilterChips,
} from '../contexts/GlobalFiltersContext';
import { useBooks } from '../contexts/BooksContext';
import { HeroChart } from '../components/dashboard/HeroChart';
import { TopPerformers } from '../components/dashboard/TopPerformers';
import { MarketplaceDistribution } from '../components/dashboard/MarketplaceDistribution';
import { FunnelChart } from '../components/dashboard/FunnelChart';
import { AlertsWidget } from '../components/dashboard/AlertsWidget';
import {
  QuickPeriod,
  QuickPeriodSegment,
  quickFromRange,
  rangeFromQuick,
} from '../components/dashboard/QuickPeriodSegment';
import { OrganicPaidBlock } from '../components/dashboard/OrganicPaidBlock';
import { BriefingCard } from '../components/dashboard/BriefingCard';
import { OnboardingEmptyState } from '../components/dashboard/OnboardingEmptyState';

/**
 * Enumerate the YYYY-MM months covered by a [from, to] inclusive date range.
 * Royalty в локальном сторе ключуется по target_month (YYYY-MM), а Dashboard
 * выбирает диапазон дат — поэтому суммируем по всем месяцам, которые попадают
 * в окно. from/to приходят из dateRangeFor() в формате YYYY-MM-DD.
 */
function monthsInRange(from: string, to: string): string[] {
  const months: string[] = [];
  const fromMonth = from.slice(0, 7); // YYYY-MM
  const toMonth = to.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(fromMonth) || !/^\d{4}-\d{2}$/.test(toMonth)) {
    return months;
  }
  let [y, m] = fromMonth.split('-').map(Number);
  const [toY, toM] = toMonth.split('-').map(Number);
  // Guard against an inverted range (to < from) — нечего перечислять.
  if (toY < y || (toY === y && toM < m)) return months;
  // Hard cap to avoid pathological loops on bad input.
  for (let i = 0; i < 240; i += 1) {
    months.push(`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`);
    if (y === toY && m === toM) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

export const DashboardPage: React.FC = () => {
  const { t } = useTranslation('dashboard');
  const toast = useToast();
  const { filters: globalFilters } = useGlobalFilters();
  const { list: booksList } = useBooks();
  const chips = useGlobalFilterChips(booksList);

  const [quickPeriod, setQuickPeriod] = useSessionState<QuickPeriod>(
    'dashboard:quickPeriod',
    'thisMonth',
  );
  const [customRange, setCustomRange] = useState<RangeId>('30d');
  const range: RangeId = rangeFromQuick(quickPeriod) ?? customRange;
  const setRange = (r: RangeId) => {
    setCustomRange(r);
    setQuickPeriod(quickFromRange(r));
  };

  const handleQuickChange = (next: QuickPeriod) => {
    setQuickPeriod(next);
    const mapped = rangeFromQuick(next);
    if (mapped) setCustomRange(mapped);
  };

  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<OverviewMetrics | null>(null);
  const [daily, setDaily] = useState<DailySummary | null>(null);
  const [topPerf, setTopPerf] = useState<TopPerformersData | null>(null);
  const [mpSummary, setMpSummary] = useState<MarketplaceSummary | null>(null);
  const [bookSummary, setBookSummary] = useState<BookSummary | null>(null);
  // Royalty — source of truth = local store (IPC), НЕ бэкенд. Это чинит $0 на
  // Dashboard и держит royalty приватной (не уходит на Railway). null = ещё не
  // загружено / IPC недоступен → fallback на бэкендовое значение.
  const [localRoyalty, setLocalRoyalty] = useState<number | null>(null);
  // Blocker #6 — Amazon Ads connection signal, used ONLY to decide whether to
  // show the new-user onboarding panel. `getTokenInfo().has_refresh_token` is
  // the cheapest reliable signal (single GET). null = unknown (not yet loaded
  // or the call failed) — we treat unknown conservatively as "не подтверждено
  // подключение", and the onboarding gate additionally requires "no books", so
  // a failed token-info check can never hide a real user's dashboard.
  const [amazonConnected, setAmazonConnected] = useState<boolean | null>(null);

  const { from, to } = useMemo(() => dateRangeFor(range), [range]);

  // Bag общих параметров фильтрации.
  const filterParams = useMemo(
    () => ({
      from,
      to,
      marketplaces: globalFilters.marketplaces.length
        ? globalFilters.marketplaces
        : undefined,
      bookIds: globalFilters.bookId != null ? [globalFilters.bookId] : undefined,
      accounts: globalFilters.accounts.length ? globalFilters.accounts : undefined,
    }),
    [from, to, globalFilters.marketplaces, globalFilters.bookId, globalFilters.accounts],
  );

  const load = useMemo(
    () => async () => {
      setLoading(true);
      // Параллельный fetch. Если один из вторичных endpoint'ов упадёт — мы
      // не прерываем рендер остальных секций, а молча показываем placeholder.
      // Главные ошибки (overview/by-book) показываем тостом.
      const settled = await Promise.allSettled([
        metricsApi.overview(filterParams),
        metricsApi.summaryDaily(filterParams),
        metricsApi.topPerformers({ ...filterParams, limit: 5 }),
        metricsApi.summaryByMarketplace(filterParams),
        metricsApi.summaryByBook(filterParams),
      ]);

      const [ovRes, dailyRes, topRes, mpRes, bookRes] = settled;

      if (ovRes.status === 'fulfilled') setOverview(ovRes.value);
      else setOverview(null);

      if (dailyRes.status === 'fulfilled') setDaily(dailyRes.value);
      else setDaily(null);

      if (topRes.status === 'fulfilled') setTopPerf(topRes.value);
      else setTopPerf(null);

      if (mpRes.status === 'fulfilled') setMpSummary(mpRes.value);
      else setMpSummary(null);

      if (bookRes.status === 'fulfilled') setBookSummary(bookRes.value);
      else setBookSummary(null);

      // Royalty читаем из локального стора через IPC, а не с бэкенда.
      // Локальный royalty ключуется по месяцу — суммируем все месяцы окна.
      if (localRoyaltyApi.isAvailable()) {
        try {
          const months = monthsInRange(from, to);
          const summaries = await Promise.all(
            months.map((mo) => localRoyaltyApi.getSummary(mo)),
          );
          const sum = summaries.reduce(
            (acc, s) => acc + (s?.totals?.royalty ?? 0),
            0,
          );
          setLocalRoyalty(sum);
        } catch {
          // Локальный store недоступен/повреждён — не валим Dashboard,
          // оставляем fallback на бэкендовое royalty.
          setLocalRoyalty(null);
        }
      } else {
        setLocalRoyalty(null);
      }

      // Если упали ОБА главных endpoint'а — это явная проблема, кидаем toast.
      if (ovRes.status === 'rejected' && bookRes.status === 'rejected') {
        const err = bookRes.reason;
        toast.error(err instanceof ApiError ? err.message : t('loadFailed'));
      }

      setLoading(false);
    },
    [filterParams, from, to, toast],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Blocker #6 — fetch the Amazon connection signal once on mount. Independent
  // of the period filters (connection isn't date-scoped), so it lives in its
  // own effect and is NOT re-run on range changes. Failure → leave `null`
  // (unknown); the onboarding gate stays conservative.
  useEffect(() => {
    let cancelled = false;
    amazonAdsApi
      .getTokenInfo()
      .then((info) => {
        if (!cancelled) setAmazonConnected(!!info.has_refresh_token);
      })
      .catch(() => {
        if (!cancelled) setAmazonConnected(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Royalty (и зависящий от неё profit) показываем из локального стора, не с
  // бэкенда. Если локальное значение загружено — подменяем royalty и сдвигаем
  // profit на дельту (profit = ... + royalty, поэтому корректируем по разнице,
  // не переписывая всю формулу бэкенда). Остальные KPI остаются как есть.
  const cur = useMemo(() => {
    const base = overview?.current_period;
    if (!base) return base;
    if (localRoyalty == null) return base;
    const delta = localRoyalty - (base.royalty ?? 0);
    return {
      ...base,
      royalty: localRoyalty,
      profit: (base.profit ?? 0) + delta,
    };
  }, [overview, localRoyalty]);
  const ch = overview?.changes;

  const subtitle = overview
    ? t('subtitle.withDates', {
        from: overview.date_from,
        to: overview.date_to,
        window: overview.attribution_window,
      })
    : bookSummary
    ? t('subtitle.withDates', {
        from: bookSummary.date_from,
        to: bookSummary.date_to,
        window: bookSummary.attribution_window,
      })
    : t('subtitle.loading');

  // Blocker #6 — "brand-new user" gate for the onboarding empty-state.
  //
  // Show onboarding ONLY when the user genuinely has nothing. Both conditions
  // must hold:
  //   (a) no books — neither the app-wide BooksContext list nor the period's
  //       by-book summary has any rows. `booksList` is the source of truth
  //       (loaded once at app level, NOT date-scoped), so a transient empty
  //       period can't make a 41-book owner look new. We also check
  //       `bookSummary` so we never flash onboarding before the list resolves.
  //   (b) Amazon NOT connected — `amazonConnected === false` (confirmed no
  //       refresh token). `null` (unknown / token-info call failed) does NOT
  //       satisfy this, so a failed signal can never hide a real dashboard.
  //
  // We also wait for `!loading` so the panel never flashes during initial load.
  const hasBooks =
    booksList.length > 0 || (bookSummary != null && bookSummary.books.length > 0);
  const isBrandNewUser =
    !loading && !hasBooks && amazonConnected === false;

  if (isBrandNewUser) {
    return (
      <div className="space-y-6" data-testid="dashboard-page">
        <PageHeader
          title={t('title')}
          subtitle={t('subtitle.onboarding', {
            defaultValue: 'Set up your account to start tracking',
          })}
        />
        <OnboardingEmptyState />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <PageHeader
        title={t('title')}
        subtitle={subtitle}
        rightSlot={
          <div className="flex items-center gap-2">
            <QuickPeriodSegment value={quickPeriod} onChange={handleQuickChange} />
            <RangePicker
              value={range}
              onChange={setRange}
              onRefresh={() => load()}
              refreshing={loading}
              autoRefresh={{ storageKey: 'auto-refresh-dashboard' }}
            />
          </div>
        }
      />

      <ActiveFiltersBar chips={chips} />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        <KpiDelta
          label={t('kpi.profit')}
          value={fmtMoney(cur?.profit)}
          // Profit включает royalty (подменённую локальной), поэтому бэкендовая
          // дельта profit устаревает при локальном override — скрываем её.
          change={localRoyalty == null ? ch?.profit : undefined}
          loading={loading && !overview}
          tone={cur && cur.profit < 0 ? 'negative' : 'default'}
          icon={<DollarSign size={14} />}
        />
        <KpiDelta
          label={t('kpi.acos')}
          value={cur?.acos != null && cur.acos > 0 ? fmtPct(cur.acos) : '—'}
          change={ch?.acos}
          inverseChange
          loading={loading && !overview}
          tone={cur && cur.acos > 100 ? 'negative' : 'default'}
          icon={<TrendingDown size={14} />}
        />
        <KpiDelta
          label={t('kpi.sales')}
          value={fmtMoney(cur?.sales)}
          change={ch?.sales}
          loading={loading && !overview}
          icon={<ShoppingCart size={14} />}
        />
        <KpiDelta
          label={t('kpi.spend')}
          value={fmtMoney(cur?.spend)}
          change={ch?.spend}
          inverseChange
          loading={loading && !overview}
          icon={<TargetIcon size={14} />}
        />
        <KpiDelta
          label={t('kpi.royalty')}
          value={fmtMoney(cur?.royalty)}
          // Когда royalty взята из локального стора, бэкендовая дельта
          // (ch.royalty) относится к другому значению — не показываем её,
          // чтобы не вводить в заблуждение. С fallback на бэкенд — показываем.
          change={localRoyalty == null ? ch?.royalty : undefined}
          loading={loading && !overview}
          icon={<BookOpen size={14} />}
        />
        <KpiDelta
          label={t('kpi.orders')}
          value={fmtNumber(cur?.orders)}
          change={ch?.orders}
          loading={loading && !overview}
          icon={<Package size={14} />}
        />
        <KpiDelta
          label={t('kpi.tacos')}
          value={cur?.tacos != null && cur.tacos > 0 ? fmtPct(cur.tacos) : '—'}
          change={ch?.tacos}
          inverseChange
          loading={loading && !overview}
          icon={<Percent size={14} />}
        />
        <KpiDelta
          label={t('kpi.roas')}
          value={
            cur?.roas != null && cur.roas > 0
              ? `${cur.roas.toFixed(2)}×`
              : '—'
          }
          change={ch?.roas}
          loading={loading && !overview}
          icon={<PiggyBank size={14} />}
        />
      </div>

      <Card
        title={t('cards.performance')}
        rightSlot={
          <span className="text-xs text-zinc-400">{t('metrics.clickHint')}</span>
        }
        bodyClassName="px-5 py-4"
      >
        <HeroChart
          data={daily?.daily ?? []}
          loading={loading && !daily}
          targetAcos={25}
          onLimitReached={() => toast.info(t('metrics.limitReached'))}
        />
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <Card title={t('cards.topPerformers')} bodyClassName="px-5 py-4">
            <TopPerformers data={topPerf} loading={loading && !topPerf} />
          </Card>
        </div>

        <div className="space-y-4">
          <Card title={t('cards.alerts')} bodyClassName="px-5 py-3">
            <AlertsWidget
              from={from}
              to={to}
              attribution={globalFilters.attribution}
              marketplaces={filterParams.marketplaces}
              bookIds={filterParams.bookIds}
              accounts={filterParams.accounts}
            />
          </Card>

          <Card title={t('cards.funnel')} bodyClassName="px-5 py-4">
            <FunnelChart data={cur ?? null} loading={loading && !overview} />
          </Card>
        </div>
      </div>

      <BriefingCard />

      <OrganicPaidBlock
        from={from}
        to={to}
        attribution={globalFilters.attribution}
        marketplaces={filterParams.marketplaces}
        bookIds={filterParams.bookIds}
        accounts={filterParams.accounts}
      />

      <Card title={t('cards.marketplaceShare')} bodyClassName="px-5 py-4">
        <MarketplaceDistribution summary={mpSummary} loading={loading && !mpSummary} />
      </Card>

      <Card
        title={t('cards.books')}
        rightSlot={
          <div className="text-xs text-zinc-500">
            {bookSummary
              ? t('books.totalSuffix', { count: bookSummary.books.length })
              : null}
          </div>
        }
      >
        {!loading && (!bookSummary || bookSummary.books.length === 0) ? (
          <EmptyState />
        ) : (
          <table className="w-full text-sm table-sticky-head">
            <thead>
              <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                <th className="text-left px-5 py-2 font-medium">{t('books.th.book')}</th>
                <th className="text-left px-3 py-2 font-medium">MP</th>
                <th className="text-right px-3 py-2 font-medium">Spend</th>
                <th className="text-right px-3 py-2 font-medium">Sales</th>
                <th className="text-right px-3 py-2 font-medium">ACOS</th>
                <th className="text-right px-3 py-2 font-medium">Orders</th>
                <th className="text-right px-5 py-2 font-medium">TACoS</th>
              </tr>
            </thead>
            {loading && !bookSummary ? (
              <TableSkeletonBody rows={5} columns={7} />
            ) : (
              <tbody>
                {[...(bookSummary?.books ?? [])]
                  .sort((a, b) => b.cost - a.cost)
                  .map((b) => (
                    <BookRow key={`${b.book_id}-${b.marketplace}`} book={b} />
                  ))}
              </tbody>
            )}
          </table>
        )}
      </Card>
    </div>
  );
};

const BookRow: React.FC<{ book: BookMetric }> = ({ book }) => (
  <tr className="border-t border-zinc-100 hover:bg-zinc-50/60">
    <td className="px-5 py-2.5">
      <div className="flex items-center gap-2.5">
        {book.cover_image ? (
          <img
            src={book.cover_image}
            alt=""
            className="w-7 h-9 object-cover rounded-sm border border-zinc-200 flex-shrink-0"
          />
        ) : (
          <div className="w-7 h-9 rounded-sm bg-zinc-100 border border-zinc-200 flex-shrink-0" />
        )}
        <div className="text-sm text-zinc-900 truncate max-w-md">{book.title}</div>
      </div>
    </td>
    <td className="px-3 py-2.5 text-sm text-zinc-600 uppercase whitespace-nowrap">
      {book.marketplace ? (
        <>
          {flagFor(book.marketplace) ? (
            <span className="mr-1">{flagFor(book.marketplace)}</span>
          ) : null}
          {book.marketplace}
        </>
      ) : (
        '—'
      )}
    </td>
    <td className="px-3 py-2.5 text-sm text-zinc-900 text-right tabular-nums">
      {fmtMoney(book.cost, book.currency)}
    </td>
    <td className="px-3 py-2.5 text-sm text-zinc-900 text-right tabular-nums">
      {fmtMoney(book.sales, book.currency)}
    </td>
    <td className="px-3 py-2.5 text-sm text-right tabular-nums">
      <span className={book.acos > 100 ? 'text-red-600' : 'text-zinc-700'}>
        {book.acos > 0 ? fmtPct(book.acos) : '—'}
      </span>
    </td>
    <td className="px-3 py-2.5 text-sm text-zinc-700 text-right tabular-nums">
      {fmtNumber(book.orders)}
    </td>
    <td className="px-5 py-2.5 text-sm text-zinc-700 text-right tabular-nums">
      {book.tacos != null && book.tacos > 0 ? fmtPct(book.tacos) : '—'}
    </td>
  </tr>
);
