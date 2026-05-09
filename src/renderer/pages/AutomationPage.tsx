import React, { useEffect, useMemo, useState } from 'react';
import { Check, X, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import {
  automationApi,
  KNOWN_PRIORITIES,
  priorityClasses,
  type Recommendation,
  type RecommendationStatus,
} from '../api/automation';
import {
  Card,
  EmptyState,
  ErrorBanner,
  Kpi,
  LoadingRow,
  PageHeader,
} from '../components/ui';
import { fmtMoney, fmtNumber, fmtPct } from '../lib/format';
import { useToast } from '../contexts/ToastContext';
import { useNav } from '../contexts/NavContext';

const STATUS_IDS: RecommendationStatus[] = ['pending', 'applied', 'dismissed', 'snoozed'];

const usePriorityLabel = () => {
  const { t } = useTranslation('automation');
  return (p: string): string =>
    KNOWN_PRIORITIES.has(p) ? t(`priority.${p}` as 'priority.critical') : p;
};

export const AutomationPage: React.FC = () => {
  const { t } = useTranslation('automation');
  const toast = useToast();
  const { navigate } = useNav();
  const [tab, setTab] = useState<RecommendationStatus>('pending');
  const [items, setItems] = useState<Recommendation[] | null>(null);
  const [stats, setStats] = useState<{
    pending: number;
    applied: number;
    dismissed: number;
    snoozed: number;
    total: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);

  const load = useMemo(
    () => async () => {
      setLoading(true);
      setUnsupported(false);
      try {
        const res = await automationApi.list({ status: tab, limit: 100 });
        setItems(Array.isArray(res.items) ? res.items : []);
        if (res.stats) {
          setStats({
            pending: res.stats.pending ?? 0,
            applied: res.stats.applied ?? 0,
            dismissed: res.stats.dismissed ?? 0,
            snoozed: res.stats.snoozed ?? 0,
            total: res.stats.total ?? 0,
          });
        }
      } catch (err) {
        if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
          setUnsupported(true);
          setItems([]);
          return;
        }
        toast.error(err instanceof ApiError ? err.message : t('errors.load'));
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [tab, toast, t],
  );

  useEffect(() => {
    load();
  }, [load]);

  const handleApply = async (rec: Recommendation) => {
    try {
      await automationApi.apply(rec.id);
      toast.success(t('applied'));
      setItems((prev) => prev?.filter((r) => r.id !== rec.id) ?? prev);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('errors.applyFailed'));
    }
  };

  const handleDismiss = async (rec: Recommendation) => {
    const reason = prompt(t('dismissPrompt'), t('dismissDefault'));
    if (reason == null) return;
    try {
      await automationApi.dismiss(rec.id, reason);
      toast.success(t('dismissed'));
      setItems((prev) => prev?.filter((r) => r.id !== rec.id) ?? prev);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('errors.dismissFailed'));
    }
  };

  return (
    <div className="space-y-6" data-testid="automation-page">
      <PageHeader
        title={t('title')}
        subtitle={
          unsupported
            ? t('subtitle.unsupported')
            : items != null
            ? t('subtitle.recCount', { count: items.length })
            : t('loading')
        }
      />

      {unsupported && <ErrorBanner message={t('errors.unsupportedBanner')} />}

      {!unsupported && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <Kpi label={t('kpi.pending')} value={fmtNumber(stats?.pending)} loading={loading && !stats} />
            <Kpi label={t('kpi.applied')} value={fmtNumber(stats?.applied)} loading={loading && !stats} />
            <Kpi label={t('kpi.dismissed')} value={fmtNumber(stats?.dismissed)} loading={loading && !stats} />
            <Kpi label={t('kpi.snoozed')} value={fmtNumber(stats?.snoozed)} loading={loading && !stats} />
          </div>

          <div role="tablist" className="flex items-center gap-1 border-b border-zinc-200">
            {STATUS_IDS.map((id) => {
              const label = t(`tabs.${id}` as 'tabs.pending');
              return (
                <button
                  key={id}
                  role="tab"
                  data-testid={`automation-tab-${id}`}
                  aria-selected={tab === id}
                  aria-label={t('tabs.ariaLabel', { label })}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`
                    h-9 px-3 text-xs font-medium border-b-2 -mb-px transition-colors
                    ${tab === id
                      ? 'border-zinc-900 text-zinc-900'
                      : 'border-transparent text-zinc-500 hover:text-zinc-900'}
                  `}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <Card title={t('card.title')}>
            {loading && !items ? (
              <LoadingRow />
            ) : !items || items.length === 0 ? (
              <EmptyState
                title={
                  tab === 'pending'
                    ? t('empty.pending')
                    : t('empty.other', { status: tab })
                }
                hint={
                  tab === 'pending' ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Zap size={11} />
                      {t('empty.hint')}
                    </span>
                  ) : undefined
                }
              />
            ) : (
              <ul className="divide-y divide-zinc-100">
                {items.map((rec) => (
                  <RecommendationRow
                    key={rec.id}
                    rec={rec}
                    showActions={tab === 'pending'}
                    onApply={() => handleApply(rec)}
                    onDismiss={() => handleDismiss(rec)}
                    onCampaign={(id) => navigate('campaign_details', { campaignId: id })}
                  />
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
};

const RecommendationRow: React.FC<{
  rec: Recommendation;
  showActions: boolean;
  onApply(): void;
  onDismiss(): void;
  onCampaign(id: number): void;
}> = ({ rec, showActions, onApply, onDismiss, onCampaign }) => {
  const { t } = useTranslation('automation');
  const priorityLabel = usePriorityLabel();
  const ms = rec.metricsSnapshot ?? {};
  return (
    <li className="px-5 py-3 hover:bg-zinc-50/40 transition-colors">
      <div className="flex items-start gap-3">
        <span
          className={`
            flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase
            border ${priorityClasses(rec.priority)}
          `}
        >
          {priorityLabel(rec.priority)}
        </span>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-semibold text-zinc-900">{rec.ruleName}</span>
            {rec.entityName && (
              <span className="text-[11px] text-zinc-500">
                · {rec.entityType}{' '}
                <span className="text-zinc-700 font-medium">«{rec.entityName}»</span>
              </span>
            )}
            <span className="ml-auto text-[10px] text-zinc-400">
              {(rec.createdAt || '').slice(0, 10)}
            </span>
          </div>

          <div className="text-xs text-zinc-700">{rec.actionDescription}</div>

          {rec.reason && (
            <div className="text-[11px] text-zinc-500 italic">{rec.reason}</div>
          )}

          <div className="flex flex-wrap gap-3 text-[10px] tabular-nums text-zinc-500">
            {ms.impressions != null && <span>Impr: {fmtNumber(ms.impressions)}</span>}
            {ms.clicks != null && <span>Clicks: {fmtNumber(ms.clicks)}</span>}
            {ms.spend != null && <span>Spend: {fmtMoney(ms.spend)}</span>}
            {ms.sales != null && <span>Sales: {fmtMoney(ms.sales)}</span>}
            {ms.acos != null && ms.acos > 0 && <span>ACOS: {fmtPct(ms.acos)}</span>}
          </div>

          <div className="flex items-center gap-2 mt-2">
            {rec.campaignId != null && (
              <button
                type="button"
                onClick={() => onCampaign(rec.campaignId as number)}
                className="text-[11px] text-zinc-500 hover:text-zinc-900 hover:underline"
              >
                {rec.campaignName ?? t('row.fallbackCampaign', { id: rec.campaignId })} →
              </button>
            )}
            {showActions && (
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onDismiss}
                  className="
                    inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-medium
                    text-zinc-600 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors
                  "
                >
                  <X size={11} />
                  {t('row.dismiss')}
                </button>
                <button
                  type="button"
                  onClick={onApply}
                  className="
                    inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-medium
                    text-white bg-zinc-900 hover:bg-zinc-800 transition-colors
                  "
                >
                  <Check size={11} />
                  {t('row.apply')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </li>
  );
};
