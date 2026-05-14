import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';
import type { CoverQAReport } from '../../../shared/ipc';
import { uploadFile } from '../../api/upload';
import { analyzeCoverFile } from '../../api/coverQa';
import { useToast } from '../../contexts/ToastContext';
import { useEscapeClose } from '../../lib/useEscapeClose';

interface Props {
  bookId: number;
  onClose(): void;
  onUploaded(): void;
}

export const UploadCoverModal: React.FC<Props> = ({ bookId, onClose, onUploaded }) => {
  const { t } = useTranslation('books');
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<CoverQAReport | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEscapeClose(() => {
    if (!submitting) onClose();
  });

  // Re-run cover QA whenever the user picks a new file. The QA itself is
  // local and shipped to all tiers, so we run it unconditionally.
  useEffect(() => {
    let cancelled = false;
    if (!file) {
      setReport(null);
      return;
    }
    setAnalysing(true);
    setReport(null);
    analyzeCoverFile(file, 'ebook')
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch(() => {
        // QA failures (corrupt image, unsupported format) shouldn't block the
        // upload — we just skip the preview. The backend has its own checks.
        if (!cancelled) setReport(null);
      })
      .finally(() => {
        if (!cancelled) setAnalysing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setSubmitting(true);
    try {
      await uploadFile(`/api/books/${bookId}/cover`, file, 'cover');
      toast.success(t('modals.uploadCover.save'));
      onUploaded();
      onClose();
    } catch {
      toast.error(t('modals.uploadCover.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const errors = report?.checks.filter((c) => !c.passed && c.severity === 'error').length ?? 0;
  const warnings = report?.checks.filter((c) => !c.passed && c.severity === 'warning').length ?? 0;
  const submitDisabled = submitting || !file;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-zinc-900/20 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('modals.uploadCover.title')}
      data-testid="book-upload-cover-modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white border border-zinc-200 rounded-xl shadow-card overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="px-5 pt-5 pb-3 border-b border-zinc-100 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-zinc-900">{t('modals.uploadCover.title')}</h2>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="text-zinc-400 hover:text-zinc-700 transition-colors"
            aria-label={t('modals.uploadCover.cancel')}
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full h-20 border-2 border-dashed border-zinc-200 rounded-lg flex items-center justify-center text-xs text-zinc-500 hover:border-zinc-400 transition-colors"
          >
            {file ? file.name : t('modals.uploadCover.picker')}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file && (
            <img
              src={URL.createObjectURL(file)}
              alt=""
              className="h-32 mx-auto object-contain rounded border border-zinc-100"
            />
          )}

          {/* Cover QA report */}
          {analysing && (
            <div
              className="flex items-center gap-2 text-xs text-zinc-500"
              data-testid="cover-qa-inline-loading"
            >
              <Loader2 size={12} className="animate-spin" />
              {t('modals.coverQa.analysing')}
            </div>
          )}
          {report && !analysing && (
            <div
              className="space-y-1.5 text-xs"
              data-testid="cover-qa-inline-report"
            >
              <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                <span>
                  {report.width}×{report.height} · {(report.fileSize / 1024).toFixed(0)} KB
                </span>
              </div>
              <ul className="space-y-1">
                {report.checks.map((check) => (
                  <li
                    key={check.id}
                    className="flex items-start gap-1.5 text-[11px]"
                    data-testid={`cover-qa-check-${check.id}`}
                  >
                    {check.passed ? (
                      <CheckCircle2 size={12} className="mt-0.5 flex-shrink-0 text-emerald-600" />
                    ) : check.severity === 'error' ? (
                      <AlertCircle size={12} className="mt-0.5 flex-shrink-0 text-red-600" />
                    ) : (
                      <AlertTriangle size={12} className="mt-0.5 flex-shrink-0 text-amber-600" />
                    )}
                    <span className="text-zinc-700">{check.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-zinc-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-8 px-3 text-xs font-medium rounded-md text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors disabled:opacity-50"
          >
            {t('modals.uploadCover.cancel')}
          </button>
          <button
            type="submit"
            disabled={submitDisabled}
            className="h-8 px-4 text-xs font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-800 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            data-testid="upload-cover-submit"
          >
            {submitting && <Loader2 size={12} className="animate-spin" />}
            {submitting
              ? t('modals.uploadCover.uploading')
              : errors > 0
              ? t('modals.uploadCover.uploadAnyway')
              : warnings > 0
              ? t('modals.uploadCover.uploadWithWarnings')
              : t('modals.uploadCover.save')}
          </button>
        </div>
      </form>
    </div>
  );
};
