import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { localRoyaltyApi, type LocalRoyaltyParseResult } from '../../api/localRoyalty';
import { useToast } from '../../contexts/ToastContext';
import { fmtMoney, fmtNumber } from '../../lib/format';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '../ui';

interface Props {
  /** Pre-selected month (YYYY-MM) — defaults to current. */
  defaultMonth?: string;
  onClose(): void;
  onImported(): void;
}

const MONTH_RE = /^\d{4}-\d{2}$/;
const MARKETPLACE_RE = /^[A-Z]{2,8}$/;

const currentMonth = (): string => new Date().toISOString().slice(0, 7);

/**
 * Three-step modal: pick file → preview parsed rows → confirm import.
 * Uses native dialog on main side to read the file, parses on main,
 * and ships the parsed records back through the existing localRoyalty.import IPC.
 */
export const ImportRoyaltyModal: React.FC<Props> = ({
  defaultMonth,
  onClose,
  onImported,
}) => {
  const { t } = useTranslation('royalties');
  const toast = useToast();

  const [step, setStep] = useState<'idle' | 'loading' | 'preview' | 'submitting'>('idle');
  const [parsed, setParsed] = useState<LocalRoyaltyParseResult | null>(null);
  const [marketplace, setMarketplace] = useState('USA');
  const [targetMonth, setTargetMonth] = useState(defaultMonth ?? currentMonth());
  const [accountName, setAccountName] = useState('Local KDP');

  // Auto-trigger picker on first mount.
  useEffect(() => {
    let cancelled = false;
    const pick = async () => {
      setStep('loading');
      try {
        const res = await window.api.dialog.openFile({
          title: t('import.pickerTitle'),
          filters: [
            { name: 'KDP report', extensions: ['xlsx', 'csv'] },
            { name: 'All files', extensions: ['*'] },
          ],
        });
        if (cancelled) return;
        if (!res.path) {
          // User cancelled the picker — close the modal.
          onClose();
          return;
        }
        const result = await localRoyaltyApi.parseFile(res.path);
        if (cancelled) return;
        if (result.records.length === 0) {
          toast.error(t('import.noRecords'));
          onClose();
          return;
        }
        setParsed(result);
        setStep('preview');
      } catch (err) {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : t('import.parseFailed'));
        onClose();
      }
    };
    pick();
    return () => {
      cancelled = true;
    };
  }, []); // intentional: picker should run exactly once on mount

  const handleConfirm = async () => {
    if (!parsed) return;
    if (!MONTH_RE.test(targetMonth)) {
      toast.error(t('import.errors.monthFormat'));
      return;
    }
    if (!MARKETPLACE_RE.test(marketplace)) {
      toast.error(t('import.errors.marketplaceFormat'));
      return;
    }
    setStep('submitting');
    try {
      const res = await localRoyaltyApi.import({
        account_id: 1,
        account_name: accountName.trim() || 'Local',
        marketplace,
        target_month: targetMonth,
        source_filename: parsed.source_path.split(/[/\\]/).pop(),
        records: parsed.records,
      });
      toast.success(t('import.success', { count: res.records_added }));
      onImported();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('import.errors.importFailed'));
      setStep('preview');
    }
  };

  return (
    <Modal
      open
      onClose={() => step !== 'submitting' && onClose()}
      size="xl"
      ariaLabel={t('import.title')}
      closeOnEsc={step !== 'submitting'}
      closeOnOverlay={step !== 'submitting'}
      data-testid="royalty-import-modal"
    >
      <ModalHeader
        title={
          <span className="inline-flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-zinc-500" />
            {t('import.title')}
          </span>
        }
        onClose={() => step !== 'submitting' && onClose()}
      />

      {(step === 'idle' || step === 'loading') && (
        <div className="px-5 py-10 flex items-center justify-center text-xs text-zinc-500">
          <Loader2 size={14} className="animate-spin mr-2" />
          {t('import.loading')}
        </div>
      )}

      {(step === 'preview' || step === 'submitting') && parsed && (
        <>
          <ModalBody className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <label className="block text-xs">
                  <span className="block mb-1 text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                    {t('import.fields.month')}
                  </span>
                  <input
                    type="text"
                    value={targetMonth}
                    onChange={(e) => setTargetMonth(e.target.value)}
                    placeholder="YYYY-MM"
                    className="h-8 w-full px-2 rounded-md border border-zinc-200 text-xs focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                    data-testid="royalty-import-month"
                  />
                </label>
                <label className="block text-xs">
                  <span className="block mb-1 text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                    {t('import.fields.marketplace')}
                  </span>
                  <input
                    type="text"
                    value={marketplace}
                    onChange={(e) => setMarketplace(e.target.value.toUpperCase())}
                    className="h-8 w-full px-2 rounded-md border border-zinc-200 text-xs uppercase focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                    data-testid="royalty-import-mp"
                  />
                </label>
                <label className="block text-xs">
                  <span className="block mb-1 text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                    {t('import.fields.account')}
                  </span>
                  <input
                    type="text"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    className="h-8 w-full px-2 rounded-md border border-zinc-200 text-xs focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                  />
                </label>
              </div>

              {parsed.warnings.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 space-y-0.5">
                  <div className="inline-flex items-center gap-1.5 font-medium">
                    <AlertTriangle size={11} />
                    {t('import.warnings')}
                  </div>
                  <ul className="list-disc pl-5">
                    {parsed.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="text-[11px] text-zinc-500">
                {t('import.detected', {
                  format: parsed.format,
                  count: parsed.records.length,
                })}
              </div>

              <div className="max-h-72 overflow-y-auto rounded-md border border-zinc-200">
                <table className="w-full text-sm" data-testid="royalty-import-preview">
                  <thead className="sticky top-0 bg-zinc-50 border-b border-zinc-200">
                    <tr className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
                      <th className="text-left px-3 py-2">{t('th.asin')}</th>
                      <th className="text-left px-3 py-2">{t('th.book')}</th>
                      <th className="text-right px-3 py-2">{t('th.units')}</th>
                      <th className="text-right px-3 py-2">{t('th.royalty')}</th>
                      <th className="px-3 py-2 text-right">{t('th.currency')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.records.slice(0, 100).map((r, i) => (
                      <tr key={i} className="border-t border-zinc-100">
                        <td className="px-3 py-1.5 text-xs text-zinc-900 font-mono">{r.asin ?? '—'}</td>
                        <td className="px-3 py-1.5 text-xs text-zinc-700 truncate max-w-[260px]">
                          {r.book_title ?? '—'}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-zinc-900 text-right tabular-nums">
                          {fmtNumber(r.units)}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-zinc-900 text-right tabular-nums">
                          {fmtMoney(r.royalty)}
                        </td>
                        <td className="px-3 py-1.5 text-[10px] text-zinc-500 text-right">{r.currency ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsed.records.length > 100 && (
                  <div className="px-3 py-1.5 text-[10px] text-zinc-400 border-t border-zinc-100">
                    {t('import.previewTruncated', { shown: 100, total: parsed.records.length })}
                  </div>
                )}
              </div>
          </ModalBody>

          <ModalFooter>
            <button
              type="button"
              onClick={onClose}
              disabled={step === 'submitting'}
              className="h-8 px-3 text-xs font-medium rounded-md text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors disabled:opacity-50"
            >
              {t('import.cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={step === 'submitting'}
              className="h-8 px-4 text-xs font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-800 transition-colors flex items-center gap-1.5 disabled:opacity-50"
              data-testid="royalty-import-confirm"
            >
              {step === 'submitting' && <Loader2 size={12} className="animate-spin" />}
              <Upload size={11} />
              {step === 'submitting' ? t('import.importing') : t('import.confirm')}
            </button>
          </ModalFooter>
        </>
      )}
    </Modal>
  );
};
