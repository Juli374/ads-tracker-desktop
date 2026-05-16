import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, BellOff, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import { metricsApi, type AlertItem } from '../api/metrics';
import {
  ActiveFiltersBar,
  Card,
  EmptyState,
  ErrorBanner,
  Kpi,
  LoadingRow,
  PageHeader,
  RangePicker,
} from '../components/ui';
import { dateRangeFor, RangeId } from '../lib/dateRange';
import { fmtNumber } from '../lib/format';
import { useToast } from '../contexts/ToastContext';
import { useNav } from '../contexts/NavContext';
import {
  useGlobalFilters,
  useGlobalFilterChips,
} from '../contexts/GlobalFiltersContext';
import { useBooks } from '../contexts/BooksContext';

type Severity = 'critical' | 'warning' | 'info';

const SEVERITY_ORDER: Severity[] = ['critical', 'warning', 'info'];

const normalizeSeverity = (s: string | undefined): Severity => {
  const v = (s || '').toLowerCase();
  if (v === 'critical' || v === 'error') return 'critical';
  if (v === 'warning' || v === 'warn') return 'warning';
  return 'info';
};

const severityIcon = (sev: Severity, size = 14) => {
  if (sev === 'critical')
    return <AlertCircle size={size} className="text-red-600 flex-shrink-0" />;
  if (sev === 'warning')
    return <AlertTriangle size={size} className="text-amber-500 flex-shrink-0" />;
  return <Info size={size} className="text-sky-500 flex-shrink-0" />;
};

const severityBadgeClass: Record<Severity, string> = {
  critical: 'bg-red-50 text-red-700 border-red-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  info: 'bg-sky-50 text-sky-700 border-sky-200',
};

export const AlertsPage: React.FC = () => {
  const { t } = useTranslation('alerts');
  const toast = useToast();
  const { navigate } = useNav();
  const { filters: globalFilters } = useGlobalFilters();
  const { list: booksList } = useBooks();
  const chips = useGlobalFilterChips(booksList);
  const [alerts, setAlerts] = useState<AlertItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);
  const [range, setRange] = useState<RangeId>('30d');
  const [filterSev, setFilterSev] = useState<Severity | 'all'>('all');

  const { from, to } = useMemo(() => dateRangeFor(range), [range]);

  const load = useMemo(
    () => async () => {
      setLoading(true);
      setUnsupported(false);
      try {
        const res = await metricsApi.alerts({
          from,
          to,
          marketplaces: globalFilters.marketplaces.length
            ? globalFilters.marketplaces
            : undefined,
          bookIds: globalFilters.bookId != null ? [globalFilters.bookId] : undefined,
          accounts: globalFilters.accounts.length ? globalFilters.accounts : undefined,
        });
        setAlerts(Array.isArray(res?.alerts) ? res.alerts : []);
      } catch (err) {
        if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
          setUnsupported(true);
          setAlerts([]);
          return;
        }
        toast.error(err instanceof ApiError ? err.message : t('errors.load'));
        setAlerts([]);
      } finally {
        setLoading(false);
      }
    },
    [from, to, globalFilters.marketplaces, globalFilters.bookId, globalFilters.accounts, toast],
  );

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const map: Record<Severity, AlertItem[]> = { critical: [], warning: [], info: [] };
    if (!alerts) return map;
    for (const a of alerts) {
      const sev = normalizeSeverity(a.severity);
      if (filterSev !== 'all' && filterSev !== sev) continue;
      map[sev].push(a);
    }
    return map;
  }, [alerts, filterSev]);

  const counts = useMemo(() => {
    const c: Record<Severity, number> = { critical: 0, warning: 0, info: 0 };
    alerts?.forEach((a) => {
      const sev = normalizeSeverity(a.severity);
      c[sev] += 1;
    });
    return c;
  }, [alerts]);

  return (
    <div className="space-y-6" data-testid="alerts-page">
      <PageHeader
        title={t('title')}
        subtitle={
          unsupported
            ? t('subtitle.unsupported')
            : alerts != null
            ? t('subtitle.activeCount', { count: alerts.length })
            : t('loading')
        }
        rightSlot={
          <RangePicker
            value={range}
            onChange={setRange}
            onRefresh={() => load()}
            refreshing={loading}
            autoRefresh={{ storageKey: 'auto-refresh-alerts' }}
          />
        }
      />

      <ActiveFiltersBar chips={chips} />

      {unsupported && <ErrorBanner message={t('errors.unsupportedBanner')} />}

      {!unsupported && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Kpi
              label={t('severity.critical')}
              value={fmtNumber(counts.critical)}
              loading={loading && !alerts}
              tone={counts.critical > 0 ? 'negative' : 'default'}
            />
            <Kpi
              label={t('severity.warning')}
              value={fmtNumber(counts.warning)}
              loading={loading && !alerts}
            />
            <Kpi
              label={t('severity.info')}
              value={fmtNumber(counts.info)}
              loading={loading && !alerts}
            />
          </div>

          <div role="tablist" className="flex items-center gap-1 border-b border-zinc-200">
            {(['all', ...SEVERITY_ORDER] as const).map((s) => {
              const label = s === 'all' ? t('filter.all') : t(`severity.${s}` as 'severity.critical');
              return (
                <button
                  key={s}
                  role="tab"
                  data-testid={`alerts-filter-${s}`}
                  aria-selected={filterSev === s}
                  aria-label={t('filter.aria', { label })}
                  type="button"
                  onClick={() => setFilterSev(s)}
                  className={`
                    h-9 px-3 text-xs font-medium border-b-2 -mb-px transition-colors
                    ${filterSev === s
                      ? 'border-zinc-900 text-zinc-900'
                      : 'border-transparent text-zinc-500 hover:text-zinc-900'}
                  `}
                >
                  {label}
                  {s !== 'all' && counts[s] > 0 && (
                    <span className="ml-1.5 text-[10px] text-zinc-400 tabular-nums">
                      {counts[s]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {loading && !alerts ? (
            <Card title={t('card.title')}>
              <LoadingRow />
            </Card>
          ) : alerts && alerts.length === 0 ? (
            <Card title={t('card.title')}>
              <EmptyState
                title={t('empty.title')}
                hint={
                  <span className="inline-flex items-center gap-1.5">
                    <BellOff size={11} />
                    {t('empty.hint')}
                  </span>
                }
              />
            </Card>
          ) : (
            SEVERITY_ORDER.map((sev) => {
              const list = grouped[sev];
              if (list.length === 0) return null;
              return (
                <Card
                  key={sev}
                  title={
                    <span className="flex items-center gap-2">
                      {severityIcon(sev, 13)}
                      {t(`severity.${sev}` as 'severity.critical')}
                      <span className="text-zinc-400 text-xs font-normal">{list.length}</span>
                    </span>
                  }
                >
                  <ul className="divide-y divide-zinc-100">
                    {list.map((a) => (
                      <AlertRow key={a.id} a={a} sev={sev} onNav={navigate} />
                    ))}
                  </ul>
                </Card>
              );
            })
          )}
        </>
      )}
    </div>
  );
};

const AlertRow: React.FC<{
  a: AlertItem;
  sev: Severity;
  onNav: ReturnType<typeof useNav>['navigate'];
}> = ({ a, sev, onNav }) => {
  const { t } = useTranslation('alerts');
  const time = (a.created_at || '').slice(0, 16).replace('T', ' ');
  return (
    <li className="px-5 py-3 hover:bg-zinc-50/40 transition-colors">
      <div className="flex items-start gap-3">
        {severityIcon(sev)}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-semibold text-zinc-900">{a.title}</span>
            <span
              className={`
                px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase
                border ${severityBadgeClass[sev]}
              `}
            >
              {sev}
            </span>
            {time && <span className="ml-auto text-[10px] text-zinc-400">{time}</span>}
          </div>
          {a.message && (
            <div className="text-[11px] text-zinc-600 mt-1">{a.message}</div>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            {a.campaign_id != null && (
              <button
                type="button"
                onClick={() => onNav('campaign_details', { campaignId: a.campaign_id as number })}
                className="text-[11px] text-zinc-500 hover:text-zinc-900 hover:underline"
              >
                {t('row.toCampaign')}
              </button>
            )}
            {a.book_id != null && a.campaign_id == null && (
              <button
                type="button"
                onClick={() => onNav('books')}
                className="text-[11px] text-zinc-500 hover:text-zinc-900 hover:underline"
              >
                {t('row.toBooks')}
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
};
