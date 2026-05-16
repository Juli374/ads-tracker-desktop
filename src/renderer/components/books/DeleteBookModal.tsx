import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { booksApi, Book } from '../../api/books';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import { Modal, ModalBody, ModalFooter } from '../ui';

interface Props {
  book: Book;
  onClose(): void;
  onDone(): void;
}

export const DeleteBookModal: React.FC<Props> = ({ book, onClose, onDone }) => {
  const { t } = useTranslation('books');
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);

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
    <Modal
      open
      onClose={() => !submitting && onClose()}
      size="sm"
      title={t('modals.delete.title')}
      ariaLabel={t('modals.delete.title')}
      closeOnEsc={!submitting}
      closeOnOverlay={!submitting}
      data-testid="book-delete-modal"
    >
      <ModalBody className="px-5 py-4 space-y-3">
        <p className="text-sm text-zinc-700">{t('modals.delete.confirm')}</p>
        <div className="text-sm font-medium text-zinc-900 truncate">{book.title}</div>
        <p className="text-xs text-zinc-500">{t('modals.delete.archiveHint')}</p>
      </ModalBody>
      <ModalFooter>
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
      </ModalFooter>
    </Modal>
  );
};
