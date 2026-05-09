import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { useBooks } from '../contexts/BooksContext';
import { ApiError } from '../api/client';
import {
  campaignsApi,
  type BiddingStrategy,
  type CampaignType,
  type TargetingType,
} from '../api/campaigns';
import { adGroupsApi } from '../api/adGroups';
import { targetsApi, type MatchType } from '../api/targets';
import { negativesApi, type NegativeMatchType } from '../api/negatives';

interface Props {
  onClose(): void;
  onCreated(campaignId: number): void;
}

const CAMPAIGN_TYPES: Array<{ id: CampaignType; label: string; hint: string }> = [
  { id: 'sp', label: 'Sponsored Products', hint: 'SP — самый популярный, для всех ASIN' },
  { id: 'sb', label: 'Sponsored Brands',   hint: 'SB — баннер бренда, требует A+ контент' },
  { id: 'sd', label: 'Sponsored Display',  hint: 'SD — ретаргетинг и аудитории' },
];

const BIDDING_STRATEGIES: BiddingStrategy[] = [
  'Fixed bids',
  'Dynamic bids - down only',
  'Dynamic bids - up and down',
];

const splitKeywords = (raw: string): string[] =>
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

export const AddCampaignModal: React.FC<Props> = ({ onClose, onCreated }) => {
  const toast = useToast();
  const { list: books } = useBooks();

  const [campaignType, setCampaignType] = useState<CampaignType>('sp');
  const [bookId, setBookId] = useState<number | null>(null);
  const [asinId, setAsinId] = useState<number | null>(null);
  const [targetingType, setTargetingType] = useState<TargetingType>('manual');
  const [name, setName] = useState('');
  const [budget, setBudget] = useState<string>('10');
  const [bidding, setBidding] = useState<BiddingStrategy>('Dynamic bids - down only');
  const [topOfSearch, setTopOfSearch] = useState<string>('0');
  const [productPages, setProductPages] = useState<string>('0');
  const [restOfSearch, setRestOfSearch] = useState<string>('0');
  const [adGroupName, setAdGroupName] = useState('Ad Group 1');
  const [defaultBid, setDefaultBid] = useState<string>('0.75');
  const [keywords, setKeywords] = useState<string>('');
  const [matchType, setMatchType] = useState<MatchType>('exact');
  const [negatives, setNegatives] = useState<string>('');
  const [negMatchType, setNegMatchType] = useState<NegativeMatchType>('Exact');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.body.dataset.modalOpen = 'true';
    return () => {
      delete document.body.dataset.modalOpen;
    };
  }, []);

  // Window-level Esc handler (фокус может быть в любом из инпутов модала).
  useEffect(() => {
    const onWinKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onWinKey);
    return () => window.removeEventListener('keydown', onWinKey);
  }, [submitting, onClose]);

  // Книги с активными ASIN-ами по маркетплейсам, отсортированные по названию.
  const sortedBooks = useMemo(
    () => [...books].sort((a, b) => a.title.localeCompare(b.title, 'ru')),
    [books],
  );

  const selectedBook = useMemo(
    () => sortedBooks.find((b) => b.id === bookId),
    [sortedBooks, bookId],
  );

  // Сбрасываем ASIN если он не из выбранной книги.
  useEffect(() => {
    if (!selectedBook) {
      setAsinId(null);
      return;
    }
    const stillValid = selectedBook.asins?.some((a) => a.id === asinId);
    if (!stillValid) {
      const firstActive = selectedBook.asins?.find((a) => a.is_active) ?? selectedBook.asins?.[0];
      setAsinId(firstActive?.id ?? null);
    }
  }, [selectedBook, asinId]);

  const isManual = targetingType === 'manual';
  const isSp = campaignType === 'sp';
  // SB/SD используют другие поля; для personal-use фокус на SP. Для SB/SD создаём
  // только сам campaign-record, ad-group и targets через UI пока не настраиваем.
  const enableAdGroup = isSp;
  const enableKeywords = isSp && isManual;

  const validate = (): string | null => {
    if (!name.trim()) return 'Имя кампании обязательно';
    if (!asinId) return 'Выберите книгу и маркетплейс';
    const budgetNum = Number(budget);
    if (!Number.isFinite(budgetNum) || budgetNum <= 0)
      return 'Бюджет должен быть положительным';
    if (enableAdGroup) {
      if (!adGroupName.trim()) return 'Имя ad group обязательно';
      const bidNum = Number(defaultBid);
      if (!Number.isFinite(bidNum) || bidNum <= 0)
        return 'Default bid должен быть положительным';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }

    setSubmitting(true);
    try {
      // 1. Создаём кампанию.
      const campaign = await campaignsApi.create(asinId as number, {
        name: name.trim(),
        campaign_type: campaignType,
        targeting_type: targetingType,
        budget: Number(budget),
        bidding_strategy: bidding,
        top_of_search: Number(topOfSearch) || 0,
        product_pages: Number(productPages) || 0,
        rest_of_search: Number(restOfSearch) || 0,
      });
      const campaignId = campaign.id;

      // 2. Если SP — создаём ad group и опционально targets.
      let adGroupId: number | null = null;
      if (enableAdGroup) {
        const ag = await adGroupsApi.create(campaignId, {
          name: adGroupName.trim(),
          default_bid: Number(defaultBid),
        });
        adGroupId = ag.id;
      }

      // 3. Если manual — заливаем keywords как targets.
      if (enableKeywords && adGroupId != null) {
        const list = splitKeywords(keywords);
        if (list.length > 0) {
          const results = await targetsApi.createKeywordsBulk(
            adGroupId,
            list,
            matchType,
            Number(defaultBid),
          );
          const failed = results.filter((r) => !r.ok);
          if (failed.length > 0) {
            toast.error(
              `Ключи: ${list.length - failed.length}/${list.length} добавлены (${failed.length} с ошибкой)`,
            );
          }
        }
      }

      // 4. Negatives — отдельно. Используем campaign-level (не ad-group),
      //    т.к. они применяются ко всем ad groups и проще для personal-use.
      const negList = splitKeywords(negatives);
      if (negList.length > 0) {
        try {
          await negativesApi.addBulkToCampaign(campaignId, negList, negMatchType);
        } catch (negErr) {
          toast.error(
            `Negatives: ${negErr instanceof ApiError ? negErr.message : 'не удалось добавить'}`,
          );
        }
      }

      toast.success(`Кампания «${name.trim()}» создана`);
      onCreated(campaignId);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Не удалось создать кампанию');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 bg-zinc-900/20 backdrop-blur-sm overflow-y-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl bg-white border border-zinc-200 rounded-xl shadow-card overflow-hidden my-auto"
      >
        <div className="px-5 pt-5 pb-3 border-b border-zinc-100 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 tracking-tight">
              Новая кампания
            </h2>
            <div className="text-xs text-zinc-500 mt-0.5">
              SP/SB/SD · auto или manual · ad group + ключи + минус-слова
            </div>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="text-zinc-400 hover:text-zinc-700 transition-colors"
            aria-label="Закрыть"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Тип кампании */}
          <Section title="Тип кампании">
            <div className="grid grid-cols-3 gap-2">
              {CAMPAIGN_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setCampaignType(t.id)}
                  className={`
                    text-left p-3 rounded-lg border transition-colors
                    ${campaignType === t.id
                      ? 'border-zinc-900 bg-zinc-50'
                      : 'border-zinc-200 hover:border-zinc-300'}
                  `}
                >
                  <div className="text-xs font-semibold text-zinc-900 uppercase tracking-wide">
                    {t.id}
                  </div>
                  <div className="text-[11px] text-zinc-700 mt-0.5">{t.label}</div>
                  <div className="text-[10px] text-zinc-400 mt-1">{t.hint}</div>
                </button>
              ))}
            </div>
          </Section>

          {/* Книга + MP */}
          <Section title="Книга и маркетплейс">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Книга">
                <select
                  value={bookId ?? ''}
                  onChange={(e) => setBookId(e.target.value ? Number(e.target.value) : null)}
                  className={selectClass}
                  required
                >
                  <option value="">— выбрать —</option>
                  {sortedBooks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Маркетплейс (ASIN)">
                <select
                  value={asinId ?? ''}
                  onChange={(e) => setAsinId(e.target.value ? Number(e.target.value) : null)}
                  className={selectClass}
                  disabled={!selectedBook}
                  required
                >
                  <option value="">— выбрать —</option>
                  {selectedBook?.asins?.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.marketplace} · {a.asin}
                      {a.is_active ? '' : ' (inactive)'}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Section>

          {/* Targeting + Имя + Бюджет */}
          <Section title="Параметры">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Field label="Targeting">
                <div className="inline-flex bg-white border border-zinc-200 rounded-md p-0.5 w-full">
                  {(['manual', 'auto'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTargetingType(t)}
                      className={`
                        flex-1 h-8 text-xs font-medium rounded transition-colors
                        ${targetingType === t
                          ? 'bg-zinc-900 text-white'
                          : 'text-zinc-600 hover:text-zinc-900'}
                      `}
                    >
                      {t === 'manual' ? 'Manual' : 'Auto'}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Дневной бюджет ($)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className={inputClass}
                  required
                />
              </Field>
            </div>
            <Field label="Имя кампании">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="например: SP-Manual-CrockpotUSA"
                className={inputClass}
                required
              />
            </Field>
          </Section>

          {/* Bidding strategy */}
          <Section title="Bidding & placements">
            <div className="space-y-3">
              <Field label="Bidding strategy">
                <select
                  value={bidding}
                  onChange={(e) => setBidding(e.target.value as BiddingStrategy)}
                  className={selectClass}
                >
                  {BIDDING_STRATEGIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Top of search (%)">
                  <input
                    type="number"
                    min="0"
                    max="900"
                    step="1"
                    value={topOfSearch}
                    onChange={(e) => setTopOfSearch(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Product pages (%)">
                  <input
                    type="number"
                    min="0"
                    max="900"
                    step="1"
                    value={productPages}
                    onChange={(e) => setProductPages(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Rest of search (%)">
                  <input
                    type="number"
                    min="0"
                    max="900"
                    step="1"
                    value={restOfSearch}
                    onChange={(e) => setRestOfSearch(e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
            </div>
          </Section>

          {/* Ad Group (только SP) */}
          {enableAdGroup && (
            <Section title="Ad Group">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Имя ad group">
                  <input
                    type="text"
                    value={adGroupName}
                    onChange={(e) => setAdGroupName(e.target.value)}
                    className={inputClass}
                    required={enableAdGroup}
                  />
                </Field>
                <Field label="Default bid ($)">
                  <input
                    type="number"
                    min="0.02"
                    step="0.01"
                    value={defaultBid}
                    onChange={(e) => setDefaultBid(e.target.value)}
                    className={inputClass}
                    required={enableAdGroup}
                  />
                </Field>
              </div>
            </Section>
          )}

          {/* Keywords (manual SP) */}
          {enableKeywords && (
            <Section
              title="Ключевые слова"
              hint="по одному ключу на строку. Pусают bid из ad group."
            >
              <div className="space-y-2">
                <textarea
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder={'crockpot recipes\nslow cooker meals\nfamily dinner ideas'}
                  rows={5}
                  className={textareaClass}
                />
                <Field label="Match type">
                  <div className="inline-flex bg-white border border-zinc-200 rounded-md p-0.5">
                    {(['exact', 'phrase', 'broad'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMatchType(m)}
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
                </Field>
              </div>
            </Section>
          )}

          {/* Negatives (опционально) */}
          <Section title="Минус-слова (опционально)" hint="один на строку">
            <div className="space-y-2">
              <textarea
                value={negatives}
                onChange={(e) => setNegatives(e.target.value)}
                placeholder={'free\ncheap\namazon prime'}
                rows={3}
                className={textareaClass}
              />
              <Field label="Match type">
                <div className="inline-flex bg-white border border-zinc-200 rounded-md p-0.5">
                  {(['Exact', 'Phrase'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setNegMatchType(m)}
                      className={`
                        px-3 h-7 text-xs font-medium rounded transition-colors
                        ${negMatchType === m
                          ? 'bg-zinc-900 text-white'
                          : 'text-zinc-600 hover:text-zinc-900'}
                      `}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </Section>
        </div>

        <div className="px-5 py-3 border-t border-zinc-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="
              h-8 px-3 text-xs font-medium rounded-md
              text-zinc-700 border border-zinc-200 bg-white
              hover:bg-zinc-50 transition-colors
              disabled:opacity-50
            "
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="
              h-8 px-4 text-xs font-medium rounded-md
              bg-zinc-900 text-white hover:bg-zinc-800 transition-colors
              flex items-center gap-1.5
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            {submitting && <Loader2 size={12} className="animate-spin" />}
            Создать кампанию
          </button>
        </div>
      </form>
    </div>
  );
};

const inputClass =
  'w-full h-9 px-3 text-sm rounded-md border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400';

const selectClass =
  'w-full h-9 px-2 text-sm rounded-md border border-zinc-200 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 disabled:opacity-50 disabled:bg-zinc-50';

const textareaClass =
  'w-full px-3 py-2 text-sm rounded-md border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 font-mono resize-y min-h-[80px]';

const Section: React.FC<{
  title: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ title, hint, children }) => (
  <section>
    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-2 flex items-baseline gap-2">
      {title}
      {hint && <span className="font-normal normal-case tracking-normal text-zinc-400">— {hint}</span>}
    </div>
    {children}
  </section>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="space-y-1">
    <label className="block text-xs font-medium text-zinc-700">{label}</label>
    {children}
  </div>
);
