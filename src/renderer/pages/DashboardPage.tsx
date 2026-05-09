import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DollarSign, ShoppingCart, Target as TargetIcon, TrendingDown } from 'lucide-react';
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
import {
  ActiveFiltersBar,
  Card,
  EmptyState,
  KpiDelta,
  LoadingRow,
  PageHeader,
  RangePicker,
} from '../components/ui';
import { dateRangeFor, RangeId } from '../lib/dateRange';
import { fmtMoney, fmtNumber, fmtPct } from '../lib/format';
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

export const DashboardPage: React.FC = () => {
  const { t } = useTranslation('dashboard');
  const toast = useToast();
  const { filters: globalFilters } = useGlobalFilters();
  const { list: booksList } = useBooks();
  const chips = useGlobalFilterChips(booksList);

  const [range, setRange] = useState<RangeId>('30d');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<OverviewMetrics | null>(null);
  const [daily, setDaily] = useState<DailySummary | null>(null);
  const [topPerf, setTopPerf] = useState<TopPerformersData | null>(null);
  const [mpSummary, setMpSummary] = useState<MarketplaceSummary | null>(null);
  const [bookSummary, setBookSummary] = useState<BookSummary | null>(null);

  const { from, to } = useMemo(() => dateRangeFor(range), [range]);

  // Bag общих параметров фильтрации.
  const filterParams = useMemo(
    () => ({
      from,
      to,
      attribution: '7d' as const,
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

      // Если упали ОБА главных endpoint'а — это явная проблема, кидаем toast.
      if (ovRes.status === 'rejected' && bookRes.status === 'rejected') {
        const err = bookRes.reason;
        toast.error(err instanceof ApiError ? err.message : t('loadFailed'));
      }

      setLoading(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterParams, toast],
  );

  useEffect(() => {
    load();
  }, [load]);

  const cur = overview?.current_period;
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

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <PageHeader
        title={t('title')}
        subtitle={subtitle}
        rightSlot={
          <RangePicker
            value={range}
            onChange={setRange}
            onRefresh={() => load()}
            refreshing={loading}
            autoRefresh={{ storageKey: 'auto-refresh-dashboard' }}
          />
        }
      />

      <ActiveFiltersBar chips={chips} />

      <div className="grid grid-cols-4 gap-3">
        <KpiDelta
          label="Profit"
          value={fmtMoney(cur?.profit)}
          change={ch?.profit}
          loading={loading && !overview}
          tone={cur && cur.profit < 0 ? 'negative' : 'default'}
          icon={<DollarSign size={14} />}
        />
        <KpiDelta
          label="ACOS"
          value={cur?.acos != null && cur.acos > 0 ? fmtPct(cur.acos) : '—'}
          change={ch?.acos}
          inverseChange
          loading={loading && !overview}
          tone={cur && cur.acos > 100 ? 'negative' : 'default'}
          icon={<TrendingDown size={14} />}
        />
        <KpiDelta
          label="Sales"
          value={fmtMoney(cur?.sales)}
          change={ch?.sales}
          loading={loading && !overview}
          icon={<ShoppingCart size={14} />}
        />
        <KpiDelta
          label="Spend"
          value={fmtMoney(cur?.spend)}
          change={ch?.spend}
          inverseChange
          loading={loading && !overview}
          icon={<TargetIcon size={14} />}
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
              attribution="7d"
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
        {loading && !bookSummary ? (
          <LoadingRow />
        ) : !bookSummary || bookSummary.books.length === 0 ? (
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
            <tbody>
              {[...bookSummary.books]
                .sort((a, b) => b.cost - a.cost)
                .map((b) => (
                  <BookRow key={`${b.book_id}-${b.marketplace}`} book={b} />
                ))}
            </tbody>
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
        <div className="text-xs text-zinc-900 truncate max-w-md">{book.title}</div>
      </div>
    </td>
    <td className="px-3 py-2.5 text-xs text-zinc-600 uppercase">{book.marketplace || '—'}</td>
    <td className="px-3 py-2.5 text-xs text-zinc-900 text-right tabular-nums">
      {fmtMoney(book.cost, book.currency)}
    </td>
    <td className="px-3 py-2.5 text-xs text-zinc-900 text-right tabular-nums">
      {fmtMoney(book.sales, book.currency)}
    </td>
    <td className="px-3 py-2.5 text-xs text-right tabular-nums">
      <span className={book.acos > 100 ? 'text-red-600' : 'text-zinc-700'}>
        {book.acos > 0 ? fmtPct(book.acos) : '—'}
      </span>
    </td>
    <td className="px-3 py-2.5 text-xs text-zinc-700 text-right tabular-nums">
      {fmtNumber(book.orders)}
    </td>
    <td className="px-5 py-2.5 text-xs text-zinc-700 text-right tabular-nums">
      {book.tacos != null && book.tacos > 0 ? fmtPct(book.tacos) : '—'}
    </td>
  </tr>
);
