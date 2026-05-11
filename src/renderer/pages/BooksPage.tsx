import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, ChevronDown, ChevronRight } from 'lucide-react';
import { ApiError } from '../api/client';
import { metricsApi, BookMetric, BookSummary, CampaignAnalyticsItem } from '../api/metrics';
import { ratingsApi, BookRating, Book } from '../api/books';
import {
  PageHeader,
  RangePicker,
  Card,
  Kpi,
  EmptyState,
  LoadingRow,
  ActiveFiltersBar,
} from '../components/ui';
import { dateRangeFor, RangeId } from '../lib/dateRange';
import { fmtMoney, fmtMoneyPrecise, fmtNumber, fmtPct } from '../lib/format';
import { useToast } from '../contexts/ToastContext';
import { useNav } from '../contexts/NavContext';
import {
  useGlobalFilters,
  useGlobalFilterChips,
} from '../contexts/GlobalFiltersContext';
import { useBooks } from '../contexts/BooksContext';
import { BookBreadcrumb } from '../components/books/BookBreadcrumb';
import { BooksMarketplacesPanel } from '../components/books/BooksMarketplacesPanel';
import { BooksCampaignsPanel } from '../components/books/BooksCampaignsPanel';
import { EditBookModal } from '../components/books/EditBookModal';
import { DeleteBookModal } from '../components/books/DeleteBookModal';
import { AddAsinModal } from '../components/books/AddAsinModal';
import { UploadCoverModal } from '../components/books/UploadCoverModal';
import { AddChangeModal } from '../components/books/AddChangeModal';

interface BookGroup {
  book_id: number;
  title: string;
  cover_image: string | null;
  account: string | null;
  rows: BookMetric[];
  totals: {
    cost: number;
    sales: number;
    royalty: number;
    orders: number;
    clicks: number;
  };
  acos: number;
  tacos: number;
}

type SortKey = 'spend' | 'sales' | 'orders' | 'acos';

type ModalType = 'edit' | 'delete' | 'addAsin' | 'uploadCover' | 'addChange' | null;

export const BooksPage: React.FC = () => {
  const { t } = useTranslation('books');
  const toast = useToast();
  const { booksDrill, setBooksDrill } = useNav();
  const { filters: globalFilters } = useGlobalFilters();
  const { list: booksList, refetch: refetchBooks } = useBooks();
  const chips = useGlobalFilterChips(booksList);
  const [range, setRange] = useState<RangeId>('30d');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<BookSummary | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('spend');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [ratings, setRatings] = useState<BookRating[]>([]);

  // Drill state
  const [drillCampaigns, setDrillCampaigns] = useState<CampaignAnalyticsItem[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);

  // Modal state
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);

  const { from, to } = useMemo(() => dateRangeFor(range), [range]);

  const load = useMemo(
    () => async () => {
      setLoading(true);
      try {
        const [data] = await Promise.all([
          metricsApi.summaryByBook({
            from,
            to,
            attribution: '7d',
            marketplaces: globalFilters.marketplaces.length
              ? globalFilters.marketplaces
              : undefined,
            bookIds: globalFilters.bookId != null ? [globalFilters.bookId] : undefined,
            accounts: globalFilters.accounts.length ? globalFilters.accounts : undefined,
          }),
        ]);
        setSummary(data);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : t('loadFailed'));
      } finally {
        setLoading(false);
      }
      // Load ratings silently
      try {
        const rData = await ratingsApi.allBooks();
        setRatings(rData.ratings);
      } catch {
        // ratings are optional, don't show error
      }
    },
    [from, to, toast, t, globalFilters.marketplaces, globalFilters.bookId, globalFilters.accounts],
  );

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo<BookGroup[]>(() => {
    if (!summary) return [];
    const byBook = new Map<number, BookGroup>();
    for (const row of summary.books) {
      let g = byBook.get(row.book_id);
      if (!g) {
        g = {
          book_id: row.book_id,
          title: row.title,
          cover_image: row.cover_image,
          account: row.account,
          rows: [],
          totals: { cost: 0, sales: 0, royalty: 0, orders: 0, clicks: 0 },
          acos: 0,
          tacos: 0,
        };
        byBook.set(row.book_id, g);
      }
      g.rows.push(row);
      g.totals.cost += row.cost || 0;
      g.totals.sales += row.sales || 0;
      g.totals.royalty += row.royalty || 0;
      g.totals.orders += row.orders || 0;
      g.totals.clicks += row.clicks || 0;
    }
    for (const g of byBook.values()) {
      g.acos = g.totals.sales > 0 ? (g.totals.cost / g.totals.sales) * 100 : 0;
      g.tacos =
        g.totals.royalty > 0 ? (g.totals.cost / g.totals.royalty) * 100 : 0;
      g.rows.sort((a, b) => b.cost - a.cost);
    }
    return [...byBook.values()];
  }, [summary]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? groups.filter((g) => g.title.toLowerCase().includes(q))
      : groups;
    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'sales':
          return b.totals.sales - a.totals.sales;
        case 'orders':
          return b.totals.orders - a.totals.orders;
        case 'acos':
          return b.acos - a.acos;
        case 'spend':
        default:
          return b.totals.cost - a.totals.cost;
      }
    });
    return list;
  }, [groups, search, sortKey]);

  const totals = useMemo(() => {
    const acc = filtered.reduce(
      (a, g) => ({
        cost: a.cost + g.totals.cost,
        sales: a.sales + g.totals.sales,
        orders: a.orders + g.totals.orders,
        royalty: a.royalty + g.totals.royalty,
      }),
      { cost: 0, sales: 0, orders: 0, royalty: 0 },
    );
    return {
      ...acc,
      acos: acc.sales > 0 ? (acc.cost / acc.sales) * 100 : 0,
      tacos: acc.royalty > 0 ? (acc.cost / acc.royalty) * 100 : 0,
    };
  }, [filtered]);

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDrillToMarketplaces = (group: BookGroup) => {
    setBooksDrill({
      level: 'marketplaces',
      selectedBookId: group.book_id,
      selectedBookTitle: group.title,
    });
  };

  const handleDrillToCampaigns = async (marketplace: string) => {
    setBooksDrill({
      level: 'campaigns',
      selectedBookId: booksDrill.selectedBookId,
      selectedBookTitle: booksDrill.selectedBookTitle,
      selectedMarketplace: marketplace,
    });
    setDrillLoading(true);
    try {
      const data = await metricsApi.summaryByCampaign({
        from,
        to,
        attribution: '7d',
        bookIds: booksDrill.selectedBookId != null ? [booksDrill.selectedBookId] : undefined,
        marketplaces: [marketplace],
      });
      setDrillCampaigns(data.campaigns);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('loadFailed'));
      setDrillCampaigns([]);
    } finally {
      setDrillLoading(false);
    }
  };

  // ────────────────────────────────────────────────────────────────────────
  // Phase J.5 Lane E — KDP metrics inline columns.
  //
  // We compute three derived metrics per book row and render them gracefully
  // (`—` when an input is missing). Backend has /api/books/:id/kdp-metrics
  // for precise per-marketplace numbers, but firing 1+N requests just to
  // populate a list view would dominate page latency. Instead we lean on
  // metadata that's already loaded in `useBooks()`:
  //
  //   royalty/page = total_royalty / page_count    (truly per-page royalty)
  //   BE-ACOS      = book.be_acos                   (set in Edit Book modal)
  //   Max CPC      = book.max_cpc                   (set in Edit Book modal)
  //
  // BE-ACOS and Max CPC are user-configured per book; the alternative
  // (royalty / sales_price × 100) requires a list price we don't have in
  // the summary payload. We keep the spec's gracefully-`—` contract so the
  // column doesn't shout at users who haven't filled the fields yet.
  const kdpMetricsFor = (
    bookId: number,
    royalty: number,
  ): { royaltyPerPage: number | null; beAcos: number | null; maxCpc: number | null } => {
    const book = booksList.find((b) => b.id === bookId);
    const pages = book?.page_count ?? null;
    return {
      royaltyPerPage:
        pages && pages > 0 && royalty > 0 ? royalty / pages : null,
      beAcos: book?.be_acos ?? null,
      maxCpc: book?.max_cpc ?? null,
    };
  };

  const handleBreadcrumbNav = (level: 'list' | 'marketplaces' | 'campaigns') => {
    if (level === 'list') {
      setBooksDrill({ level: 'list' });
    } else if (level === 'marketplaces') {
      setBooksDrill({
        level: 'marketplaces',
        selectedBookId: booksDrill.selectedBookId,
        selectedBookTitle: booksDrill.selectedBookTitle,
      });
    }
  };

  const openModal = (type: ModalType, book?: Book) => {
    setActiveModal(type);
    if (book) setSelectedBook(book);
  };

  const closeModal = () => {
    setActiveModal(null);
    setSelectedBook(null);
  };

  const getRatingsForBook = (bookId: number) => ratings.filter((r) => r.bookId === bookId);

  // Get the rows for the selected book (marketplaces panel)
  const selectedBookRows = useMemo(() => {
    if (!booksDrill.selectedBookId) return [];
    const g = groups.find((g) => g.book_id === booksDrill.selectedBookId);
    return g?.rows ?? [];
  }, [groups, booksDrill.selectedBookId]);

  return (
    <div className="space-y-6" data-testid="books-page">
      <PageHeader
        title={t('title')}
        subtitle={
          summary
            ? t('subtitle.withDates', {
                from: summary.date_from,
                to: summary.date_to,
                count: groups.length,
              })
            : t('subtitle.loading')
        }
        rightSlot={
          <RangePicker
            value={range}
            onChange={setRange}
            onRefresh={() => load()}
            refreshing={loading}
            autoRefresh={{ storageKey: 'auto-refresh-books' }}
          />
        }
      />

      <ActiveFiltersBar chips={chips} />

      {booksDrill.level !== 'list' && (
        <BookBreadcrumb drill={booksDrill} onNavigate={handleBreadcrumbNav} />
      )}

      {booksDrill.level === 'list' && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <Kpi label={t('kpi.books')} value={fmtNumber(filtered.length)} loading={loading} />
            <Kpi label="Spend" value={fmtMoney(totals.cost)} loading={loading} />
            <Kpi label="Orders" value={fmtNumber(totals.orders)} loading={loading} />
            <Kpi
              label="ACOS"
              value={fmtPct(totals.acos)}
              loading={loading}
              tone={totals.acos > 100 ? 'negative' : 'default'}
            />
          </div>

          <Card
            title={t('card.title')}
            rightSlot={
              <div className="flex items-center gap-2">
                <SortControl value={sortKey} onChange={setSortKey} />
                <SearchInput value={search} onChange={setSearch} />
              </div>
            }
          >
            {loading && !summary ? (
              <LoadingRow />
            ) : filtered.length === 0 ? (
              <EmptyState
                title={search ? t('empty.search') : t('empty.noData')}
              />
            ) : (
              <table className="w-full text-sm table-sticky-head">
                <thead>
                  <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                    <th className="text-left px-5 py-2 font-medium">{t('th.book')}</th>
                    <th className="text-left px-3 py-2 font-medium">MPs</th>
                    <th className="text-right px-3 py-2 font-medium">Spend</th>
                    <th className="text-right px-3 py-2 font-medium">Sales</th>
                    <th className="text-right px-3 py-2 font-medium">Orders</th>
                    <th className="text-right px-3 py-2 font-medium">ACOS</th>
                    <th className="text-right px-3 py-2 font-medium">{t('th.ratings')}</th>
                    <th className="text-right px-3 py-2 font-medium">{t('th.royalty')}</th>
                    <th className="text-right px-3 py-2 font-medium">{t('th.beAcos')}</th>
                    <th className="text-right px-3 py-2 font-medium">{t('th.maxCpc')}</th>
                    <th className="text-right px-5 py-2 font-medium">TACoS</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((g) => (
                    <BookGroupRows
                      key={g.book_id}
                      group={g}
                      expanded={expanded.has(g.book_id)}
                      onToggle={() => toggle(g.book_id)}
                      onDrillDown={() => handleDrillToMarketplaces(g)}
                      ratings={getRatingsForBook(g.book_id)}
                      kdp={kdpMetricsFor(g.book_id, g.totals.royalty)}
                      onOpenModal={(type) => {
                        const book = booksList.find((b) => b.id === g.book_id);
                        if (book) openModal(type, book);
                      }}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}

      {booksDrill.level === 'marketplaces' && (
        <Card title={t('drill.marketplaces')}>
          <div className="p-4">
            <BooksMarketplacesPanel
              bookId={booksDrill.selectedBookId ?? 0}
              rows={selectedBookRows}
              loading={loading}
              onSelectMarketplace={handleDrillToCampaigns}
            />
          </div>
        </Card>
      )}

      {booksDrill.level === 'campaigns' && (
        <Card title={t('drill.campaigns')}>
          <BooksCampaignsPanel campaigns={drillCampaigns} loading={drillLoading} />
        </Card>
      )}

      {/* Modals */}
      {activeModal === 'edit' && selectedBook && (
        <EditBookModal
          book={selectedBook}
          onClose={closeModal}
          onSaved={() => {
            refetchBooks();
            load();
          }}
        />
      )}
      {activeModal === 'delete' && selectedBook && (
        <DeleteBookModal
          book={selectedBook}
          onClose={closeModal}
          onDone={() => {
            refetchBooks();
            load();
          }}
        />
      )}
      {activeModal === 'addAsin' && selectedBook && (
        <AddAsinModal
          bookId={selectedBook.id}
          onClose={closeModal}
          onSaved={() => refetchBooks()}
        />
      )}
      {activeModal === 'uploadCover' && selectedBook && (
        <UploadCoverModal
          bookId={selectedBook.id}
          onClose={closeModal}
          onUploaded={() => refetchBooks()}
        />
      )}
      {activeModal === 'addChange' && selectedBook && (
        <AddChangeModal
          bookId={selectedBook.id}
          onClose={closeModal}
          onSaved={() => { /* no-op: AddChangeModal saves immediately */ }}
        />
      )}
    </div>
  );
};

const BookGroupRows: React.FC<{
  group: BookGroup;
  expanded: boolean;
  onToggle: () => void;
  onDrillDown: () => void;
  ratings: BookRating[];
  kdp: { royaltyPerPage: number | null; beAcos: number | null; maxCpc: number | null };
  onOpenModal: (type: ModalType) => void;
}> = ({ group, expanded, onToggle, onDrillDown, ratings, kdp }) => {
  const { t } = useTranslation('books');
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const topRating = ratings[0];
  return (
    <>
      <tr
        className="border-t border-zinc-100 hover:bg-zinc-50/80 cursor-pointer transition-colors"
        data-testid={`book-row-${group.book_id}`}
        onClick={onDrillDown}
        title={t('row.openCampaigns')}
      >
        <td className="px-5 py-2.5">
          <div className="flex items-center gap-2.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              className="flex-shrink-0 p-0.5 -m-0.5 rounded hover:bg-zinc-200 transition-colors"
              title={expanded ? t('row.collapseAria') : t('row.expandAria')}
              aria-label={expanded ? t('row.collapseAria') : t('row.expandAria')}
            >
              <Chevron size={14} className="text-zinc-400" />
            </button>
            {group.cover_image ? (
              <img
                src={group.cover_image}
                alt=""
                className="w-7 h-9 object-cover rounded-sm border border-zinc-200 flex-shrink-0"
              />
            ) : (
              <div className="w-7 h-9 rounded-sm bg-zinc-100 border border-zinc-200 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-xs text-zinc-900 truncate max-w-md">
                {group.title}
              </div>
              {group.account && (
                <div className="text-[10px] text-zinc-400 mt-0.5">{group.account}</div>
              )}
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5 text-xs text-zinc-600 uppercase">
          {group.rows.length}
        </td>
        <td className="px-3 py-2.5 text-xs text-zinc-900 text-right tabular-nums">
          {fmtMoney(group.totals.cost)}
        </td>
        <td className="px-3 py-2.5 text-xs text-zinc-900 text-right tabular-nums">
          {fmtMoney(group.totals.sales)}
        </td>
        <td className="px-3 py-2.5 text-xs text-zinc-700 text-right tabular-nums">
          {group.totals.orders}
        </td>
        <td className="px-3 py-2.5 text-xs text-right tabular-nums">
          <span className={group.acos > 100 ? 'text-red-600' : 'text-zinc-700'}>
            {group.acos > 0 ? fmtPct(group.acos) : '—'}
          </span>
        </td>
        <td className="px-3 py-2.5 text-xs text-right tabular-nums text-zinc-500">
          {topRating
            ? `${topRating.stars.toFixed(1)}★ (${topRating.count})`
            : '—'}
        </td>
        {/* KDP metrics — three columns. `—` when input data is missing,
            preserving the spec's gracefully-degrade contract. */}
        <td
          className="px-3 py-2.5 text-xs text-right tabular-nums text-zinc-700"
          data-testid={`book-royalty-per-page-${group.book_id}`}
        >
          {kdp.royaltyPerPage != null
            ? fmtMoneyPrecise(kdp.royaltyPerPage)
            : '—'}
        </td>
        <td
          className="px-3 py-2.5 text-xs text-right tabular-nums text-zinc-700"
          data-testid={`book-be-acos-${group.book_id}`}
        >
          {kdp.beAcos != null ? fmtPct(kdp.beAcos) : '—'}
        </td>
        <td
          className="px-3 py-2.5 text-xs text-right tabular-nums text-zinc-700"
          data-testid={`book-max-cpc-${group.book_id}`}
        >
          {kdp.maxCpc != null ? fmtMoneyPrecise(kdp.maxCpc) : '—'}
        </td>
        <td className="px-5 py-2.5 text-xs text-zinc-700 text-right tabular-nums">
          {group.tacos > 0 ? fmtPct(group.tacos) : '—'}
        </td>
      </tr>
      {expanded &&
        group.rows.map((row) => (
          <tr
            key={`${row.book_id}-${row.marketplace}`}
            className="border-t border-zinc-100 bg-zinc-50/40 hover:bg-zinc-100/60 cursor-pointer transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onDrillDown();
            }}
            title={t('row.openCampaignsForMp')}
          >
            <td className="pl-14 pr-5 py-2 text-[11px] text-zinc-600">
              <span className="font-mono uppercase">{row.marketplace || '—'}</span>
              {row.currency && (
                <span className="ml-2 text-zinc-400">{row.currency}</span>
              )}
            </td>
            <td className="px-3 py-2 text-[11px] text-zinc-400">—</td>
            <td className="px-3 py-2 text-[11px] text-zinc-700 text-right tabular-nums">
              {fmtMoney(row.cost, row.currency)}
            </td>
            <td className="px-3 py-2 text-[11px] text-zinc-700 text-right tabular-nums">
              {fmtMoney(row.sales, row.currency)}
            </td>
            <td className="px-3 py-2 text-[11px] text-zinc-600 text-right tabular-nums">
              {row.orders}
            </td>
            <td className="px-3 py-2 text-[11px] text-right tabular-nums">
              <span className={row.acos > 100 ? 'text-red-600' : 'text-zinc-600'}>
                {row.acos > 0 ? fmtPct(row.acos) : '—'}
              </span>
            </td>
            <td className="px-3 py-2 text-[11px] text-zinc-400 text-right">—</td>
            {/* KDP columns are only meaningful at the book level (book.metadata)
                — leave child rows empty so the row aligns. */}
            <td className="px-3 py-2 text-[11px] text-zinc-400 text-right">—</td>
            <td className="px-3 py-2 text-[11px] text-zinc-400 text-right">—</td>
            <td className="px-3 py-2 text-[11px] text-zinc-400 text-right">—</td>
            <td className="px-5 py-2 text-[11px] text-zinc-600 text-right tabular-nums">
              {row.tacos != null && row.tacos > 0 ? fmtPct(row.tacos) : '—'}
            </td>
          </tr>
        ))}
    </>
  );
};

const SearchInput: React.FC<{ value: string; onChange: (v: string) => void }> = ({
  value,
  onChange,
}) => {
  const { t } = useTranslation('books');
  return (
    <div className="relative">
      <Search
        size={12}
        className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('search')}
        className="
          w-44 h-7 pl-7 pr-2 text-xs rounded-md
          border border-zinc-200 bg-white
          text-zinc-900 placeholder:text-zinc-400
          focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
        "
      />
    </div>
  );
};

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'spend', label: 'Spend' },
  { value: 'sales', label: 'Sales' },
  { value: 'orders', label: 'Orders' },
  { value: 'acos', label: 'ACOS' },
];

const SortControl: React.FC<{
  value: SortKey;
  onChange: (v: SortKey) => void;
}> = ({ value, onChange }) => (
  <div className="inline-flex items-center bg-white border border-zinc-200 rounded-md p-0.5">
    {SORT_OPTIONS.map((o) => (
      <button
        key={o.value}
        onClick={() => onChange(o.value)}
        className={`
          px-2 h-6 text-[11px] font-medium rounded
          transition-colors
          ${value === o.value
            ? 'bg-zinc-100 text-zinc-900'
            : 'text-zinc-500 hover:text-zinc-900'}
        `}
      >
        {o.label}
      </button>
    ))}
  </div>
);
