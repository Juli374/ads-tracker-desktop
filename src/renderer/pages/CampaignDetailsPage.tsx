import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  History,
  Layers,
  Pencil,
  Plus,
  Search,
  Target as TargetIcon,
} from 'lucide-react';
import {
  Card,
  EmptyState,
  EditableNumber,
  ErrorBanner,
  Kpi,
  LoadingRow,
  PageHeader,
  RangePicker,
} from '../components/ui';
import { ApiError } from '../api/client';
import { adGroupsApi, type AdGroup } from '../api/adGroups';
import { targetsApi, type Target } from '../api/targets';
import { negativesApi, type Negative } from '../api/negatives';
import {
  metricsApi,
  type CampaignAnalyticsItem,
  type CampaignSummary,
} from '../api/metrics';
import { dateRangeFor, RangeId } from '../lib/dateRange';
import { fmtMoney, fmtNumber, fmtPct } from '../lib/format';
import { useToast } from '../contexts/ToastContext';
import { useInitialFilters, useNav } from '../contexts/NavContext';
import { EditCampaignModal } from '../components/EditCampaignModal';
import { AddAdGroupModal } from '../components/AddAdGroupModal';
import { AddTargetModal } from '../components/AddTargetModal';

type TabId = 'ad_groups' | 'targets' | 'search_terms' | 'negatives' | 'history';

const TABS: Array<{ id: TabId; label: string; icon: React.ElementType }> = [
  { id: 'ad_groups', label: 'Ad Groups', icon: Layers },
  { id: 'targets', label: 'Targets', icon: TargetIcon },
  { id: 'search_terms', label: 'Search Terms', icon: Search },
  { id: 'negatives', label: 'Минус-слова', icon: Ban },
  { id: 'history', label: 'История', icon: History },
];

export const CampaignDetailsPage: React.FC = () => {
  const initial = useInitialFilters();
  const { navigate } = useNav();
  const campaignId = initial.campaignId ?? null;
  const initialTab: TabId = (initial.detailsTab as TabId) ?? 'ad_groups';

  const [tab, setTab] = useState<TabId>(initialTab);
  const [range, setRange] = useState<RangeId>('30d');
  const [campaign, setCampaign] = useState<CampaignAnalyticsItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const { from, to } = useMemo(() => dateRangeFor(range), [range]);

  // Грузим summary by-campaign + фильтруем до нашего id, чтобы получить
  // полные analytics-метрики (имя, MP, KPI), консистентные с CampaignsPage.
  const loadCampaignMeta = useMemo(
    () => async () => {
      if (campaignId == null) return;
      setLoading(true);
      setError(null);
      try {
        const data: CampaignSummary = await metricsApi.summaryByCampaign({
          from,
          to,
          attribution: '7d',
        });
        const found = data.campaigns.find((c) => c.campaign_id === campaignId);
        if (!found) {
          setError(`Кампания #${campaignId} не найдена за выбранный период.`);
          setCampaign(null);
        } else {
          setCampaign(found);
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Не удалось загрузить кампанию');
      } finally {
        setLoading(false);
      }
    },
    [campaignId, from, to],
  );

  useEffect(() => {
    loadCampaignMeta();
  }, [loadCampaignMeta]);

  if (campaignId == null) {
    return (
      <div className="space-y-4">
        <ErrorBanner message="Не передан id кампании. Открой кампанию из списка." />
        <button
          type="button"
          onClick={() => navigate('campaigns')}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-900"
        >
          <ArrowLeft size={12} /> К списку кампаний
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <button
          type="button"
          onClick={() => navigate('campaigns')}
          className="inline-flex items-center gap-1 hover:text-zinc-900 transition-colors"
        >
          <ArrowLeft size={12} /> Кампании
        </button>
        <span className="text-zinc-300">/</span>
        <span className="text-zinc-700">детали</span>
      </div>

      <PageHeader
        title={campaign?.campaign_name ?? `Кампания #${campaignId}`}
        subtitle={
          campaign
            ? `${campaign.book_title} · ${campaign.marketplace} · ${campaign.campaign_type.toUpperCase()} · ${campaign.targeting_type}`
            : 'Загрузка…'
        }
        rightSlot={
          <div className="flex items-center gap-2">
            {campaign && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors"
              >
                <Pencil size={12} />
                Редактировать
              </button>
            )}
            <RangePicker
              value={range}
              onChange={setRange}
              onRefresh={() => loadCampaignMeta()}
              refreshing={loading}
              autoRefresh={{ storageKey: 'auto-refresh-campaign-details' }}
            />
          </div>
        }
      />

      {error && <ErrorBanner message={error} />}

      {/* KPI */}
      <div className="grid grid-cols-5 gap-3">
        <Kpi label="Spend" value={fmtMoney(campaign?.cost, campaign?.currency)} loading={loading} />
        <Kpi label="Sales" value={fmtMoney(campaign?.sales, campaign?.currency)} loading={loading} />
        <Kpi label="Orders" value={fmtNumber(campaign?.orders)} loading={loading} />
        <Kpi
          label="ACOS"
          value={campaign && campaign.acos > 0 ? fmtPct(campaign.acos) : '—'}
          loading={loading}
          tone={campaign && campaign.acos > 100 ? 'negative' : 'default'}
        />
        <Kpi label="CTR" value={campaign && campaign.ctr > 0 ? fmtPct(campaign.ctr, 2) : '—'} loading={loading} />
      </div>

      {/* Tabs */}
      <div role="tablist" className="flex items-center gap-1 border-b border-zinc-200">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={`Таб: ${t.label}`}
              onClick={() => setTab(t.id)}
              className={`
                inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium
                border-b-2 -mb-px transition-colors
                ${active
                  ? 'border-zinc-900 text-zinc-900'
                  : 'border-transparent text-zinc-500 hover:text-zinc-900'}
              `}
            >
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'ad_groups' && <AdGroupsTab campaignId={campaignId} />}
      {tab === 'targets' && <TargetsTab campaignId={campaignId} />}
      {tab === 'negatives' && <NegativesTab campaignId={campaignId} />}
      {tab === 'search_terms' && (
        <SearchTermsTabPlaceholder
          onOpen={() =>
            navigate('search_terms', {
              localCampaignId: campaignId,
              amazonCampaignId: campaign?.amazon_campaign_id,
            })
          }
        />
      )}
      {tab === 'history' && <HistoryTabPlaceholder />}

      {editing && campaign && (
        <EditCampaignModal
          campaign={campaign}
          onClose={() => setEditing(false)}
          onSaved={() => loadCampaignMeta()}
        />
      )}
    </div>
  );
};

// ============ Ad Groups tab ============

const AdGroupsTab: React.FC<{ campaignId: number }> = ({ campaignId }) => {
  const toast = useToast();
  const [list, setList] = useState<AdGroup[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = useMemo(
    () => async () => {
      setLoading(true);
      try {
        const data = await adGroupsApi.listByCampaign(campaignId);
        setList(Array.isArray(data) ? data : []);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Не удалось загрузить ad groups');
        setList([]);
      } finally {
        setLoading(false);
      }
    },
    [campaignId, toast],
  );

  useEffect(() => {
    load();
  }, [load]);

  const onSaveBid = async (id: number, next: number) => {
    try {
      await adGroupsApi.update(id, { default_bid: next });
      setList((prev) =>
        prev ? prev.map((g) => (g.id === id ? { ...g, default_bid: next } : g)) : prev,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Не удалось обновить bid');
      throw err;
    }
  };

  return (
    <Card
      title="Ad Groups"
      rightSlot={
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 transition-colors"
        >
          <Plus size={12} />
          Ad Group
        </button>
      }
    >
      {loading && !list ? (
        <LoadingRow />
      ) : !list || list.length === 0 ? (
        <EmptyState title="У кампании нет ad groups." />
      ) : (
        <table className="w-full text-sm table-sticky-head">
          <thead>
            <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
              <th className="text-left px-5 py-2 font-medium">Имя</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-right px-3 py-2 font-medium">Default bid</th>
              <th className="text-right px-3 py-2 font-medium">Targets</th>
              <th className="px-5 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((g) => (
              <tr key={g.id} className="border-t border-zinc-100 hover:bg-zinc-50/60">
                <td className="px-5 py-2.5 text-xs text-zinc-900">{g.name}</td>
                <td className="px-3 py-2.5 text-[11px] text-zinc-600">{g.state ?? '—'}</td>
                <td className="px-3 py-2.5 text-xs text-right">
                  <EditableNumber
                    value={g.default_bid}
                    onSave={(v) => onSaveBid(g.id, v)}
                    format={(n) => fmtMoney(n)}
                    min={0.02}
                    step={0.01}
                    ariaLabel={`Default bid для ${g.name}`}
                  />
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-700 text-right tabular-nums">
                  {fmtNumber((g as AdGroup & { targets_count?: number }).targets_count ?? 0)}
                </td>
                <td className="px-5 py-2.5"></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {adding && (
        <AddAdGroupModal
          campaignId={campaignId}
          onClose={() => setAdding(false)}
          onCreated={() => load()}
        />
      )}
    </Card>
  );
};

// ============ Targets tab ============

const TargetsTab: React.FC<{ campaignId: number }> = ({ campaignId }) => {
  const toast = useToast();
  const [adGroups, setAdGroups] = useState<AdGroup[]>([]);
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = useMemo(
    () => async () => {
      setLoading(true);
      try {
        const [ags, ts] = await Promise.all([
          adGroupsApi.listByCampaign(campaignId),
          targetsApi.listByCampaign(campaignId),
        ]);
        setAdGroups(Array.isArray(ags) ? ags : []);
        setTargets(Array.isArray(ts) ? ts : []);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Не удалось загрузить targets');
        setTargets([]);
      } finally {
        setLoading(false);
      }
    },
    [campaignId, toast],
  );

  useEffect(() => {
    load();
  }, [load]);

  const onSaveBid = async (id: number, next: number) => {
    try {
      await targetsApi.update(id, { bid: next });
      setTargets((prev) =>
        prev ? prev.map((t) => (t.id === id ? { ...t, bid: next } : t)) : prev,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Не удалось обновить bid');
      throw err;
    }
  };

  return (
    <Card
      title="Targets"
      rightSlot={
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={adGroups.length === 0}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus size={12} />
          Targets
        </button>
      }
    >
      {loading && !targets ? (
        <LoadingRow />
      ) : !targets || targets.length === 0 ? (
        <EmptyState title="У кампании нет targets." />
      ) : (
        <table className="w-full text-sm table-sticky-head">
          <thead>
            <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
              <th className="text-left px-5 py-2 font-medium">Target</th>
              <th className="text-left px-3 py-2 font-medium">Тип</th>
              <th className="text-left px-3 py-2 font-medium">Match</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-right px-5 py-2 font-medium">Bid</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => (
              <tr key={t.id} className="border-t border-zinc-100 hover:bg-zinc-50/60">
                <td className="px-5 py-2.5 text-xs text-zinc-900 font-mono truncate max-w-md">
                  {t.keyword_text ?? t.asin ?? t.category ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-[11px] text-zinc-600 uppercase">
                  {t.keyword_text ? 'keyword' : t.asin ? 'asin' : t.category ? 'category' : '—'}
                </td>
                <td className="px-3 py-2.5 text-[11px] text-zinc-600">{t.match_type ?? '—'}</td>
                <td className="px-3 py-2.5 text-[11px] text-zinc-600">{t.state ?? '—'}</td>
                <td className="px-5 py-2.5 text-xs text-right">
                  <EditableNumber
                    value={t.bid}
                    onSave={(v) => onSaveBid(t.id, v)}
                    format={(n) => fmtMoney(n)}
                    min={0.02}
                    step={0.01}
                    ariaLabel="Bid"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {adding && (
        <AddTargetModal
          adGroups={adGroups}
          onClose={() => setAdding(false)}
          onAdded={() => load()}
        />
      )}
    </Card>
  );
};

// ============ Negatives tab ============

const NegativesTab: React.FC<{ campaignId: number }> = ({ campaignId }) => {
  const toast = useToast();
  const [list, setList] = useState<Negative[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useMemo(
    () => async () => {
      setLoading(true);
      try {
        const data = await negativesApi.listByCampaign(campaignId);
        setList(Array.isArray(data) ? data : []);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Не удалось загрузить негативы');
        setList([]);
      } finally {
        setLoading(false);
      }
    },
    [campaignId, toast],
  );

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (n: Negative) => {
    try {
      await negativesApi.delete(n.id);
      setList((prev) => (prev ? prev.filter((x) => x.id !== n.id) : prev));
      toast.success('Удалено');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Не удалось удалить');
    }
  };

  return (
    <Card title="Negative keywords">
      {loading && !list ? (
        <LoadingRow />
      ) : !list || list.length === 0 ? (
        <EmptyState title="У этой кампании нет negative keywords." />
      ) : (
        <table className="w-full text-sm table-sticky-head">
          <thead>
            <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
              <th className="text-left px-5 py-2 font-medium">Keyword</th>
              <th className="text-left px-3 py-2 font-medium">Match</th>
              <th className="text-left px-3 py-2 font-medium">Добавлено</th>
              <th className="px-5 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((n) => (
              <tr
                key={n.id}
                className="group border-t border-zinc-100 hover:bg-zinc-50/60"
              >
                <td className="px-5 py-2.5 text-xs text-zinc-900">{n.keyword_text}</td>
                <td className="px-3 py-2.5 text-xs text-zinc-600">{n.match_type}</td>
                <td className="px-3 py-2.5 text-[11px] text-zinc-500">
                  {(n.date_added ?? n.created_at ?? '').slice(0, 10) || '—'}
                </td>
                <td className="px-5 py-2.5 text-right">
                  <button
                    onClick={() => handleDelete(n)}
                    className="
                      h-6 w-6 flex items-center justify-center rounded
                      text-zinc-400 hover:text-red-600 hover:bg-red-50
                      opacity-0 group-hover:opacity-100 transition-opacity
                    "
                    title="Удалить"
                    aria-label={`Удалить ${n.keyword_text}`}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
};

// ============ Search Terms tab placeholder ============

const SearchTermsTabPlaceholder: React.FC<{ onOpen: () => void }> = ({ onOpen }) => (
  <Card title="Search Terms">
    <div className="px-5 py-8 text-center space-y-3">
      <div className="text-sm text-zinc-500">
        Откройте полную страницу поисковых запросов с фильтром по этой кампании.
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 transition-colors"
      >
        Открыть Search Terms →
      </button>
    </div>
  </Card>
);

// ============ History tab placeholder ============

const HistoryTabPlaceholder: React.FC = () => (
  <Card title="История">
    <div className="px-5 py-8 text-center">
      <div className="text-sm text-zinc-500">
        Лента изменений будет доступна после реализации Action Center (Фаза 5).
      </div>
    </div>
  </Card>
);
