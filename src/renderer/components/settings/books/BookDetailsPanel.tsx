import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Pencil, Trash2, Upload, Plus } from 'lucide-react';
import { Book, asinApi } from '../../../api/books';
import { ApiError } from '../../../api/client';
import { useToast } from '../../../contexts/ToastContext';
import { EditBookModal } from '../../books/EditBookModal';
import { DeleteBookModal } from '../../books/DeleteBookModal';
import { AddAsinModal } from '../../books/AddAsinModal';
import { UploadCoverModal } from '../../books/UploadCoverModal';

interface Props {
  book: Book | null;
  onRefresh(): void;
}

type ModalType = 'edit' | 'delete' | 'addAsin' | 'uploadCover' | null;

export const BookDetailsPanel: React.FC<Props> = ({ book, onRefresh }) => {
  const { t } = useTranslation('settings');
  const toast = useToast();
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [deletingAsin, setDeletingAsin] = useState<number | null>(null);

  if (!book) {
    return (
      <div
        className="flex items-center justify-center h-full text-xs text-zinc-400"
        data-testid="book-details-panel"
      >
        {t('booksTab.detailsPlaceholder')}
      </div>
    );
  }

  const handleDeleteAsin = async (asinId: number) => {
    setDeletingAsin(asinId);
    try {
      await asinApi.delete(asinId);
      toast.success(t('booksTab.deleteAsin'));
      onRefresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('errors.load'));
    } finally {
      setDeletingAsin(null);
    }
  };

  const closeModal = () => setActiveModal(null);

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-4" data-testid="book-details-panel">
      {/* Header with cover + actions */}
      <div className="flex items-start gap-4">
        {book.cover_image ? (
          <img
            src={book.cover_image}
            alt={t('booksTab.coverPreview')}
            className="w-16 h-20 object-cover rounded border border-zinc-200 flex-shrink-0"
          />
        ) : (
          <div className="w-16 h-20 bg-zinc-100 rounded border border-zinc-200 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-zinc-900 leading-tight">{book.title}</div>
          {book.subtitle && (
            <div className="text-xs text-zinc-500 mt-0.5">{book.subtitle}</div>
          )}
          {book.account && (
            <div className="text-[10px] text-zinc-400 mt-1">{book.account}</div>
          )}
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          <ActionBtn
            label={t('booksTab.editBook')}
            icon={<Pencil size={12} />}
            onClick={() => setActiveModal('edit')}
          />
          <ActionBtn
            label={t('booksTab.uploadCover')}
            icon={<Upload size={12} />}
            onClick={() => setActiveModal('uploadCover')}
          />
          <ActionBtn
            label={t('booksTab.deleteBook')}
            icon={<Trash2 size={12} />}
            onClick={() => setActiveModal('delete')}
            danger
          />
        </div>
      </div>

      {/* Fields grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <Field label={t('booksTab.fields.author')} value={book.author ?? '—'} />
        <Field label={t('booksTab.fields.account')} value={book.account ?? '—'} />
        <Field
          label={t('booksTab.fields.beAcos')}
          value={book.be_acos != null ? `${book.be_acos}%` : '—'}
        />
        <Field
          label={t('booksTab.fields.maxCpc')}
          value={book.max_cpc != null ? `$${book.max_cpc}` : '—'}
        />
        <Field
          label={t('booksTab.fields.royaltyPct')}
          value={book.royalty_pct != null ? `${book.royalty_pct}%` : '—'}
        />
        <Field
          label={t('booksTab.fields.organicBaseline')}
          value={book.organic_baseline != null ? String(book.organic_baseline) : '—'}
        />
      </div>

      {/* ASINs */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-zinc-700">{t('booksTab.asins')}</div>
          <button
            type="button"
            onClick={() => setActiveModal('addAsin')}
            className="inline-flex items-center gap-1 h-6 px-2 text-[11px] font-medium rounded border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors"
          >
            <Plus size={11} />
            {t('booksTab.addAsin')}
          </button>
        </div>
        {!book.asins || book.asins.length === 0 ? (
          <div className="text-xs text-zinc-400">{t('booksTab.noAsins')}</div>
        ) : (
          <div className="space-y-1">
            {book.asins.map((a) => {
              const amazonUrl = `https://www.amazon.com/dp/${a.asin}`;
              return (
                <div
                  key={a.id}
                  className="flex items-center gap-2 px-2 py-1.5 bg-zinc-50 rounded text-xs"
                >
                  <span className="font-mono text-zinc-900 font-medium">{a.asin}</span>
                  <span className="text-zinc-400 uppercase">{a.marketplace}</span>
                  <div className="flex-1" />
                  <a
                    href={amazonUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => {
                      e.preventDefault();
                      window.api.shell.openExternal(amazonUrl);
                    }}
                    title={t('booksTab.openAmazon')}
                    className="text-zinc-400 hover:text-zinc-700 transition-colors"
                  >
                    <ExternalLink size={11} />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDeleteAsin(a.id)}
                    disabled={deletingAsin === a.id}
                    title={t('booksTab.deleteAsin')}
                    className="text-zinc-400 hover:text-red-600 transition-colors disabled:opacity-50"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {activeModal === 'edit' && (
        <EditBookModal
          book={book}
          onClose={closeModal}
          onSaved={onRefresh}
        />
      )}
      {activeModal === 'delete' && (
        <DeleteBookModal
          book={book}
          onClose={closeModal}
          onDone={onRefresh}
        />
      )}
      {activeModal === 'addAsin' && (
        <AddAsinModal
          bookId={book.id}
          onClose={closeModal}
          onSaved={onRefresh}
        />
      )}
      {activeModal === 'uploadCover' && (
        <UploadCoverModal
          bookId={book.id}
          onClose={closeModal}
          onUploaded={onRefresh}
        />
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="text-[10px] text-zinc-400 mb-0.5">{label}</div>
    <div className="text-zinc-700">{value}</div>
  </div>
);

const ActionBtn: React.FC<{
  label: string;
  icon: React.ReactNode;
  onClick(): void;
  danger?: boolean;
}> = ({ label, icon, onClick, danger }) => (
  <button
    type="button"
    onClick={onClick}
    title={label}
    aria-label={label}
    className={`inline-flex items-center gap-1 h-6 px-2 text-[11px] font-medium rounded border transition-colors ${
      danger
        ? 'border-red-200 text-red-500 hover:bg-red-50'
        : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
    }`}
  >
    {icon}
    <span className="sr-only">{label}</span>
  </button>
);
