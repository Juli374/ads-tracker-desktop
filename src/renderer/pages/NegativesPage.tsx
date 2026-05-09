import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, X, Ban } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import { metricsApi, CampaignSummary } from '../api/metrics';
import {
  negativesApi,
  Negative,
  NegativeMatchType,
} from '../api/negatives';
import {
  PageHeader,
  Card,
  EmptyState,
  LoadingRow,
} from '../components/ui';
import { NegativeListsTab } from '../components/NegativeListsTab';
import { dateRangeFor } from '../lib/dateRange';
import { useToast } from '../contexts/ToastContext';
import { useGlobalFilters } from '../contexts/GlobalFiltersContext';

type Tab = 'campaigns' | 'lists';

export const NegativesPage: React.FC = () => {
  const { t } = useTranslation('negatives');
  const toast = useToast();
  const { filters: globalFilters } = useGlobalFilters();
  const [tab, setTab] = useState<Tab>('campaigns');
  const [campaigns, setCampaigns] = useState<CampaignSummary | null>(null);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [campaignId, setCampaignId] = useState<number | null>(null);

  const [negatives, setNegatives] = useState<Negative[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  const [keyword, setKeyword] = useState('');
  const [matchType, setMatchType] = useState<NegativeMatchType>('Exact');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCampaignsLoading(true);
      const { from, to } = dateRangeFor('30d');
      try {
        const data = await metricsApi.summaryByCampaign({
          from,
          to,
          attribution: '7d',
          marketplaces: globalFilters.marketplaces.length
            ? globalFilters.marketplaces
            : undefined,
          bookIds:
            globalFilters.bookId != null ? [globalFilters.bookId] : undefined,
          accounts: globalFilters.accounts.length
            ? globalFilters.accounts
            : undefined,
        });
        if (cancelled) return;
        setCampaigns(data);
        if (data.campaigns.length > 0 && campaignId == null) {
          setCampaignId(data.campaigns[0].campaign_id);
        }
      } catch (err) {
        if (cancelled) return;
        toast.error(
          err instanceof ApiError ? err.message : t('errors.loadCampaigns'),
        );
      } finally {
        if (!cancelled) setCampaignsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line
  }, [globalFilters.marketplaces, globalFilters.bookId, globalFilters.accounts]);

  const loadNegatives = useMemo(
    () => async () => {
      if (campaignId == null) return;
      setLoading(true);
      try {
        const data = await negativesApi.listByCampaign(campaignId);
        setNegatives(Array.isArray(data) ? data : []);
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : t('errors.loadNegatives'),
        );
      } finally {
        setLoading(false);
      }
    },
    [campaignId, toast, t],
  );

  useEffect(() => {
    loadNegatives();
  }, [loadNegatives]);

  const selectedCampaign = useMemo(
    () => campaigns?.campaigns.find((c) => c.campaign_id === campaignId) ?? null,
    [campaigns, campaignId],
  );

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (campaignId == null) return;
    const list = Array.from(
      new Set(
        keyword
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    );
    if (list.length === 0) return;
    setAdding(true);
    try {
      if (list.length === 1) {
        await negativesApi.add(campaignId, list[0], matchType);
      } else {
        await negativesApi.addBulkToCampaign(campaignId, list, matchType);
      }
      toast.success(
        list.length === 1 ? t('add.addedOne') : t('add.addedMany', { count: list.length }),
      );
      setKeyword('');
      await loadNegatives();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('errors.addFailed'));
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (n: Negative) => {
    try {
      await negativesApi.delete(n.id);
      setNegatives((prev) => prev.filter((x) => x.id !== n.id));
      toast.success(t('list.deleted'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('errors.deleteFailed'));
    }
  };

  return (
    <div className="space-y-6" data-testid="negatives-page">
      <PageHeader
        title={t('title')}
        subtitle={
          tab === 'campaigns'
            ? selectedCampaign
              ? t('subtitle.campaign', {
                  name: selectedCampaign.campaign_name,
                  marketplace: selectedCampaign.marketplace,
                })
              : t('subtitle.campaignDefault')
            : t('subtitle.lists')
        }
      />

      <div role="tablist" className="flex items-center gap-1 border-b border-zinc-200">
        {(['campaigns', 'lists'] as const).map((tabId) => (
          <button
            key={tabId}
            type="button"
            role="tab"
            data-testid={`negatives-tab-${tabId}`}
            aria-selected={tab === tabId}
            aria-label={tabId === 'campaigns' ? t('tabs.ariaCampaigns') : t('tabs.ariaLists')}
            onClick={() => setTab(tabId)}
            className={`
              h-9 px-3 text-xs font-medium border-b-2 -mb-px transition-colors
              ${tab === tabId
                ? 'border-zinc-900 text-zinc-900'
                : 'border-transparent text-zinc-500 hover:text-zinc-900'}
            `}
          >
            {tabId === 'campaigns' ? t('tabs.campaigns') : t('tabs.lists')}
          </button>
        ))}
      </div>

      {tab === 'lists' && <NegativeListsTab />}

      {tab === 'campaigns' && (
        <>
          <Card title={t('campaign.cardTitle')}>
            {campaignsLoading ? (
              <LoadingRow />
            ) : !campaigns || campaigns.campaigns.length === 0 ? (
              <EmptyState
                title={t('campaign.empty')}
                hint={t('campaign.emptyHint')}
              />
            ) : (
              <div className="px-5 py-3">
                <select
                  value={campaignId ?? ''}
                  onChange={(e) => setCampaignId(Number(e.target.value))}
                  className="
                    w-full h-9 px-3 text-sm rounded-md
                    border border-zinc-200 bg-white
                    text-zinc-900
                    focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
                    cursor-pointer
                  "
                >
                  {campaigns.campaigns.map((c) => (
                    <option key={c.campaign_id} value={c.campaign_id}>
                      {c.campaign_name} · {c.marketplace} · {c.campaign_type.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </Card>

          {selectedCampaign && (
            <Card title={t('add.cardTitle')}>
              <form onSubmit={handleAdd} className="px-5 py-3 space-y-3">
                <textarea
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder={t('add.placeholder')}
                  disabled={adding}
                  rows={3}
                  className="
                    w-full px-3 py-2 text-sm rounded-md
                    border border-zinc-200 bg-white
                    text-zinc-900 placeholder:text-zinc-400
                    focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
                    disabled:opacity-50 font-mono resize-y min-h-[80px]
                  "
                />
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex bg-white border border-zinc-200 rounded-md p-0.5">
                    {(['Exact', 'Phrase'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMatchType(m)}
                        disabled={adding}
                        className={`
                          px-3 h-7 text-xs font-medium rounded transition-colors
                          ${matchType === m
                            ? 'bg-zinc-900 text-white'
                            : 'text-zinc-600 hover:text-zinc-900'}
                        `}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <button
                    type="submit"
                    disabled={adding || !keyword.trim()}
                    className="
                      inline-flex items-center gap-1.5 h-8 px-3 rounded-md
                      bg-zinc-900 text-white text-xs font-medium
                      hover:bg-zinc-800 transition-colors
                      disabled:opacity-50 disabled:cursor-not-allowed
                    "
                  >
                    {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                    {t('add.submit')}
                  </button>
                </div>
              </form>
            </Card>
          )}

          {selectedCampaign && (
            <Card
              title={
                <div className="flex items-center gap-2">
                  <Ban size={14} className="text-zinc-400" />
                  {t('list.cardTitle')}
                </div>
              }
              rightSlot={
                <div className="text-xs text-zinc-500">
                  {loading ? '' : t('list.totalCount', { count: negatives.length })}
                </div>
              }
            >
              {loading ? (
                <LoadingRow />
              ) : negatives.length === 0 ? (
                <EmptyState title={t('list.empty')} />
              ) : (
                <table className="w-full text-sm table-sticky-head">
                  <thead>
                    <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                      <th className="text-left px-5 py-2 font-medium">{t('list.th.keyword')}</th>
                      <th className="text-left px-3 py-2 font-medium">{t('list.th.match')}</th>
                      <th className="text-left px-3 py-2 font-medium">{t('list.th.added')}</th>
                      <th className="px-5 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {negatives.map((n) => (
                      <tr
                        key={n.id}
                        className="group border-t border-zinc-100 hover:bg-zinc-50/60"
                      >
                        <td className="px-5 py-2.5 text-xs text-zinc-900">
                          {n.keyword_text}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-zinc-600">
                          {n.match_type}
                        </td>
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
                            title={t('list.deleteTitle')}
                            aria-label={t('list.deleteAria', { keyword: n.keyword_text })}
                          >
                            <X size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
};
