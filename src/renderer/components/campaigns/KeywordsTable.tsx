/**
 * KeywordsTable — bulk-action keyword table for CampaignDetailsPage.
 *
 * Phase J.2 Lane B. Вынесено из inline-TargetsTab в CampaignDetailsPage.tsx,
 * чтобы:
 * 1) детальная страница могла оставаться "оркестратором" (load + tabs),
 * 2) появилась поверхность для расширенных bulk-операций — delta-бид,
 *    move-to-ad-group, add-to-negatives — без раздувания CampaignDetailsPage.
 *
 * Колонки: select / target / type / match / status (toggle) / bid (inline edit).
 * Bulk-bar появляется только когда selected.size > 0.
 *
 * Бэкенд-протокол:
 *  - Inline bid edit: PUT /api/amazon-ads/targets/:id/bid (amazonAdsApi.setTargetBid) —
 *    реально доходит до Amazon, не откатывается следующим sync'ом.
 *  - Status toggle: PUT /api/amazon-ads/targets/:id/state (amazonAdsApi).
 *  - Bulk ×N / +$N / pause / resume — через useBatchBidApply: resolve абсолютных
 *    бидов client-side → один batch POST (amazonAdsApi.setTargetBidsBatch) →
 *    reconcile через onReload(). Этот компонент reload-based (нет локального
 *    row-state), поэтому revert — тоже просто onReload().
 *  - Add-negative — реальный negatives client: campaign-level
 *    negativesApi.addBulkToCampaign (POST /api/campaigns/:id/negatives,
 *    sync_to_amazon) либо negativeListsApi.addItems (negative list).
 *  - Move-to-ad-group — DEFERRED: backend bulk-move route отсутствует, а
 *    match-type на Amazon неизменяем; кнопка disabled.
 *
 * Если backend ещё не выкатан bulk-endpoint — POST вернёт 404, мы показываем
 * toast.error из caller'а (caller получает rejected promise).
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { EditableNumber, EmptyState, LoadingRow } from '../ui';
import { ApiError } from '../../api/client';
import { type Target } from '../../api/targets';
import { amazonAdsApi } from '../../api/amazonAds';
import { negativeListsApi, type NegativeList } from '../../api/negativeLists';
import { negativesApi, type NegativeMatchType } from '../../api/negatives';
import { useBatchBidApply } from '../../lib/useBatchBidApply';
import type { BidEditSpec } from '../../lib/resolveBids';
import { fmtMoney } from '../../lib/format';
import { useToast } from '../../contexts/ToastContext';
import type { AdGroup } from '../../api/adGroups';

interface Props {
  campaignId: number;
  targets: Target[] | null;
  adGroups: AdGroup[];
  loading: boolean;
  // Caller (CampaignDetailsPage TargetsTab) перезагружает список после
  // успешной bulk-операции. Optimistic state на этом уровне был бы
  // overkill — bulk меняет state множества записей сразу.
  onReload(): void;
}

type ModalKind = 'delta' | 'negative';

export const KeywordsTable: React.FC<Props> = ({
  campaignId,
  targets,
  // `adGroups` is still part of the public prop contract (the parent passes it)
  // but is no longer consumed here — the bulk move-to-ad-group action is
  // DEFERRED (no backend bulk-move route; match-type is immutable on Amazon).
  loading,
  onReload,
}) => {
  const { t } = useTranslation('campaigns');
  const toast = useToast();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bidMultiplier, setBidMultiplier] = useState('1.10');
  const [modal, setModal] = useState<ModalKind | null>(null);

  // ====== Inline operations (single-row) ======

  const onSaveBid = async (id: number, next: number) => {
    try {
      await amazonAdsApi.setTargetBid(id, next);
      // local list реактивно обновится через onReload(); здесь — no-op.
      // EditableNumber вернёт finished promise, caller (caller-of-caller)
      // не нужен — мы держим список через onReload.
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('details.errors.updateBidFailed'));
      throw err;
    }
  };

  const onToggleState = async (tg: Target) => {
    const next: 'enabled' | 'paused' = tg.state === 'paused' ? 'enabled' : 'paused';
    try {
      await amazonAdsApi.setTargetState(tg.id, next);
      toast.success(t('details.targets.stateUpdated'));
      onReload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('details.targets.stateFailed'));
    }
  };

  // Bulk bid×/+/pause/resume route through the shared batch-apply hook, which
  // resolves to absolute bids client-side, POSTs the batch to Amazon, and
  // reconciles. This component is reload-based (no local row state), so reload
  // does the reconcile and revert is also just a reload.
  const { applyBids, applyState, busy: batchBusy } = useBatchBidApply({
    reload: onReload,
    revert: onReload,
  });

  // Selected rows shaped as the resolver's BidTargetInput. Target.id IS the
  // backend target_id.
  const selectedRows = () =>
    (targets ?? [])
      .filter((tg) => selected.has(tg.id))
      .map((tg) => ({ target_id: tg.id, bid: tg.bid, state: tg.state }));

  // ====== Selection ======

  const allSelected = !!targets && targets.length > 0 && selected.size === targets.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleSelectAll = () => {
    if (!targets) return;
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(targets.map((tg) => tg.id)));
  };

  const toggleSelectOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ====== Bulk ops ======

  const ids = () => Array.from(selected);

  // Bulk pause/resume via state-only batch update (uppercase ENABLED/PAUSED).
  const runBulkState = async (state: 'ENABLED' | 'PAUSED') => {
    if (selected.size === 0) return;
    try {
      const r = await applyState(selectedRows(), state);
      toast.success(
        t('details.targets.bulk.resultDetailed', {
          applied: r.applied,
          failed: r.failed,
          skipped: r.skipped,
        }),
      );
      if (r.failed === 0) setSelected(new Set());
      onReload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('details.targets.bulk.failed'));
    }
  };

  const bulkPause = () => runBulkState('PAUSED');
  const bulkResume = () => runBulkState('ENABLED');

  // Single entry point for the ×multiplier action and the delta modal.
  const applyBidSpec = async (spec: BidEditSpec) => {
    if (selected.size === 0) return;
    try {
      const r = await applyBids(selectedRows(), spec);
      toast.success(
        t('details.targets.bulk.resultDetailed', {
          applied: r.applied,
          failed: r.failed,
          skipped: r.skipped,
        }),
      );
      if (r.failed === 0) {
        setSelected(new Set());
        setModal(null);
      }
      onReload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('details.targets.bulk.failed'));
    }
  };

  const bulkBidMultiplier = () => {
    const mult = parseFloat(bidMultiplier);
    if (!Number.isFinite(mult) || mult <= 0) {
      toast.error(t('details.targets.bulk.multiplierPositive'));
      return;
    }
    return applyBidSpec({ kind: 'multiply', factor: mult });
  };

  // Resolve keyword strings from selected targets that carry keyword_text.
  // ASIN/category targets have no keyword to negate, so they're skipped.
  const selectedKeywords = () =>
    (targets ?? [])
      .filter((tg) => selected.has(tg.id))
      .map((tg) => tg.keyword_text)
      .filter((kw): kw is string => typeof kw === 'string' && kw.trim().length > 0);

  // Add-negative: route keyword strings to the REAL negatives client — either
  // campaign-level negatives (POST /api/campaigns/:id/negatives with
  // sync_to_amazon) or a negative list. matchType arrives Title-case.
  const applyNegative = async (
    target: { listId: number } | { campaignId: number },
    matchType: NegativeMatchType,
  ) => {
    const keywords = selectedKeywords();
    if (keywords.length === 0) {
      toast.error(t('details.targets.bulk.addNegativeNoKeywords'));
      return;
    }
    try {
      if ('campaignId' in target) {
        await negativesApi.addBulkToCampaign(target.campaignId, keywords, matchType);
      } else {
        await negativeListsApi.addItems(
          target.listId,
          keywords.map((keyword) => ({
            keyword,
            matchType: matchType.toLowerCase() as 'exact' | 'phrase',
          })),
        );
      }
      toast.success(t('details.targets.bulk.addNegativeAdded', { count: keywords.length }));
      setSelected(new Set());
      setModal(null);
      onReload();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : t('details.targets.bulk.addNegativeFailed'),
      );
    }
  };

  // ====== Render ======

  if (loading && !targets) return <LoadingRow />;
  if (!targets || targets.length === 0) {
    return <EmptyState title={t('details.targets.empty')} />;
  }

  return (
    <>
      {selected.size > 0 && (
        <div
          className="flex items-center gap-2 px-5 py-2 border-b border-zinc-200 bg-zinc-50 sticky top-0 z-10 flex-wrap"
          data-testid="targets-bulk-bar"
        >
          <span className="text-xs font-medium text-zinc-700">
            {t('details.targets.bulk.selected', { count: selected.size })}
          </span>
          <div className="flex-1" />

          {/* ×N multiplier inline (existing) */}
          <div className="inline-flex items-center gap-1">
            <span className="text-[11px] text-zinc-500">
              {t('details.targets.bulk.bidMultiplier')}
            </span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={bidMultiplier}
              onChange={(e) => setBidMultiplier(e.target.value)}
              data-testid="targets-bulk-bid-multiplier"
              title={t('details.targets.bulk.bidMultiplierTitle')}
              className="w-16 h-6 px-1 text-xs border border-zinc-200 rounded text-right tabular-nums"
            />
            <button
              type="button"
              onClick={bulkBidMultiplier}
              disabled={batchBusy}
              data-testid="targets-bulk-apply-multiplier"
              className="h-6 px-2 text-[11px] rounded bg-white border border-zinc-200 hover:bg-zinc-100 disabled:opacity-50"
            >
              {t('details.targets.bulk.applyBid')}
            </button>
          </div>

          {/* +$N delta — opens modal */}
          <button
            type="button"
            onClick={() => setModal('delta')}
            disabled={batchBusy}
            data-testid="targets-bulk-open-delta"
            title={t('details.targets.bulk.deltaTitle')}
            className="h-6 px-2 text-[11px] rounded bg-white border border-zinc-200 hover:bg-zinc-100 disabled:opacity-50"
          >
            {t('details.targets.bulk.delta')}
          </button>

          {/* Move to ad group — DEFERRED: no backend bulk-move route and the
              match-type is immutable on Amazon, so the button is disabled. */}
          <button
            type="button"
            disabled
            data-testid="targets-bulk-open-move"
            title={t('details.targets.bulk.moveDeferredTitle')}
            className="h-6 px-2 text-[11px] rounded bg-white border border-zinc-200 opacity-50 cursor-not-allowed"
          >
            {t('details.targets.bulk.moveButton')}
          </button>

          {/* Add to negative — modal */}
          <button
            type="button"
            onClick={() => setModal('negative')}
            disabled={batchBusy}
            data-testid="targets-bulk-open-negative"
            title={t('details.targets.bulk.addNegativeTitle')}
            className="h-6 px-2 text-[11px] rounded bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 disabled:opacity-50"
          >
            {t('details.targets.bulk.addNegativeButton')}
          </button>

          {/* Existing pause / resume */}
          <button
            type="button"
            onClick={bulkPause}
            disabled={batchBusy}
            data-testid="targets-bulk-pause"
            className="h-6 px-2 text-[11px] rounded bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 disabled:opacity-50"
          >
            {t('details.targets.bulk.pause')}
          </button>
          <button
            type="button"
            onClick={bulkResume}
            disabled={batchBusy}
            data-testid="targets-bulk-enable"
            className="h-6 px-2 text-[11px] rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50"
          >
            {t('details.targets.bulk.enable')}
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            data-testid="targets-bulk-clear"
            className="h-6 px-2 text-[11px] rounded text-zinc-500 hover:text-zinc-900"
          >
            {t('details.targets.bulk.clear')}
          </button>
        </div>
      )}

      <table className="w-full text-sm table-sticky-head">
        <thead>
          <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
            <th className="text-left px-5 py-2 w-8">
              <input
                type="checkbox"
                aria-label={t('details.targets.selectAllAria')}
                data-testid="targets-select-all"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={toggleSelectAll}
              />
            </th>
            <th className="text-left px-3 py-2 font-medium">Target</th>
            <th className="text-left px-3 py-2 font-medium">{t('details.targets.th.type')}</th>
            <th className="text-left px-3 py-2 font-medium">Match</th>
            <th className="text-left px-3 py-2 font-medium">Status</th>
            <th className="text-right px-5 py-2 font-medium">Bid</th>
          </tr>
        </thead>
        <tbody>
          {targets.map((tg) => {
            const targetText = tg.keyword_text ?? tg.asin ?? tg.category ?? '—';
            const isPausedTarget = tg.state === 'paused';
            return (
              <tr key={tg.id} className="border-t border-zinc-100 hover:bg-zinc-50/60">
                <td className="px-5 py-2.5">
                  <input
                    type="checkbox"
                    aria-label={t('details.targets.selectAria', { target: targetText })}
                    data-testid={`targets-row-checkbox-${tg.id}`}
                    checked={selected.has(tg.id)}
                    onChange={() => toggleSelectOne(tg.id)}
                  />
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-900 font-mono truncate max-w-md">
                  {targetText}
                </td>
                <td className="px-3 py-2.5 text-[11px] text-zinc-600 uppercase">
                  {tg.keyword_text ? 'keyword' : tg.asin ? 'asin' : tg.category ? 'category' : '—'}
                </td>
                <td className="px-3 py-2.5 text-[11px] text-zinc-600">{tg.match_type ?? '—'}</td>
                <td className="px-3 py-2.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => onToggleState(tg)}
                    aria-label={t('details.targets.ariaStateToggle', { target: targetText })}
                    data-testid={`targets-state-toggle-${tg.id}`}
                    className={`
                      inline-flex items-center px-1.5 h-5 rounded text-[10px] font-medium border transition-colors
                      ${isPausedTarget
                        ? 'text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100'
                        : 'text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100'}
                    `}
                  >
                    {tg.state ?? '—'}
                  </button>
                </td>
                <td className="px-5 py-2.5 text-xs text-right">
                  <EditableNumber
                    value={tg.bid}
                    onSave={(v) => onSaveBid(tg.id, v)}
                    format={(n) => fmtMoney(n)}
                    min={0.02}
                    step={0.01}
                    ariaLabel="Bid"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {modal === 'delta' && (
        <BulkDeltaModal
          ids={ids()}
          busy={batchBusy}
          onClose={() => setModal(null)}
          onApply={(delta) => applyBidSpec({ kind: 'delta', amount: delta })}
        />
      )}
      {modal === 'negative' && (
        <BulkNegativeModal
          ids={ids()}
          campaignId={campaignId}
          busy={batchBusy}
          onClose={() => setModal(null)}
          onApply={(payload, matchType) =>
            applyNegative(payload, matchType === 'phrase' ? 'Phrase' : 'Exact')
          }
        />
      )}
    </>
  );
};

// ============================================================================
// Bulk modals
// ============================================================================

const ModalShell: React.FC<{
  title: string;
  testId: string;
  busy: boolean;
  onClose(): void;
  children: React.ReactNode;
  footer: React.ReactNode;
}> = ({ title, testId, busy, onClose, children, footer }) => {
  useEffect(() => {
    document.body.dataset.modalOpen = 'true';
    return () => {
      delete document.body.dataset.modalOpen;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 bg-zinc-900/20 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        data-testid={testId}
        className="w-full max-w-md bg-white border border-zinc-200 rounded-xl shadow-card overflow-hidden"
      >
        <div className="px-5 pt-4 pb-3 border-b border-zinc-100 flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-900 tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            className="text-zinc-400 hover:text-zinc-700 transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">{children}</div>
        <div className="px-5 py-3 border-t border-zinc-100 flex items-center justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
};

const BulkDeltaModal: React.FC<{
  ids: number[];
  busy: boolean;
  onClose(): void;
  onApply(delta: number): void;
}> = ({ ids, busy, onClose, onApply }) => {
  const { t } = useTranslation('campaigns');
  const [delta, setDelta] = useState('0.05');

  const submit = () => {
    const v = parseFloat(delta);
    if (!Number.isFinite(v)) return;
    onApply(v);
  };

  return (
    <ModalShell
      title={t('details.targets.bulk.deltaTitle')}
      testId="bulk-delta-modal"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-7 px-3 text-xs rounded-md border border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {t('details.targets.bulk.modalCancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            data-testid="bulk-delta-apply"
            className="h-7 px-3 text-xs rounded-md bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {t('details.targets.bulk.applyDelta')}
          </button>
        </>
      }
    >
      <p className="text-xs text-zinc-500">
        {t('details.targets.bulk.selected', { count: ids.length })}
      </p>
      <label className="flex items-center gap-2 text-xs text-zinc-700">
        <span className="w-24 text-zinc-500">{t('details.targets.bulk.delta')}</span>
        <input
          type="number"
          step="0.01"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          data-testid="bulk-delta-input"
          className="flex-1 h-7 px-2 text-xs border border-zinc-200 rounded text-right tabular-nums"
        />
      </label>
    </ModalShell>
  );
};

const BulkNegativeModal: React.FC<{
  ids: number[];
  campaignId: number;
  busy: boolean;
  onClose(): void;
  onApply(
    target: { listId: number } | { campaignId: number },
    matchType: 'exact' | 'phrase',
  ): void;
}> = ({ ids, campaignId, busy, onClose, onApply }) => {
  const { t } = useTranslation('campaigns');
  const [scope, setScope] = useState<'campaign' | 'list'>('campaign');
  const [listId, setListId] = useState<number | ''>('');
  const [matchType, setMatchType] = useState<'exact' | 'phrase'>('exact');
  const [lists, setLists] = useState<NegativeList[]>([]);

  // Lazy-load доступных списков один раз при открытии модала. Падать если
  // backend недоступен не страшно — пользователь просто увидит пустой select.
  useEffect(() => {
    let cancelled = false;
    negativeListsApi
      .list({ includeGlobal: true })
      .then((data) => {
        if (cancelled) return;
        setLists(Array.isArray(data) ? data : []);
        if (data.length > 0) setListId(data[0].id);
      })
      .catch(() => {
        // ignore — empty select is acceptable fallback
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = () => {
    if (scope === 'campaign') onApply({ campaignId }, matchType);
    else if (typeof listId === 'number') onApply({ listId }, matchType);
  };

  const canSubmit = scope === 'campaign' || typeof listId === 'number';

  return (
    <ModalShell
      title={t('details.targets.bulk.addNegativeTitle')}
      testId="bulk-negative-modal"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-7 px-3 text-xs rounded-md border border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {t('details.targets.bulk.modalCancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !canSubmit}
            data-testid="bulk-negative-apply"
            className="h-7 px-3 text-xs rounded-md bg-rose-700 text-white hover:bg-rose-800 disabled:opacity-50"
          >
            {t('details.targets.bulk.addNegativeButton')}
          </button>
        </>
      }
    >
      <p className="text-xs text-zinc-500">
        {t('details.targets.bulk.selected', { count: ids.length })}
      </p>
      <fieldset className="text-xs space-y-2">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="bulk-neg-scope"
            value="campaign"
            checked={scope === 'campaign'}
            onChange={() => setScope('campaign')}
          />
          <span className="text-zinc-700">{t('details.targets.bulk.addNegativeTargetCampaign')}</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="bulk-neg-scope"
            value="list"
            checked={scope === 'list'}
            onChange={() => setScope('list')}
          />
          <span className="text-zinc-700">{t('details.targets.bulk.addNegativeTargetList')}</span>
          <select
            value={listId}
            onChange={(e) => setListId(e.target.value ? Number(e.target.value) : '')}
            disabled={scope !== 'list'}
            data-testid="bulk-negative-list-select"
            className="flex-1 h-6 px-1 text-xs border border-zinc-200 rounded bg-white disabled:opacity-50"
          >
            <option value="">—</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      <label className="flex items-center gap-2 text-xs text-zinc-700">
        <span className="w-24 text-zinc-500">{t('details.targets.bulk.addNegativeMatch')}</span>
        <select
          value={matchType}
          onChange={(e) => setMatchType(e.target.value as 'exact' | 'phrase')}
          data-testid="bulk-negative-match"
          className="flex-1 h-7 px-2 text-xs border border-zinc-200 rounded bg-white"
        >
          <option value="exact">exact</option>
          <option value="phrase">phrase</option>
        </select>
      </label>
    </ModalShell>
  );
};
