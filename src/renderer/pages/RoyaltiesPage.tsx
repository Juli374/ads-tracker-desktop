import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Cloud, HardDrive, Loader2, Trash2, Upload } from 'lucide-react';
import { ApiError } from '../api/client';
import {
  royaltiesApi,
  type RoyaltyUpload,
  type RoyaltySummary,
} from '../api/royalties';
import {
  localRoyaltyApi,
  type LocalRoyaltyUpload,
} from '../api/localRoyalty';
import {
  Card,
  EmptyState,
  ErrorBanner,
  Kpi,
  LoadingRow,
  PageHeader,
} from '../components/ui';
import { fmtMoney, fmtNumber } from '../lib/format';
import { useToast } from '../contexts/ToastContext';

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

export const RoyaltiesPage: React.FC = () => {
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage?.setItem(STORAGE_KEY, source);
  }, [source]);

  // При смене источника подгружаем filePath (только в local).
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
        toast.error(err instanceof ApiError ? err.message : 'Не удалось загрузить royalty');
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
        toast.error(err instanceof ApiError ? err.message : 'Не удалось загрузить summary');
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
    if (!confirm('Удалить локальный импорт? Records внутри тоже удалятся.')) return;
    try {
      await localRoyaltyApi.delete(id);
      toast.success('Удалено');
      loadUploads();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось удалить');
    }
  };

  const handleSeed = async () => {
    if (source !== 'local') return;
    // Demo seed для проверки локального стора. Public-release импорт пойдёт
    // через парсер xlsx (TODO: порт royalty_import_service.py).
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
      toast.success(`Demo upload добавлен в локальную БД (${month})`);
      loadUploads();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось импортировать');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Royalty"
        subtitle={
          unsupported
            ? 'Источник недоступен'
            : uploads
            ? `${source === 'cloud' ? 'Cloud' : 'Local'} · ${uploads.length} импортов · ${months.length} месяцев`
            : 'Загрузка…'
        }
        rightSlot={
          <div className="flex items-center gap-2">
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
                aria-label="Месяц"
              >
                {months.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
          </div>
        }
      />

      {unsupported && source === 'cloud' && (
        <ErrorBanner message="Endpoint /api/royalties/uploads вернул 401/403/404." />
      )}
      {unsupported && source === 'local' && (
        <ErrorBanner message="Локальный royalty store недоступен (renderer запущен без preload)." />
      )}

      {!unsupported && source === 'local' && filePath && (
        <div className="text-[11px] text-zinc-400 font-mono px-1">
          local-db: {filePath}
        </div>
      )}

      {!unsupported && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Kpi
              label="Units (период)"
              value={fmtNumber(monthTotals.units)}
              loading={summaryLoading && !uploads}
            />
            <Kpi
              label="Royalty"
              value={fmtMoney(monthTotals.royalty)}
              loading={summaryLoading && !uploads}
            />
            <Kpi
              label="Revenue"
              value={fmtMoney(monthTotals.revenue)}
              loading={summaryLoading && !uploads}
            />
          </div>

          <Card
            title={
              <span className="inline-flex items-center gap-2">
                <Calendar size={13} className="text-zinc-400" />
                Импорты {selectedMonth ? `· ${selectedMonth}` : ''}
                {summaryLoading && (
                  <Loader2 size={11} className="animate-spin text-zinc-400" />
                )}
              </span>
            }
            rightSlot={
              source === 'local' ? (
                <button
                  type="button"
                  onClick={handleSeed}
                  className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-medium text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors"
                  title="Добавить demo upload в локальную БД"
                >
                  <Upload size={11} />
                  Demo seed
                </button>
              ) : null
            }
          >
            {loading && !uploads ? (
              <LoadingRow />
            ) : monthUploads.length === 0 ? (
              <EmptyState
                title="Нет импортов за этот месяц"
                hint={
                  source === 'cloud'
                    ? 'Загрузить KDP-отчёт можно в веб-версии (Settings → Royalty Import).'
                    : 'Импорт xlsx будет порт-портирован из royalty_import_service.py при public-release.'
                }
              />
            ) : (
              <table className="w-full text-sm table-sticky-head">
                <thead>
                  <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                    <th className="text-left px-5 py-2 font-medium">MP</th>
                    <th className="text-left px-3 py-2 font-medium">Аккаунт</th>
                    <th className="text-right px-3 py-2 font-medium">Units</th>
                    <th className="text-right px-3 py-2 font-medium">Royalty</th>
                    <th className="text-right px-3 py-2 font-medium">Revenue</th>
                    <th className="text-right px-3 py-2 font-medium">Загружен</th>
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
                            aria-label={`Удалить upload ${u.id}`}
                            title="Удалить"
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
    </div>
  );
};

const SourceToggle: React.FC<{
  value: Source;
  onChange: (v: Source) => void;
}> = ({ value, onChange }) => (
  <div role="radiogroup" aria-label="Источник royalty"
    className="inline-flex items-center bg-zinc-100 rounded-md p-0.5"
  >
    {(
      [
        { id: 'cloud' as const, label: 'Cloud', icon: Cloud },
        { id: 'local' as const, label: 'Local', icon: HardDrive },
      ]
    ).map((opt) => {
      const Icon = opt.icon;
      const active = value === opt.id;
      return (
        <button
          key={opt.id}
          role="radio"
          aria-checked={active}
          aria-label={`Источник: ${opt.label}`}
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

function autoSelectMonth(
  uploads: NormalizedUpload[],
  setMonth: (m: string | null) => void,
) {
  const months = Array.from(
    new Set(uploads.map((u) => u.target_month).filter(Boolean)),
  )
    .sort()
    .reverse();
  setMonth(months[0] ?? null);
}
