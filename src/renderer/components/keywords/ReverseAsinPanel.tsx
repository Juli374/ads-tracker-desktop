// Phase L.4 — Reverse-ASIN keyword mining panel.
//
// User flow:
//   1. Type a competitor ASIN (validation: 10-char alphanumeric).
//   2. Click "Import Publisher Rocket CSV…" → native file picker (renderer-only,
//      <input type="file">) → read text → parseReverseAsinCsv.
//   3. Table renders all keywords with checkboxes + the three PR metrics.
//   4. Bulk-select → "Send to ad group" (creates targets via existing
//      `targetsApi.createKeywordsBulk`) or "Add to negatives" (via
//      `targetsApi.bulkAddNegative` once we have target_ids — for now negative
//      lists accept raw keywords, so we POST individual list items).
//
// Why not use `window.api.dialog.openFile`:
//   The IPC dialog returns a path; we'd then need a new IPC channel to read
//   arbitrary CSV file contents on the main side. <input type="file"> +
//   File.text() does the same job entirely in the renderer with zero new
//   surface area. The native picker still appears.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../api/client';
import { adGroupsApi } from '../../api/adGroups';
import { metricsApi } from '../../api/metrics';
import {
  isAsinShape,
  parseReverseAsinCsv,
  ParseError,
  type ReverseAsinKeyword,
} from '../../api/reverseAsin';
import { targetsApi, type MatchType } from '../../api/targets';
import { negativeListsApi, type NegativeList } from '../../api/negativeLists';
import { useToast } from '../../contexts/ToastContext';
import { fmtNumber } from '../../lib/format';

interface AdGroupChoice {
  id: number;
  campaignId: number;
  campaignName: string;
  name: string;
}

export const ReverseAsinPanel: React.FC = () => {
  const { t } = useTranslation('keywords');
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Input state.
  const [asin, setAsin] = useState('');
  const [importing, setImporting] = useState(false);

  // Imported keywords + selection.
  const [rows, setRows] = useState<ReverseAsinKeyword[]>([]);
  // Selection identifies rows by index (keywords are unique per file).
  // Using indices keeps the API tiny and avoids stringifying full keyword
  // phrases as keys.
  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(new Set());

  // Modal state — only one open at a time.
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [negativeModalOpen, setNegativeModalOpen] = useState(false);

  const asinValid = asin.trim() === '' || isAsinShape(asin);

  const onPickFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Renderer-side CSV read. File.text() is available in modern Chromium.
  const onFileChosen = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Reset input immediately so re-picking the same file fires onChange again.
      event.target.value = '';
      if (!file) return;
      setImporting(true);
      try {
        const text = await file.text();
        const parsed = parseReverseAsinCsv(text);
        if (parsed.length === 0) {
          toast.error(t('reverseAsin.importEmpty'));
          return;
        }
        setRows(parsed);
        setSelectedIdx(new Set());
        toast.success(t('reverseAsin.importSuccess', { count: parsed.length }));
      } catch (err) {
        const msg =
          err instanceof ParseError
            ? `${err.message}${err.hint ? ` — ${err.hint}` : ''}`
            : err instanceof Error
              ? err.message
              : String(err);
        toast.error(t('reverseAsin.parseError', { message: msg }));
      } finally {
        setImporting(false);
      }
    },
    [t, toast],
  );

  const allSelected = rows.length > 0 && selectedIdx.size === rows.length;
  const toggleAll = () => {
    if (allSelected) setSelectedIdx(new Set());
    else setSelectedIdx(new Set(rows.map((_, i) => i)));
  };
  const toggleOne = (idx: number) => {
    setSelectedIdx((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const selectedKeywords = useMemo(
    () => Array.from(selectedIdx).map((i) => rows[i]).filter(Boolean),
    [rows, selectedIdx],
  );

  return (
    <div className="space-y-4" data-testid="reverse-asin-panel">
      <div className="rounded-lg border border-zinc-200 bg-white p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">
            {t('reverseAsin.title')}
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {t('reverseAsin.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-[11px] font-medium text-zinc-700 mb-1">
              {t('reverseAsin.asinLabel')}
            </label>
            <input
              type="text"
              value={asin}
              onChange={(e) => setAsin(e.target.value.toUpperCase().trim())}
              placeholder={t('reverseAsin.asinPlaceholder')}
              maxLength={10}
              className={`
                w-full h-9 px-3 text-sm font-mono rounded-md
                border bg-white text-zinc-900 placeholder:text-zinc-300
                focus:outline-none focus:ring-2 focus:ring-zinc-900/10
                ${asinValid ? 'border-zinc-200 focus:border-zinc-400' : 'border-red-300 focus:border-red-500 focus:ring-red-500/10'}
              `}
              data-testid="reverse-asin-input"
            />
            {!asinValid && (
              <p className="mt-1 text-[11px] text-red-600">
                {t('reverseAsin.asinInvalid')}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={onPickFile}
              disabled={importing}
              data-testid="reverse-asin-import-btn"
              className="
                inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium
                rounded-md border border-zinc-200 bg-white text-zinc-700
                hover:bg-zinc-50 transition-colors disabled:opacity-50
              "
            >
              {importing ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Upload size={12} />
              )}
              {importing
                ? t('reverseAsin.importing')
                : t('reverseAsin.importButton')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onFileChosen}
              className="hidden"
              data-testid="reverse-asin-file-input"
            />
          </div>
        </div>
        <p className="text-[11px] text-zinc-400">
          {t('reverseAsin.importHint')}
        </p>
      </div>

      {rows.length === 0 ? (
        <div
          className="rounded-lg border border-zinc-200 bg-zinc-50 p-6 text-center text-sm text-zinc-500"
          data-testid="reverse-asin-empty"
        >
          {t('reverseAsin.noFile')}
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
          {selectedIdx.size > 0 && (
            <div
              className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 flex items-center gap-3 text-xs"
              data-testid="reverse-asin-bulk-toolbar"
            >
              <span className="text-zinc-700 font-medium tabular-nums">
                {t('reverseAsin.bulk.selected', { count: selectedIdx.size })}
              </span>
              <div className="h-4 w-px bg-zinc-300" />
              <button
                type="button"
                onClick={() => setSendModalOpen(true)}
                data-testid="reverse-asin-send-btn"
                className="h-7 px-3 text-xs font-medium rounded-md border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100"
              >
                {t('reverseAsin.bulk.sendToAdGroup')}
              </button>
              <button
                type="button"
                onClick={() => setNegativeModalOpen(true)}
                data-testid="reverse-asin-negative-btn"
                className="h-7 px-3 text-xs font-medium rounded-md border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100"
              >
                {t('reverseAsin.bulk.addNegatives')}
              </button>
              <button
                type="button"
                onClick={() => setSelectedIdx(new Set())}
                className="ml-auto inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-700"
              >
                <X size={12} />
                {t('reverseAsin.bulk.clear')}
              </button>
            </div>
          )}
          <table className="w-full text-sm" data-testid="reverse-asin-table">
            <thead className="bg-white">
              <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide border-b border-zinc-200">
                <th className="text-left px-3 py-2 w-9">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label={t('reverseAsin.table.selectAll')}
                    data-testid="reverse-asin-select-all"
                  />
                </th>
                <th className="text-left px-2 py-2 font-medium">
                  {t('reverseAsin.table.keyword')}
                </th>
                <th className="text-right px-2 py-2 font-medium">
                  {t('reverseAsin.table.volume')}
                </th>
                <th className="text-right px-2 py-2 font-medium">
                  {t('reverseAsin.table.competing')}
                </th>
                <th className="text-right px-3 py-2 font-medium">
                  {t('reverseAsin.table.clicks')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={`${row.keyword}-${idx}`}
                  className="border-b border-zinc-100 hover:bg-zinc-50/60"
                  data-testid={`reverse-asin-row-${idx}`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIdx.has(idx)}
                      onChange={() => toggleOne(idx)}
                      aria-label={t('reverseAsin.table.selectRow', {
                        keyword: row.keyword,
                      })}
                      data-testid={`reverse-asin-row-checkbox-${idx}`}
                    />
                  </td>
                  <td className="px-2 py-2 text-zinc-900 font-mono">
                    {row.keyword}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-zinc-700">
                    {fmtNumber(row.searchVolume)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-zinc-700">
                    {fmtNumber(row.competingProducts)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-700">
                    {fmtNumber(row.estimatedClicks)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sendModalOpen && (
        <SendToAdGroupModal
          keywords={selectedKeywords}
          onClose={() => setSendModalOpen(false)}
          onDone={() => {
            setSendModalOpen(false);
            setSelectedIdx(new Set());
          }}
        />
      )}
      {negativeModalOpen && (
        <AddToNegativesModal
          keywords={selectedKeywords}
          onClose={() => setNegativeModalOpen(false)}
          onDone={() => {
            setNegativeModalOpen(false);
            setSelectedIdx(new Set());
          }}
        />
      )}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Send-to-ad-group modal.
//
// Loads candidate ad groups from `metricsApi.summaryByCampaign` →
// `adGroupsApi.listByCampaign` (same harvest pattern as searchTerms MoveModal).
// Submits via `targetsApi.createKeywordsBulk` (loops POST per keyword — backend
// doesn't yet have a single endpoint to add a batch of arbitrary keywords).
// ────────────────────────────────────────────────────────────────────────────

const SendToAdGroupModal: React.FC<{
  keywords: ReverseAsinKeyword[];
  onClose: () => void;
  onDone: () => void;
}> = ({ keywords, onClose, onDone }) => {
  const { t } = useTranslation('keywords');
  const toast = useToast();
  const [choices, setChoices] = useState<AdGroupChoice[] | null>(null);
  const [adGroupId, setAdGroupId] = useState<number | ''>('');
  const [matchType, setMatchType] = useState<MatchType>('exact');
  const [bid, setBid] = useState('0.75');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const summary = await metricsApi.summaryByCampaign({ activeOnly: true });
        // Limit to a sensible number of campaigns so we don't spam the
        // backend with /ad-groups requests for stale archives.
        const candidates = summary.campaigns.slice(0, 12);
        const groups: AdGroupChoice[] = [];
        for (const c of candidates) {
          try {
            const ags = await adGroupsApi.listByCampaign(c.campaign_id);
            for (const ag of ags) {
              groups.push({
                id: ag.id,
                campaignId: c.campaign_id,
                campaignName: c.campaign_name,
                name: ag.name,
              });
            }
          } catch {
            // Auto-targeting campaigns can 404 on /ad-groups — skip them.
          }
        }
        if (!cancelled) setChoices(groups);
      } catch (err) {
        if (!cancelled) {
          setChoices([]);
          toast.error(
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : String(err),
          );
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adGroupId === '') return;
    setSubmitting(true);
    try {
      const bidNum = Number(bid);
      const safeBid = Number.isFinite(bidNum) && bidNum > 0 ? bidNum : 0.75;
      const results = await targetsApi.createKeywordsBulk(
        Number(adGroupId),
        keywords.map((k) => k.keyword),
        matchType,
        safeBid,
      );
      const ok = results.filter((r) => r.ok).length;
      const failed = results.length - ok;
      if (failed > 0) {
        toast.error(
          t('reverseAsin.bulk.sendError', {
            message: `${failed} of ${results.length} failed`,
          }),
        );
      } else {
        toast.success(t('reverseAsin.bulk.sendSuccess', { count: ok }));
      }
      onDone();
    } catch (err) {
      toast.error(
        t('reverseAsin.bulk.sendError', {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const grouped = useMemo(() => {
    if (!choices) return [];
    const map = new Map<number, { name: string; groups: AdGroupChoice[] }>();
    for (const g of choices) {
      if (!map.has(g.campaignId)) {
        map.set(g.campaignId, { name: g.campaignName, groups: [] });
      }
      map.get(g.campaignId)?.groups.push(g);
    }
    return Array.from(map.values());
  }, [choices]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4"
      data-testid="reverse-asin-send-modal"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={submit}
        className="bg-white rounded-lg shadow-xl border border-zinc-200 w-[460px] p-5 space-y-4"
      >
        <h2 className="text-sm font-semibold text-zinc-900">
          {t('reverseAsin.sendModal.title', { count: keywords.length })}
        </h2>
        <div>
          <label className="block text-[11px] font-medium text-zinc-700 mb-1">
            {t('reverseAsin.sendModal.adGroupLabel')}
          </label>
          {choices == null ? (
            <div className="flex items-center gap-2 h-9 px-3 text-xs text-zinc-500">
              <Loader2 size={12} className="animate-spin" />
              {t('reverseAsin.sendModal.loadingChoices')}
            </div>
          ) : choices.length === 0 ? (
            <p className="text-xs text-zinc-500">
              {t('reverseAsin.sendModal.noChoices')}
            </p>
          ) : (
            <select
              value={adGroupId}
              onChange={(e) =>
                setAdGroupId(e.target.value === '' ? '' : Number(e.target.value))
              }
              className="w-full h-9 px-2 text-sm rounded-md border border-zinc-200 bg-white text-zinc-900"
              data-testid="reverse-asin-adgroup-select"
              required
            >
              <option value="">
                {t('reverseAsin.sendModal.adGroupPlaceholder')}
              </option>
              {grouped.map((cg) => (
                <optgroup key={cg.name} label={cg.name}>
                  {cg.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-zinc-700 mb-1">
              {t('reverseAsin.sendModal.matchTypeLabel')}
            </label>
            <div className="inline-flex bg-white border border-zinc-200 rounded-md p-0.5 w-full">
              {(['exact', 'phrase', 'broad'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMatchType(m)}
                  className={`flex-1 h-7 text-xs font-medium rounded transition-colors ${matchType === m ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:text-zinc-900'}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-zinc-700 mb-1">
              {t('reverseAsin.sendModal.bidLabel')}
            </label>
            <input
              type="number"
              min="0.02"
              step="0.01"
              value={bid}
              onChange={(e) => setBid(e.target.value)}
              placeholder={t('reverseAsin.sendModal.bidPlaceholder')}
              className="w-full h-9 px-3 text-sm rounded-md border border-zinc-200 bg-white text-zinc-900"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-8 px-3 text-xs rounded-md border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
          >
            {t('reverseAsin.sendModal.cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting || adGroupId === '' || (choices?.length ?? 0) === 0}
            className="inline-flex items-center gap-1.5 h-8 px-4 text-xs rounded-md bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50"
            data-testid="reverse-asin-send-submit"
          >
            {submitting && <Loader2 size={12} className="animate-spin" />}
            {submitting
              ? t('reverseAsin.bulk.sending')
              : t('reverseAsin.sendModal.submit')}
          </button>
        </div>
      </form>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Add-to-negatives modal.
//
// Lists negative lists from `negativeListsApi.list({includeGlobal: true})`.
// Submits via per-list addItem POSTs (negativeListsApi doesn't yet have a bulk
// endpoint that accepts raw keyword strings; the existing /targets/bulk-add-
// negative endpoint requires target_ids which we don't have for these mined
// keywords). One POST per keyword is acceptable for the <50-item batches
// these flows produce in practice.
// ────────────────────────────────────────────────────────────────────────────

const AddToNegativesModal: React.FC<{
  keywords: ReverseAsinKeyword[];
  onClose: () => void;
  onDone: () => void;
}> = ({ keywords, onClose, onDone }) => {
  const { t } = useTranslation('keywords');
  const toast = useToast();
  const [lists, setLists] = useState<NegativeList[] | null>(null);
  const [listId, setListId] = useState<number | ''>('');
  const [matchType, setMatchType] = useState<'exact' | 'phrase'>('exact');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    negativeListsApi
      .list({ includeGlobal: true })
      .then((data) => {
        if (!cancelled) setLists(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setLists([]);
          toast.error(
            err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (listId === '') return;
    setSubmitting(true);
    try {
      // Bulk POST via existing /api/negative-lists/:id/items endpoint.
      // Backend handles deduping internally and reports `added` count back.
      const res = await negativeListsApi.addItems(
        Number(listId),
        keywords.map((k) => ({
          keyword: k.keyword,
          matchType,
        })),
      );
      const added = typeof res.added === 'number' ? res.added : keywords.length;
      toast.success(t('reverseAsin.bulk.negativeSuccess', { count: added }));
      onDone();
    } catch (err) {
      toast.error(
        t('reverseAsin.bulk.negativeError', {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4"
      data-testid="reverse-asin-negative-modal"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={submit}
        className="bg-white rounded-lg shadow-xl border border-zinc-200 w-[440px] p-5 space-y-4"
      >
        <h2 className="text-sm font-semibold text-zinc-900">
          {t('reverseAsin.negativeModal.title', { count: keywords.length })}
        </h2>
        <div>
          <label className="block text-[11px] font-medium text-zinc-700 mb-1">
            {t('reverseAsin.negativeModal.listLabel')}
          </label>
          {lists == null ? (
            <div className="flex items-center gap-2 h-9 px-3 text-xs text-zinc-500">
              <Loader2 size={12} className="animate-spin" />
              {t('reverseAsin.sendModal.loadingChoices')}
            </div>
          ) : lists.length === 0 ? (
            <p className="text-xs text-zinc-500">
              {t('reverseAsin.negativeModal.noLists')}
            </p>
          ) : (
            <select
              value={listId}
              onChange={(e) =>
                setListId(e.target.value === '' ? '' : Number(e.target.value))
              }
              className="w-full h-9 px-2 text-sm rounded-md border border-zinc-200 bg-white text-zinc-900"
              data-testid="reverse-asin-list-select"
              required
            >
              <option value="">
                {t('reverseAsin.negativeModal.listPlaceholder')}
              </option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className="block text-[11px] font-medium text-zinc-700 mb-1">
            {t('reverseAsin.negativeModal.matchTypeLabel')}
          </label>
          <div className="inline-flex bg-white border border-zinc-200 rounded-md p-0.5">
            {(['exact', 'phrase'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMatchType(m)}
                className={`px-3 h-7 text-xs font-medium rounded transition-colors ${matchType === m ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:text-zinc-900'}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-8 px-3 text-xs rounded-md border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
          >
            {t('reverseAsin.negativeModal.cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting || listId === '' || (lists?.length ?? 0) === 0}
            className="inline-flex items-center gap-1.5 h-8 px-4 text-xs rounded-md bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50"
            data-testid="reverse-asin-negative-submit"
          >
            {submitting && <Loader2 size={12} className="animate-spin" />}
            {submitting
              ? t('reverseAsin.bulk.sending')
              : t('reverseAsin.negativeModal.submit')}
          </button>
        </div>
      </form>
    </div>
  );
};
