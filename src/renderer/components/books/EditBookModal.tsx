import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X } from 'lucide-react';
import { booksApi, Book, BookUpdate } from '../../api/books';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import { useEscapeClose } from '../../lib/useEscapeClose';

interface Props {
  book: Book;
  onClose(): void;
  onSaved(): void;
}

export const EditBookModal: React.FC<Props> = ({ book, onClose, onSaved }) => {
  const { t } = useTranslation('books');
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState(book.title ?? '');
  const [subtitle, setSubtitle] = useState(book.subtitle ?? '');
  const [author, setAuthor] = useState(book.author ?? '');
  const [account, setAccount] = useState(book.account ?? '');
  const [beAcos, setBeAcos] = useState(book.be_acos != null ? String(book.be_acos) : '');
  const [maxCpc, setMaxCpc] = useState(book.max_cpc != null ? String(book.max_cpc) : '');
  const [royaltyPct, setRoyaltyPct] = useState(
    book.royalty_pct != null ? String(book.royalty_pct) : '',
  );
  const [organicBaseline, setOrganicBaseline] = useState(
    book.organic_baseline != null ? String(book.organic_baseline) : '',
  );

  useEscapeClose(() => {
    if (!submitting) onClose();
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error(t('modals.edit.errors.titleRequired'));
      return;
    }
    const payload: BookUpdate = { title: trimmedTitle };
    if (subtitle.trim() !== (book.subtitle ?? '')) payload.subtitle = subtitle.trim() || null;
    if (author.trim() !== (book.author ?? '')) payload.author = author.trim() || null;
    if (account.trim() !== (book.account ?? '')) payload.account = account.trim() || null;
    const beAcosNum = beAcos.trim() ? Number(beAcos) : null;
    if (beAcosNum !== (book.be_acos ?? null)) payload.be_acos = beAcosNum;
    const maxCpcNum = maxCpc.trim() ? Number(maxCpc) : null;
    if (maxCpcNum !== (book.max_cpc ?? null)) payload.max_cpc = maxCpcNum;
    const royaltyNum = royaltyPct.trim() ? Number(royaltyPct) : null;
    if (royaltyNum !== (book.royalty_pct ?? null)) payload.royalty_pct = royaltyNum;
    const organicNum = organicBaseline.trim() ? Number(organicBaseline) : null;
    if (organicNum !== (book.organic_baseline ?? null)) payload.organic_baseline = organicNum;

    setSubmitting(true);
    try {
      await booksApi.update(book.id, payload);
      toast.success(t('modals.edit.save'));
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('modals.edit.errors.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-zinc-900/20 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('modals.edit.title')}
      data-testid="book-edit-modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg bg-white border border-zinc-200 rounded-xl shadow-card overflow-hidden"
      >
        <div className="px-5 pt-5 pb-3 border-b border-zinc-100 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-zinc-900">{t('modals.edit.title')}</h2>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="text-zinc-400 hover:text-zinc-700 transition-colors"
            aria-label={t('modals.edit.cancel')}
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          <Field label={t('modals.edit.fields.title')}>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              required
              autoFocus
            />
          </Field>
          <Field label={t('modals.edit.fields.subtitle')}>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t('modals.edit.fields.author')}>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t('modals.edit.fields.account')}>
            <input
              type="text"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('modals.edit.fields.beAcos')}>
              <input
                type="number"
                step="0.01"
                min="0"
                value={beAcos}
                onChange={(e) => setBeAcos(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label={t('modals.edit.fields.maxCpc')}>
              <input
                type="number"
                step="0.01"
                min="0"
                value={maxCpc}
                onChange={(e) => setMaxCpc(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label={t('modals.edit.fields.royaltyPct')}>
              <input
                type="number"
                step="0.01"
                min="0"
                value={royaltyPct}
                onChange={(e) => setRoyaltyPct(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label={t('modals.edit.fields.organicBaseline')}>
              <input
                type="number"
                step="0.01"
                min="0"
                value={organicBaseline}
                onChange={(e) => setOrganicBaseline(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-zinc-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-8 px-3 text-xs font-medium rounded-md text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors disabled:opacity-50"
          >
            {t('modals.edit.cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="h-8 px-4 text-xs font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-800 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {submitting && <Loader2 size={12} className="animate-spin" />}
            {t('modals.edit.save')}
          </button>
        </div>
      </form>
    </div>
  );
};

const inputClass =
  'w-full h-9 px-3 text-sm rounded-md border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5">
    <label className="block text-xs font-medium text-zinc-700">{label}</label>
    {children}
  </div>
);
