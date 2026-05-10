import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X } from 'lucide-react';
import { booksApi, Book } from '../../api/books';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import { useEscapeClose } from '../../lib/useEscapeClose';

interface Props {
  book: Book;
  onClose(): void;
  onDone(): void;
}

export const DeleteBookModal: React.FC<Props> = ({ book, onClose, onDone }) => {
  const { t } = useTranslation('books');
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);

  useEscapeClose(() => {
    if (!submitting) onClose();
  });

  const handleArchive = async () => {
    setSubmitting(true);
    try {
      await booksApi.archive(book.id);
      toast.success(t('modals.delete.archive'));
      onDone();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('modals.delete.errors.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-zinc-900/20 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('modals.delete.title')}
      data-testid="book-delete-modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="w-full max-w-sm bg-white border border-zinc-200 rounded-xl shadow-card overflow-hidden">
        <div className="px-5 pt-5 pb-3 border-b border-zinc-100 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-zinc-900">{t('modals.delete.title')}</h2>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="text-zinc-400 hover:text-zinc-700 transition-colors"
            aria-label={t('modals.delete.cancel')}
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-zinc-700">{t('modals.delete.confirm')}</p>
          <div className="text-sm font-medium text-zinc-900 truncate">{book.title}</div>
          <p className="text-xs text-zinc-500">{t('modals.delete.archiveHint')}</p>
        </div>
        <div className="px-5 py-3 border-t border-zinc-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-8 px-3 text-xs font-medium rounded-md text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors disabled:opacity-50"
          >
            {t('modals.delete.cancel')}
          </button>
          <button
            type="button"
            onClick={handleArchive}
            disabled={submitting}
            className="h-8 px-4 text-xs font-medium rounded-md bg-amber-600 text-white hover:bg-amber-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {submitting && <Loader2 size={12} className="animate-spin" />}
            {t('modals.delete.archive')}
          </button>
        </div>
      </div>
    </div>
  );
};
