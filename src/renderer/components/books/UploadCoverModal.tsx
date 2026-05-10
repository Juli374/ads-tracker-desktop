import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X } from 'lucide-react';
import { uploadFile } from '../../api/upload';
import { useToast } from '../../contexts/ToastContext';
import { useEscapeClose } from '../../lib/useEscapeClose';

interface Props {
  bookId: number;
  onClose(): void;
  onUploaded(): void;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // mirror src/main/ipc-handlers.ts

export const UploadCoverModal: React.FC<Props> = ({ bookId, onClose, onUploaded }) => {
  const { t } = useTranslation('books');
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEscapeClose(() => {
    if (!submitting) onClose();
  });

  const handlePick = (picked: File | null) => {
    if (!picked) {
      setFile(null);
      return;
    }
    if (picked.size > MAX_UPLOAD_BYTES) {
      toast.error(t('modals.uploadCover.tooLarge'));
      // Reset the <input> so picking the same file again still re-triggers onChange.
      if (inputRef.current) inputRef.current.value = '';
      setFile(null);
      return;
    }
    setFile(picked);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setSubmitting(true);
    try {
      await uploadFile(`/api/books/${bookId}/cover`, file, 'cover');
      toast.success(t('modals.uploadCover.save'));
      onUploaded();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      // Surface the main-process size error verbatim so QA sees it.
      toast.error(message || t('modals.uploadCover.error'));
    } finally {
      setSubmitting(false);
    }
  };

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
        className="w-full max-w-sm bg-white border border-zinc-200 rounded-xl shadow-card overflow-hidden"
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
        <div className="px-5 py-4 space-y-3">
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
            onChange={(e) => handlePick(e.target.files?.[0] ?? null)}
          />
          {file && (
            <img
              src={URL.createObjectURL(file)}
              alt=""
              className="h-32 mx-auto object-contain rounded border border-zinc-100"
            />
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
            disabled={submitting || !file}
            className="h-8 px-4 text-xs font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-800 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {submitting && <Loader2 size={12} className="animate-spin" />}
            {submitting ? t('modals.uploadCover.uploading') : t('modals.uploadCover.save')}
          </button>
        </div>
      </form>
    </div>
  );
};
