import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, X, Ban } from 'lucide-react';
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
import { dateRangeFor } from '../lib/dateRange';
import { useToast } from '../contexts/ToastContext';
import { useGlobalFilters } from '../contexts/GlobalFiltersContext';

export const NegativesPage: React.FC = () => {
  const toast = useToast();
  const { filters: globalFilters } = useGlobalFilters();
  const [campaigns, setCampaigns] = useState<CampaignSummary | null>(null);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [campaignId, setCampaignId] = useState<number | null>(null);

  const [negatives, setNegatives] = useState<Negative[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  const [keyword, setKeyword] = useState('');
  const [matchType, setMatchType] = useState<NegativeMatchType>('Exact');

  // Загружаем кампании за последние 30 дней под текущие глобальные фильтры
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
        // Авто-выбор первой кампании если ничего не выбрано
        if (data.campaigns.length > 0 && campaignId == null) {
          setCampaignId(data.campaigns[0].campaign_id);
        }
      } catch (err) {
        if (cancelled) return;
        toast.error(
          err instanceof ApiError ? err.message : 'Не удалось загрузить кампании',
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
          err instanceof ApiError ? err.message : 'Не удалось загрузить негативы',
        );
      } finally {
        setLoading(false);
      }
    },
    [campaignId, toast],
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
    const term = keyword.trim();
    if (!term) return;
    setAdding(true);
    try {
      await negativesApi.add(campaignId, term, matchType);
      toast.success('Добавлено как negative');
      setKeyword('');
      await loadNegatives();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Не удалось добавить');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (n: Negative) => {
    try {
      await negativesApi.delete(n.id);
      setNegatives((prev) => prev.filter((x) => x.id !== n.id));
      toast.success('Удалено');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Не удалось удалить');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Минус-слова"
        subtitle={
          selectedCampaign
            ? `${selectedCampaign.campaign_name} · ${selectedCampaign.marketplace}`
            : 'Negative keywords для кампании'
        }
      />

      {/* Campaign selector */}
      <Card title="Кампания">
        {campaignsLoading ? (
          <LoadingRow />
        ) : !campaigns || campaigns.campaigns.length === 0 ? (
          <EmptyState
            title="Нет кампаний"
            hint="Расширь глобальный фильтр или диапазон, чтобы увидеть кампании."
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

      {/* Add new negative */}
      {selectedCampaign && (
        <Card title="Добавить минус-слово">
          <form onSubmit={handleAdd} className="px-5 py-3 flex items-center gap-2">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="негативное ключевое слово…"
              disabled={adding}
              className="
                flex-1 h-9 px-3 text-sm rounded-md
                border border-zinc-200 bg-white
                text-zinc-900 placeholder:text-zinc-400
                focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
                disabled:opacity-50
              "
            />
            <select
              value={matchType}
              onChange={(e) => setMatchType(e.target.value as NegativeMatchType)}
              disabled={adding}
              className="
                h-9 px-2 pr-7 text-xs rounded-md
                border border-zinc-200 bg-white text-zinc-700 cursor-pointer
                focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
              "
            >
              <option value="Exact">Exact</option>
              <option value="Phrase">Phrase</option>
            </select>
            <button
              type="submit"
              disabled={adding || !keyword.trim()}
              className="
                inline-flex items-center gap-1.5 h-9 px-3 rounded-md
                bg-zinc-900 text-white text-xs font-medium
                hover:bg-zinc-800 transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Добавить
            </button>
          </form>
        </Card>
      )}

      {/* Negatives list */}
      {selectedCampaign && (
        <Card
          title={
            <div className="flex items-center gap-2">
              <Ban size={14} className="text-zinc-400" />
              Текущие негативы
            </div>
          }
          rightSlot={
            <div className="text-xs text-zinc-500">
              {loading ? '' : `${negatives.length} всего`}
            </div>
          }
        >
          {loading ? (
            <LoadingRow />
          ) : negatives.length === 0 ? (
            <EmptyState title="У этой кампании нет негативов." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                  <th className="text-left px-5 py-2 font-medium">Ключевое слово</th>
                  <th className="text-left px-3 py-2 font-medium">Match</th>
                  <th className="text-left px-3 py-2 font-medium">Добавлено</th>
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
                        title="Удалить"
                        aria-label={`Удалить ${n.keyword_text}`}
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
    </div>
  );
};
