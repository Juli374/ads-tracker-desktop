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
 *  - Bulk pause/resume/×N/+$N/move/add-negative — единичные POST'ы через
 *    targetsApi.bulk* (см. src/renderer/api/targets.ts).
 *
 * Если backend ещё не выкатан bulk-endpoint — POST вернёт 404, мы показываем
 * toast.error из caller'а (caller получает rejected promise).
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { EditableNumber, EmptyState, LoadingRow } from '../ui';
import { ApiError } from '../../api/client';
import { targetsApi, type Target } from '../../api/targets';
import { amazonAdsApi } from '../../api/amazonAds';
import { negativeListsApi, type NegativeList } from '../../api/negativeLists';
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

type ModalKind = 'delta' | 'move' | 'negative';

export const KeywordsTable: React.FC<Props> = ({
  campaignId,
  targets,
  adGroups,
  loading,
  onReload,
}) => {
  const { t } = useTranslation('campaigns');
  const toast = useToast();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bidMultiplier, setBidMultiplier] = useState('1.10');
  const [bulkBusy, setBulkBusy] = useState(false);
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

  // Generic bulk runner. Передаём готовые success/fail messages — это
  // обходит strict-keyed t() и позволяет caller'у использовать любые
  // ICU-форматированные строки.
  const runBulk = async (
    fn: () => Promise<{ updated?: number; added?: number; message?: string }>,
    successMsg: (count: number) => string,
    failMsg: string,
  ) => {
    setBulkBusy(true);
    try {
      const res = await fn();
      const count = res.updated ?? res.added ?? selected.size;
      toast.success(successMsg(count));
      setSelected(new Set());
      setModal(null);
      onReload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : failMsg);
    } finally {
      setBulkBusy(false);
    }
  };

  const appliedMsg = (count: number) => t('details.targets.bulk.applied', { count });
  const movedMsg = (count: number) => t('details.targets.bulk.moved', { count });
  const negAddedMsg = (count: number) => t('details.targets.bulk.addNegativeAdded', { count });

  const bulkPause = () =>
    runBulk(() => targetsApi.bulkPause(ids()), appliedMsg, t('details.targets.bulk.failed'));

  const bulkResume = () =>
    runBulk(() => targetsApi.bulkResume(ids()), appliedMsg, t('details.targets.bulk.failed'));

  const bulkBidMultiplier = () => {
    const mult = parseFloat(bidMultiplier);
    if (!Number.isFinite(mult) || mult <= 0) {
      toast.error(t('details.targets.bulk.multiplierPositive'));
      return;
    }
    return runBulk(
      () => targetsApi.bulkUpdateBid(ids(), { multiplier: mult }),
      appliedMsg,
      t('details.targets.bulk.failed'),
    );
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
              disabled={bulkBusy}
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
            disabled={bulkBusy}
            data-testid="targets-bulk-open-delta"
            title={t('details.targets.bulk.deltaTitle')}
            className="h-6 px-2 text-[11px] rounded bg-white border border-zinc-200 hover:bg-zinc-100 disabled:opacity-50"
          >
            {t('details.targets.bulk.delta')}
          </button>

          {/* Move to ad group — modal */}
          <button
            type="button"
            onClick={() => setModal('move')}
            disabled={bulkBusy || adGroups.length === 0}
            data-testid="targets-bulk-open-move"
            title={t('details.targets.bulk.moveTitle')}
            className="h-6 px-2 text-[11px] rounded bg-white border border-zinc-200 hover:bg-zinc-100 disabled:opacity-50"
          >
            {t('details.targets.bulk.moveButton')}
          </button>

          {/* Add to negative — modal */}
          <button
            type="button"
            onClick={() => setModal('negative')}
            disabled={bulkBusy}
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
            disabled={bulkBusy}
            data-testid="targets-bulk-pause"
            className="h-6 px-2 text-[11px] rounded bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 disabled:opacity-50"
          >
            {t('details.targets.bulk.pause')}
          </button>
          <button
            type="button"
            onClick={bulkResume}
            disabled={bulkBusy}
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
          busy={bulkBusy}
          onClose={() => setModal(null)}
          onApply={(delta) =>
            runBulk(
              () => targetsApi.bulkUpdateBid(ids(), { delta }),
              appliedMsg,
              t('details.targets.bulk.failed'),
            )
          }
        />
      )}
      {modal === 'move' && (
        <BulkMoveModal
          ids={ids()}
          adGroups={adGroups}
          busy={bulkBusy}
          onClose={() => setModal(null)}
          onApply={(adGroupId) =>
            runBulk(
              () => targetsApi.bulkMove(ids(), adGroupId),
              movedMsg,
              t('details.targets.bulk.moveFailed'),
            )
          }
        />
      )}
      {modal === 'negative' && (
        <BulkNegativeModal
          ids={ids()}
          campaignId={campaignId}
          busy={bulkBusy}
          onClose={() => setModal(null)}
          onApply={(payload, matchType) =>
            runBulk(
              () => targetsApi.bulkAddNegative(ids(), payload, matchType),
              negAddedMsg,
              t('details.targets.bulk.addNegativeFailed'),
            )
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

const BulkMoveModal: React.FC<{
  ids: number[];
  adGroups: AdGroup[];
  busy: boolean;
  onClose(): void;
  onApply(adGroupId: number): void;
}> = ({ ids, adGroups, busy, onClose, onApply }) => {
  const { t } = useTranslation('campaigns');
  const [adGroupId, setAdGroupId] = useState<number | ''>(adGroups[0]?.id ?? '');

  const submit = () => {
    if (typeof adGroupId !== 'number') return;
    onApply(adGroupId);
  };

  return (
    <ModalShell
      title={t('details.targets.bulk.moveTitle')}
      testId="bulk-move-modal"
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
            disabled={busy || typeof adGroupId !== 'number'}
            data-testid="bulk-move-apply"
            className="h-7 px-3 text-xs rounded-md bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {t('details.targets.bulk.moveButton')}
          </button>
        </>
      }
    >
      <p className="text-xs text-zinc-500">
        {t('details.targets.bulk.selected', { count: ids.length })}
      </p>
      <label className="flex items-center gap-2 text-xs text-zinc-700">
        <span className="w-32 text-zinc-500">{t('details.targets.bulk.moveSelectGroup')}</span>
        <select
          value={adGroupId}
          onChange={(e) => setAdGroupId(e.target.value ? Number(e.target.value) : '')}
          data-testid="bulk-move-select"
          className="flex-1 h-7 px-2 text-xs border border-zinc-200 rounded bg-white"
        >
          <option value="">—</option>
          {adGroups.map((ag) => (
            <option key={ag.id} value={ag.id}>
              {ag.name}
            </option>
          ))}
        </select>
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
