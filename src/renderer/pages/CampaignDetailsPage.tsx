import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Ban,
  History,
  Layers,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Sparkles,
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
  WeeksSegment,
} from '../components/ui';
import { ApiError } from '../api/client';
import { adGroupsApi, type AdGroup } from '../api/adGroups';
import { targetsApi, type Target } from '../api/targets';
import { negativesApi, type Negative } from '../api/negatives';
import { KeywordsTable } from '../components/campaigns/KeywordsTable';
import { CampaignPlacements } from '../components/campaigns/CampaignPlacements';
import {
  metricsApi,
  type CampaignAnalyticsItem,
  type CampaignSummary,
} from '../api/metrics';
import { amazonAdsApi } from '../api/amazonAds';
import type { BiddingStrategy } from '../api/campaigns';
import { dateRangeFor, RangeId } from '../lib/dateRange';
import { fmtMoney, fmtNumber, fmtPct } from '../lib/format';
import { useToast } from '../contexts/ToastContext';
import { useInitialFilters, useNav } from '../contexts/NavContext';
import { EditCampaignModal } from '../components/EditCampaignModal';
import { AddAdGroupModal } from '../components/AddAdGroupModal';
import { AddTargetModal } from '../components/AddTargetModal';
import { MultiPeriodMetricsTable } from '../components/campaigns/MultiPeriodMetricsTable';
import { HourlyDynamicsChart } from '../components/campaigns/HourlyDynamicsChart';
import { CampaignSearchTermsEmbed } from '../components/campaigns/CampaignSearchTermsEmbed';
import { CampaignHistoryTab } from '../components/campaigns/CampaignHistoryTab';
import { AIAdvisorPanel } from '../components/campaigns/AIAdvisorPanel';

type TabId = 'ad_groups' | 'targets' | 'search_terms' | 'negatives' | 'history';

// label берётся через t() в render — Ad Groups / Targets / Search Terms /
// Negatives (из nav.items.negatives — т.к. это та же концепция) / History.
const TABS: Array<{ id: TabId; labelStatic?: string; icon: React.ElementType }> = [
  { id: 'ad_groups', labelStatic: 'Ad Groups', icon: Layers },
  { id: 'targets', labelStatic: 'Targets', icon: TargetIcon },
  { id: 'search_terms', labelStatic: 'Search Terms', icon: Search },
  { id: 'negatives', icon: Ban },
  { id: 'history', icon: History },
];

export const CampaignDetailsPage: React.FC = () => {
  const { t } = useTranslation('campaigns');
  const initial = useInitialFilters();
  const { navigate } = useNav();
  const campaignId = initial.campaignId ?? null;
  const initialTab: TabId = (initial.detailsTab as TabId) ?? 'ad_groups';

  const toast = useToast();
  const [tab, setTab] = useState<TabId>(initialTab);
  const [range, setRange] = useState<RangeId>('30d');
  const [campaign, setCampaign] = useState<CampaignAnalyticsItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [stateBusy, setStateBusy] = useState(false);
  const [strategy, setStrategy] = useState<BiddingStrategy | ''>('');
  const [budget, setBudget] = useState<number | null>(null);

  useEffect(() => {
    if (campaign) {
      setStrategy(((campaign as unknown as { bidding_strategy?: BiddingStrategy })
        .bidding_strategy ?? '') as BiddingStrategy | '');
      const b = (campaign as unknown as { budget?: number; daily_budget?: number })
        .daily_budget ??
        (campaign as unknown as { budget?: number }).budget ??
        null;
      setBudget(typeof b === 'number' ? b : null);
    }
  }, [campaign]);

  const isPaused = (campaign?.status ?? '').toLowerCase() === 'paused';

  const onToggleState = async () => {
    if (!campaign) return;
    const next: 'enabled' | 'paused' = isPaused ? 'enabled' : 'paused';
    const prev = campaign.status;
    setStateBusy(true);
    setCampaign({ ...campaign, status: next });
    try {
      await amazonAdsApi.setCampaignState(campaign.campaign_id, next);
      toast.success(t('details.header.stateUpdated'));
    } catch (err) {
      setCampaign({ ...campaign, status: prev });
      toast.error(
        err instanceof ApiError ? err.message : t('details.header.stateUpdateFailed'),
      );
    } finally {
      setStateBusy(false);
    }
  };

  const onSaveBudget = async (next: number) => {
    if (!campaign) return;
    const prev = budget;
    setBudget(next);
    try {
      await amazonAdsApi.setCampaignBudget(campaign.campaign_id, next);
      toast.success(t('details.header.budgetSaved'));
    } catch (err) {
      setBudget(prev);
      toast.error(
        err instanceof ApiError ? err.message : t('details.header.budgetUpdateFailed'),
      );
      throw err;
    }
  };

  const onSaveStrategy = async (next: BiddingStrategy) => {
    if (!campaign || next === strategy) return;
    const prev = strategy;
    setStrategy(next);
    try {
      await amazonAdsApi.setCampaignBiddingStrategy(campaign.campaign_id, next);
      toast.success(t('details.header.strategySaved'));
    } catch (err) {
      setStrategy(prev);
      toast.error(
        err instanceof ApiError ? err.message : t('details.header.strategyUpdateFailed'),
      );
    }
  };

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
          setError(t('details.errors.notFoundForPeriod', { id: campaignId }));
          setCampaign(null);
        } else {
          setCampaign(found);
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t('details.errors.loadFailed'));
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
        <ErrorBanner message={t('details.errors.noId')} />
        <button
          type="button"
          onClick={() => navigate('campaigns')}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-900"
        >
          <ArrowLeft size={12} /> {t('details.backToList')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="campaign-details-page">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <button
          type="button"
          data-testid="breadcrumb-back-to-campaigns"
          onClick={() => navigate('campaigns')}
          className="inline-flex items-center gap-1 hover:text-zinc-900 transition-colors"
        >
          <ArrowLeft size={12} /> {t('details.breadcrumbCampaigns')}
        </button>
        <span className="text-zinc-300">/</span>
        <span className="text-zinc-700">{t('details.breadcrumbDetails')}</span>
      </div>

      <PageHeader
        title={campaign?.campaign_name ?? t('details.fallbackTitle', { id: campaignId })}
        subtitle={
          campaign
            ? `${campaign.book_title} · ${campaign.marketplace} · ${campaign.campaign_type.toUpperCase()} · ${campaign.targeting_type}`
            : t('details.loading')
        }
        rightSlot={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {campaign && (
              <button
                type="button"
                onClick={onToggleState}
                disabled={stateBusy}
                data-testid="campaign-state-toggle"
                title={
                  isPaused
                    ? t('details.header.resumeTitle')
                    : t('details.header.pauseTitle')
                }
                className={`
                  inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border transition-colors disabled:opacity-50
                  ${isPaused
                    ? 'text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
                    : 'text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100'}
                `}
              >
                {isPaused ? <Play size={12} /> : <Pause size={12} />}
                {isPaused ? t('details.header.resume') : t('details.header.pause')}
              </button>
            )}
            {campaign && budget != null && (
              <div
                className="inline-flex items-center gap-1.5 h-8 px-2 rounded-md border border-zinc-200 bg-white text-xs text-zinc-700"
                data-testid="campaign-budget-inline"
              >
                <span className="text-zinc-500">{t('details.header.budgetLabel')}:</span>
                <EditableNumber
                  value={budget}
                  onSave={onSaveBudget}
                  format={(n) => fmtMoney(n, campaign.currency)}
                  min={0.01}
                  step={1}
                  ariaLabel={t('details.header.ariaBudget')}
                />
              </div>
            )}
            {campaign && (
              <select
                value={strategy}
                onChange={(e) => onSaveStrategy(e.target.value as BiddingStrategy)}
                aria-label={t('details.header.ariaStrategy')}
                data-testid="campaign-bidding-strategy"
                className="h-8 px-2 rounded-md border border-zinc-200 bg-white text-xs text-zinc-700"
              >
                <option value="">—</option>
                <option value="Fixed bids">Fixed bids</option>
                <option value="Dynamic bids - down only">Dynamic bids - down only</option>
                <option value="Dynamic bids - up and down">Dynamic bids - up and down</option>
              </select>
            )}
            {campaign && (
              <button
                type="button"
                onClick={() => setAdvisorOpen(true)}
                title={t('details.advisor.buttonTitle')}
                data-testid="ai-advisor-button"
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-violet-700 border border-violet-200 bg-violet-50 hover:bg-violet-100 transition-colors"
              >
                <Sparkles size={12} />
                {t('details.advisor.buttonLabel')}
              </button>
            )}
            {campaign && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors"
              >
                <Pencil size={12} />
                {t('details.edit')}
              </button>
            )}
            <div className="inline-flex items-center gap-1.5">
              <span className="text-[11px] text-zinc-500 uppercase tracking-wide">
                {t('details.header.weeksLabel')}
              </span>
              <WeeksSegment />
            </div>
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

      {/* Multi-period metrics + hourly */}
      {campaign && (
        <>
          <MultiPeriodMetricsTable
            campaignId={campaign.campaign_id}
            currency={campaign.currency}
          />
          <HourlyDynamicsChart
            amazonCampaignId={campaign.amazon_campaign_id}
            currency={campaign.currency}
            from={from}
            to={to}
          />
        </>
      )}

      {/* Tabs */}
      <div role="tablist" className="flex items-center gap-1 border-b border-zinc-200">
        {TABS.map((tabSpec) => {
          const Icon = tabSpec.icon;
          const active = tab === tabSpec.id;
          const label =
            tabSpec.labelStatic ?? t(`details.tabs.${tabSpec.id as 'negatives' | 'history'}`);
          return (
            <button
              key={tabSpec.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={t('details.tabAria', { label })}
              data-testid={`details-tab-${tabSpec.id}`}
              onClick={() => setTab(tabSpec.id)}
              className={`
                inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium
                border-b-2 -mb-px transition-colors
                ${active
                  ? 'border-zinc-900 text-zinc-900'
                  : 'border-transparent text-zinc-500 hover:text-zinc-900'}
              `}
            >
              <Icon size={13} />
              {label}
            </button>
          );
        })}
      </div>

      {tab === 'ad_groups' && <AdGroupsTab campaignId={campaignId} />}
      {tab === 'targets' && (
        <TargetsTab
          campaignId={campaignId}
          campaign={campaign}
          onCampaignReload={loadCampaignMeta}
        />
      )}
      {tab === 'negatives' && <NegativesTab campaignId={campaignId} />}
      {tab === 'search_terms' && (
        <CampaignSearchTermsEmbed
          campaignId={campaignId}
          from={from}
          to={to}
          onOpenFull={() =>
            navigate('search_terms', {
              localCampaignId: campaignId,
              amazonCampaignId: campaign?.amazon_campaign_id,
            })
          }
        />
      )}
      {tab === 'history' && <CampaignHistoryTab campaignId={campaignId} />}

      {editing && campaign && (
        <EditCampaignModal
          campaign={campaign}
          onClose={() => setEditing(false)}
          onSaved={() => loadCampaignMeta()}
        />
      )}

      {advisorOpen && campaign && (
        <AIAdvisorPanel campaign={campaign} onClose={() => setAdvisorOpen(false)} />
      )}
    </div>
  );
};

// ============ Ad Groups tab ============

const AdGroupsTab: React.FC<{ campaignId: number }> = ({ campaignId }) => {
  const { t } = useTranslation('campaigns');
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
        toast.error(err instanceof ApiError ? err.message : t('details.errors.loadAdGroupsFailed'));
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
      toast.error(err instanceof ApiError ? err.message : t('details.errors.updateBidFailed'));
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
        <EmptyState title={t('details.adGroups.empty')} />
      ) : (
        <table className="w-full text-sm table-sticky-head">
          <thead>
            <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
              <th className="text-left px-5 py-2 font-medium">{t('details.adGroups.th.name')}</th>
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
                    ariaLabel={t('details.adGroups.ariaDefaultBid', { name: g.name })}
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

interface TargetsTabProps {
  campaignId: number;
  campaign: CampaignAnalyticsItem | null;
  onCampaignReload(): void;
}

const TargetsTab: React.FC<TargetsTabProps> = ({ campaignId, campaign, onCampaignReload }) => {
  const { t } = useTranslation('campaigns');
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
        toast.error(err instanceof ApiError ? err.message : t('details.errors.loadTargetsFailed'));
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

  // CampaignAnalyticsItem не типизированно содержит placement modifiers,
  // backend кладёт их в тот же объект. Считаем дефолты 0 если отсутствуют.
  const placementInitial = useMemo(() => {
    const c = campaign as unknown as
      | { top_of_search?: number; product_pages?: number; rest_of_search?: number }
      | null;
    return {
      top_of_search: c?.top_of_search ?? 0,
      product_pages: c?.product_pages ?? 0,
      rest_of_search: c?.rest_of_search ?? 0,
    };
  }, [campaign]);

  return (
    <div className="space-y-4">
      <CampaignPlacements
        campaignId={campaignId}
        initial={placementInitial}
        currency={campaign?.currency}
      />
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
        <KeywordsTable
          campaignId={campaignId}
          targets={targets}
          adGroups={adGroups}
          loading={loading}
          onReload={() => {
            void load();
            // Re-pull campaign meta when bulk operation might have changed
            // placement-affecting state (e.g. after add-negative we want
            // updated breakdown). Cheap; happens after explicit user action.
            onCampaignReload();
          }}
        />
        {adding && (
          <AddTargetModal
            adGroups={adGroups}
            onClose={() => setAdding(false)}
            onAdded={() => load()}
          />
        )}
      </Card>
    </div>
  );
};

// ============ Negatives tab ============

const NegativesTab: React.FC<{ campaignId: number }> = ({ campaignId }) => {
  const { t } = useTranslation('campaigns');
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
        toast.error(err instanceof ApiError ? err.message : t('details.errors.loadNegativesFailed'));
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
      toast.success(t('details.removed'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('details.errors.removeFailed'));
    }
  };

  return (
    <Card title="Negative keywords">
      {loading && !list ? (
        <LoadingRow />
      ) : !list || list.length === 0 ? (
        <EmptyState title={t('details.negatives.empty')} />
      ) : (
        <table className="w-full text-sm table-sticky-head">
          <thead>
            <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
              <th className="text-left px-5 py-2 font-medium">Keyword</th>
              <th className="text-left px-3 py-2 font-medium">Match</th>
              <th className="text-left px-3 py-2 font-medium">{t('details.negatives.th.added')}</th>
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
                    title={t('details.negatives.removeTitle')}
                    aria-label={t('details.negatives.removeAria', { keyword: n.keyword_text })}
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

