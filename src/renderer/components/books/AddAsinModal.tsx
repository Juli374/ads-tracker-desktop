import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X } from 'lucide-react';
import { asinApi } from '../../api/books';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import { useEscapeClose } from '../../lib/useEscapeClose';

const MARKETPLACES = ['USA', 'UK', 'CA', 'AU', 'DE', 'FR', 'ES', 'IT', 'JP', 'MX', 'IN'];

interface Props {
  bookId: number;
  onClose(): void;
  onSaved(): void;
}

export const AddAsinModal: React.FC<Props> = ({ bookId, onClose, onSaved }) => {
  const { t } = useTranslation('books');
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [marketplace, setMarketplace] = useState('');
  const [asin, setAsin] = useState('');

  useEscapeClose(() => {
    if (!submitting) onClose();
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!marketplace || !asin.trim()) {
      toast.error(t('modals.addAsin.errors.required'));
      return;
    }
    setSubmitting(true);
    try {
      await asinApi.add(bookId, { marketplace, asin: asin.trim().toUpperCase() });
      toast.success(t('modals.addAsin.save'));
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('modals.addAsin.errors.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-zinc-900/20 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('modals.addAsin.title')}
      data-testid="book-add-asin-modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white border border-zinc-200 rounded-xl shadow-card overflow-hidden"
      >
        <div className="px-5 pt-5 pb-3 border-b border-zinc-100 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-zinc-900">{t('modals.addAsin.title')}</h2>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="text-zinc-400 hover:text-zinc-700 transition-colors"
            aria-label={t('modals.addAsin.cancel')}
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700">
              {t('modals.addAsin.marketplace')}
            </label>
            <select
              value={marketplace}
              onChange={(e) => setMarketplace(e.target.value)}
              className="w-full h-9 px-2 text-sm rounded-md border border-zinc-200 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400"
              required
              autoFocus
            >
              <option value="">—</option>
              {MARKETPLACES.map((mp) => (
                <option key={mp} value={mp}>
                  {mp}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700">
              {t('modals.addAsin.asin')}
            </label>
            <input
              type="text"
              value={asin}
              onChange={(e) => setAsin(e.target.value)}
              placeholder="B0XXXXXXXXX"
              className="w-full h-9 px-3 text-sm rounded-md border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 font-mono uppercase"
              required
            />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-zinc-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-8 px-3 text-xs font-medium rounded-md text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors disabled:opacity-50"
          >
            {t('modals.addAsin.cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="h-8 px-4 text-xs font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-800 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {submitting && <Loader2 size={12} className="animate-spin" />}
            {t('modals.addAsin.save')}
          </button>
        </div>
      </form>
    </div>
  );
};
