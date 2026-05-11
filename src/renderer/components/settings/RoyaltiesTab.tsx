import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Cloud, FileSpreadsheet, HardDrive, Loader2, Trash2, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../api/client';
import {
  royaltiesApi,
  type RoyaltyUpload,
  type RoyaltySummary,
} from '../../api/royalties';
import {
  localRoyaltyApi,
  type LocalRoyaltyUpload,
} from '../../api/localRoyalty';
import {
  Card,
  EmptyState,
  ErrorBanner,
  Kpi,
  LoadingRow,
} from '../ui';
import { fmtMoney, fmtNumber } from '../../lib/format';
import { useToast } from '../../contexts/ToastContext';
import { ImportRoyaltyModal } from './ImportRoyaltyModal';

type Source = 'cloud' | 'local';

interface NormalizedUpload {
  id: number;
  account_id: number;
  account_name?: string;
  marketplace: string;
  target_month: string;
  uploaded_at: string;
  total_units?: number;
  total_royalty?: number;
  total_revenue?: number;
}

const STORAGE_KEY = 'royalties:source';
const isSource = (s: string): s is Source => s === 'cloud' || s === 'local';

const fromCloud = (u: RoyaltyUpload): NormalizedUpload => u;
const fromLocal = (u: LocalRoyaltyUpload): NormalizedUpload => u;

function autoSelectMonth(
  uploads: NormalizedUpload[],
  setMonth: (m: string | null) => void,
): void {
  const months = Array.from(
    new Set(uploads.map((u) => u.target_month).filter(Boolean)),
  )
    .sort()
    .reverse();
  setMonth(months[0] ?? null);
}

export const RoyaltiesTab: React.FC = () => {
  const { t } = useTranslation('royalties');
  const toast = useToast();
  const [source, setSource] = useState<Source>(() => {
    if (typeof window === 'undefined') return 'cloud';
    const stored = window.localStorage?.getItem(STORAGE_KEY);
    return stored && isSource(stored) ? stored : 'cloud';
  });
  const [uploads, setUploads] = useState<NormalizedUpload[] | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [, setSummary] = useState<RoyaltySummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [filePath, setFilePath] = useState<string>('');
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage?.setItem(STORAGE_KEY, source);
  }, [source]);

  useEffect(() => {
    if (source !== 'local') {
      setFilePath('');
      return;
    }
    localRoyaltyApi.filePath().then(setFilePath).catch(() => setFilePath(''));
  }, [source]);

  const loadUploads = useMemo(
    () => async () => {
      setLoading(true);
      setUnsupported(false);
      setUploads(null);
      setSelectedMonth(null);
      try {
        if (source === 'cloud') {
          const list = await royaltiesApi.listUploads();
          const arr = Array.isArray(list) ? list.map(fromCloud) : [];
          setUploads(arr);
          autoSelectMonth(arr, setSelectedMonth);
        } else {
          if (!localRoyaltyApi.isAvailable()) {
            setUnsupported(true);
            setUploads([]);
            return;
          }
          const list = await localRoyaltyApi.listUploads();
          const arr = list.map(fromLocal);
          setUploads(arr);
          autoSelectMonth(arr, setSelectedMonth);
        }
      } catch (err) {
        if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
          setUnsupported(true);
          setUploads([]);
          return;
        }
        toast.error(err instanceof ApiError ? err.message : t('errors.load'));
        setUploads([]);
      } finally {
        setLoading(false);
      }
    },
    [source, toast],
  );

  useEffect(() => {
    loadUploads();
  }, [loadUploads]);

  useEffect(() => {
    if (!selectedMonth) return;
    let cancelled = false;
    setSummaryLoading(true);
    const fetcher =
      source === 'cloud'
        ? royaltiesApi.getSummary(selectedMonth)
        : localRoyaltyApi.getSummary(selectedMonth);
    Promise.resolve(fetcher)
      .then((res) => {
        if (cancelled) return;
        setSummary(res as RoyaltySummary | null);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
          setSummary(null);
          return;
        }
        toast.error(err instanceof ApiError ? err.message : t('errors.loadSummary'));
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMonth, source, toast]);

  const months = useMemo(() => {
    if (!uploads) return [];
    return Array.from(new Set(uploads.map((u) => u.target_month).filter(Boolean)))
      .sort()
      .reverse();
  }, [uploads]);

  const monthUploads = useMemo(() => {
    if (!uploads || !selectedMonth) return [];
    return uploads.filter((u) => u.target_month === selectedMonth);
  }, [uploads, selectedMonth]);

  const monthTotals = useMemo(() => {
    return monthUploads.reduce(
      (a, u) => ({
        units: a.units + (u.total_units ?? 0),
        royalty: a.royalty + (u.total_royalty ?? 0),
        revenue: a.revenue + (u.total_revenue ?? 0),
      }),
      { units: 0, royalty: 0, revenue: 0 },
    );
  }, [monthUploads]);

  const handleDelete = async (id: number) => {
    if (source !== 'local') return;
    if (!confirm(t('row.deleteConfirm'))) return;
    try {
      await localRoyaltyApi.delete(id);
      toast.success(t('row.deleted'));
      loadUploads();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('errors.deleteFailed'));
    }
  };

  const handleSeed = async () => {
    if (source !== 'local') return;
    const month = new Date().toISOString().slice(0, 7);
    try {
      await localRoyaltyApi.import({
        account_id: 1,
        account_name: 'Demo',
        marketplace: 'USA',
        target_month: month,
        source_filename: 'demo.xlsx',
        records: [
          {
            asin: 'B0DEMO001',
            book_title: 'Local demo book',
            units: 42,
            royalty: 168.5,
            revenue: 504,
            currency: 'USD',
          },
        ],
      });
      toast.success(t('card.demoSeedSuccess', { month }));
      loadUploads();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('errors.importFailed'));
    }
  };

  return (
    <div className="space-y-6" data-testid="settings-royalties-tab">
      {unsupported && source === 'cloud' && (
        <ErrorBanner message={t('errors.cloudUnavailable')} />
      )}
      {unsupported && source === 'local' && (
        <ErrorBanner message={t('errors.localUnavailable')} />
      )}

      {!unsupported && source === 'local' && filePath && (
        <div className="text-[11px] text-zinc-400 font-mono px-1">
          {t('localDbPrefix', { path: filePath })}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <SourceToggle value={source} onChange={setSource} />
        {months.length > 0 && (
          <select
            value={selectedMonth ?? ''}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="
              h-7 pl-2 pr-7 text-xs rounded-md cursor-pointer
              border border-zinc-200 bg-white text-zinc-700
              focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
            "
            aria-label={t('monthAria')}
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
      </div>

      {!unsupported && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Kpi
              label={t('kpi.units')}
              value={fmtNumber(monthTotals.units)}
              loading={summaryLoading && !uploads}
            />
            <Kpi
              label={t('kpi.royalty')}
              value={fmtMoney(monthTotals.royalty)}
              loading={summaryLoading && !uploads}
            />
            <Kpi
              label={t('kpi.revenue')}
              value={fmtMoney(monthTotals.revenue)}
              loading={summaryLoading && !uploads}
            />
          </div>

          <Card
            title={
              <span className="inline-flex items-center gap-2">
                <Calendar size={13} className="text-zinc-400" />
                {t('card.title', { month: selectedMonth ?? 'none' })}
                {summaryLoading && (
                  <Loader2 size={11} className="animate-spin text-zinc-400" />
                )}
              </span>
            }
            rightSlot={
              source === 'local' ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setImportOpen(true)}
                    className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-medium text-white bg-zinc-900 hover:bg-zinc-800 transition-colors"
                    title={t('card.importTitle')}
                    data-testid="royalty-import-btn"
                  >
                    <FileSpreadsheet size={11} />
                    {t('card.import')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSeed}
                    className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-medium text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors"
                    title={t('card.demoSeedTitle')}
                  >
                    <Upload size={11} />
                    {t('card.demoSeed')}
                  </button>
                </div>
              ) : null
            }
          >
            {loading && !uploads ? (
              <LoadingRow />
            ) : monthUploads.length === 0 ? (
              <EmptyState
                title={t('empty.title')}
                hint={source === 'cloud' ? t('empty.hintCloud') : t('empty.hintLocal')}
              />
            ) : (
              <table className="w-full text-sm table-sticky-head">
                <thead>
                  <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                    <th className="text-left px-5 py-2 font-medium">{t('th.marketplace')}</th>
                    <th className="text-left px-3 py-2 font-medium">{t('th.account')}</th>
                    <th className="text-right px-3 py-2 font-medium">{t('th.units')}</th>
                    <th className="text-right px-3 py-2 font-medium">{t('th.royalty')}</th>
                    <th className="text-right px-3 py-2 font-medium">{t('th.revenue')}</th>
                    <th className="text-right px-3 py-2 font-medium">{t('th.uploadedAt')}</th>
                    {source === 'local' && <th className="px-5 py-2 w-10"></th>}
                  </tr>
                </thead>
                <tbody>
                  {monthUploads.map((u) => (
                    <tr key={u.id} className="group border-t border-zinc-100 hover:bg-zinc-50/60">
                      <td className="px-5 py-2.5 text-xs text-zinc-900 uppercase font-medium">
                        {u.marketplace || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-zinc-700">
                        {u.account_name ?? `#${u.account_id}`}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-zinc-900 text-right tabular-nums">
                        {fmtNumber(u.total_units)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-zinc-900 text-right tabular-nums">
                        {fmtMoney(u.total_royalty)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-zinc-700 text-right tabular-nums">
                        {fmtMoney(u.total_revenue)}
                      </td>
                      <td className="px-3 py-2.5 text-[10px] text-zinc-500 text-right">
                        {(u.uploaded_at ?? '').slice(0, 10)}
                      </td>
                      {source === 'local' && (
                        <td className="px-5 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleDelete(u.id)}
                            className="
                              h-6 w-6 flex items-center justify-center rounded
                              text-zinc-400 hover:text-red-600 hover:bg-red-50
                              opacity-0 group-hover:opacity-100 transition-opacity
                            "
                            aria-label={t('row.deleteAria', { id: u.id })}
                            title={t('row.deleteTitle')}
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}

      {importOpen && (
        <ImportRoyaltyModal
          defaultMonth={selectedMonth ?? undefined}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            setImportOpen(false);
            loadUploads();
          }}
        />
      )}
    </div>
  );
};

const SourceToggle: React.FC<{
  value: Source;
  onChange: (v: Source) => void;
}> = ({ value, onChange }) => {
  const { t } = useTranslation('royalties');
  return (
    <div
      role="radiogroup"
      aria-label={t('source.ariaLabel')}
      className="inline-flex items-center bg-zinc-100 rounded-md p-0.5"
    >
      {(
        [
          { id: 'cloud' as const, label: t('sourceLabel.cloud'), icon: Cloud },
          { id: 'local' as const, label: t('sourceLabel.local'), icon: HardDrive },
        ]
      ).map((opt) => {
        const Icon = opt.icon;
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            role="radio"
            aria-checked={active}
            aria-label={t('source.aria', { label: opt.label })}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`
              inline-flex items-center gap-1.5 px-2.5 h-6 text-[11px] font-medium rounded
              transition-colors
              ${active ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'}
            `}
          >
            <Icon size={11} />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
