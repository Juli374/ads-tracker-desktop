import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import type { CoverQAReport } from '../../../shared/ipc';
import { analyzeCoverFile } from '../../api/coverQa';
import { useToast } from '../../contexts/ToastContext';
import { Modal, ModalBody, ModalFooter } from '../ui';

type Target = 'ebook' | 'print';

interface Props {
  /** Optional initial file (e.g. when re-using the modal inside UploadCoverModal). */
  initialFile?: File | null;
  /** Called when the user clicks Close. */
  onClose(): void;
  /**
   * Optional "Use anyway" CTA. When provided, a primary button appears that
   * forwards the inspected file back to the parent (used by UploadCoverModal
   * to proceed with the actual upload).
   */
  onProceed?(file: File): void;
  /** Override title — defaults to i18n key `books.modals.coverQa.title`. */
  title?: string;
}

/**
 * Cover QA modal.
 *
 * Standalone usage:
 *     <CoverQAModal onClose={...} />
 *
 * Embedded inside an upload flow:
 *     <CoverQAModal
 *       initialFile={file}
 *       onClose={...}
 *       onProceed={(file) => upload(file)}
 *     />
 *
 * The QA runs in main process via `window.api.coverQa.check`. No HTTP, no
 * auth — analysis is fully local and shipped tier-free for virality.
 */
export const CoverQAModal: React.FC<Props> = ({ initialFile, onClose, onProceed, title }) => {
  const { t } = useTranslation('books');
  const toast = useToast();
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [target, setTarget] = useState<Target>('ebook');
  const [report, setReport] = useState<CoverQAReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Generate / revoke object URL whenever the picked file changes.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Auto-run QA whenever file or target changes.
  useEffect(() => {
    let cancelled = false;
    if (!file) {
      setReport(null);
      return;
    }
    setLoading(true);
    setReport(null);
    analyzeCoverFile(file, target)
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : t('modals.coverQa.error');
        toast.error(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file, target, t, toast]);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      setFile(dropped);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleProceed = () => {
    if (file && onProceed) onProceed(file);
  };

  // Counts for the summary line.
  const errors = report?.checks.filter((c) => !c.passed && c.severity === 'error').length ?? 0;
  const warnings = report?.checks.filter((c) => !c.passed && c.severity === 'warning').length ?? 0;
  const passed = report?.checks.filter((c) => c.passed).length ?? 0;

  return (
    <Modal
      open
      onClose={() => !loading && onClose()}
      size="xl"
      title={title ?? t('modals.coverQa.title')}
      ariaLabel={title ?? t('modals.coverQa.title')}
      closeOnEsc={!loading}
      closeOnOverlay={!loading}
      data-testid="cover-qa-modal"
    >
      <ModalBody className="flex-1 overflow-y-auto px-5 py-4 space-y-4 max-h-[70vh]">
          {/* Target toggle */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-500">{t('modals.coverQa.target')}</span>
            <div className="inline-flex items-center bg-white border border-zinc-200 rounded-md p-0.5">
              {(['ebook', 'print'] as Target[]).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setTarget(opt)}
                  className={`px-2 h-6 text-[11px] font-medium rounded transition-colors ${
                    target === opt
                      ? 'bg-zinc-100 text-zinc-900'
                      : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                  data-testid={`cover-qa-target-${opt}`}
                >
                  {t(`modals.coverQa.targets.${opt}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Drop zone / file picker */}
          {!file && (
            <div
              ref={dropRef}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => inputRef.current?.click()}
              className="w-full h-32 border-2 border-dashed border-zinc-200 rounded-lg flex items-center justify-center text-xs text-zinc-500 hover:border-zinc-400 transition-colors cursor-pointer"
              data-testid="cover-qa-dropzone"
            >
              {t('modals.coverQa.dropzone')}
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            data-testid="cover-qa-file-input"
          />

          {/* Preview + report */}
          {file && (
            <div className="grid grid-cols-[140px_1fr] gap-4">
              <div className="space-y-2">
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt=""
                    className="w-full h-auto object-contain rounded border border-zinc-100"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="text-[11px] text-zinc-500 hover:text-zinc-900 transition-colors w-full"
                >
                  {t('modals.coverQa.changeFile')}
                </button>
              </div>

              <div className="min-w-0 space-y-3">
                {loading && (
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <Loader2 size={14} className="animate-spin" />
                    {t('modals.coverQa.analysing')}
                  </div>
                )}

                {report && !loading && (
                  <>
                    {/* Summary */}
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-zinc-500">
                        {report.width}×{report.height} · {report.format.toUpperCase()} ·{' '}
                        {(report.fileSize / 1024).toFixed(0)} KB
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] font-medium">
                      {errors > 0 && (
                        <span className="text-red-600" data-testid="cover-qa-errors-count">
                          {t('modals.coverQa.summary.errors', { count: errors })}
                        </span>
                      )}
                      {warnings > 0 && (
                        <span className="text-amber-600" data-testid="cover-qa-warnings-count">
                          {t('modals.coverQa.summary.warnings', { count: warnings })}
                        </span>
                      )}
                      <span className="text-emerald-600" data-testid="cover-qa-passed-count">
                        {t('modals.coverQa.summary.passed', { count: passed })}
                      </span>
                    </div>

                    {/* Checks list */}
                    <ul className="space-y-2" data-testid="cover-qa-checks">
                      {report.checks.map((check) => (
                        <CheckRow key={check.id} check={check} />
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          )}
      </ModalBody>

      <ModalFooter>
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="h-8 px-3 text-xs font-medium rounded-md text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors disabled:opacity-50"
          data-testid="cover-qa-close"
        >
          {t('modals.coverQa.close')}
        </button>
        {onProceed && file && (
          <button
            type="button"
            onClick={handleProceed}
            disabled={loading}
            className="h-8 px-4 text-xs font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
            data-testid="cover-qa-proceed"
          >
            {errors > 0
              ? t('modals.coverQa.proceedAnyway')
              : t('modals.coverQa.proceed')}
          </button>
        )}
      </ModalFooter>
    </Modal>
  );
};

const CheckRow: React.FC<{ check: CoverQAReport['checks'][number] }> = ({ check }) => {
  const Icon = check.passed
    ? CheckCircle2
    : check.severity === 'error'
    ? AlertCircle
    : AlertTriangle;
  const color = check.passed
    ? 'text-emerald-600'
    : check.severity === 'error'
    ? 'text-red-600'
    : 'text-amber-600';
  return (
    <li
      className="flex items-start gap-2 text-xs"
      data-testid={`cover-qa-check-${check.id}`}
    >
      <Icon size={14} className={`flex-shrink-0 mt-0.5 ${color}`} />
      <div className="min-w-0 flex-1">
        <div className="text-zinc-900">{check.message}</div>
        {check.suggestion && (
          <div className="text-[11px] text-zinc-500 mt-0.5">{check.suggestion}</div>
        )}
      </div>
    </li>
  );
};
