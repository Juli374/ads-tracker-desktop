import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { asinApi } from '../../api/books';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import { Modal, ModalBody, ModalFooter } from '../ui';

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
    <Modal
      open
      onClose={() => !submitting && onClose()}
      size="sm"
      title={t('modals.addAsin.title')}
      ariaLabel={t('modals.addAsin.title')}
      closeOnEsc={!submitting}
      closeOnOverlay={!submitting}
      data-testid="book-add-asin-modal"
    >
      <form onSubmit={handleSubmit}>
        <ModalBody className="px-5 py-4 space-y-3">
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
        </ModalBody>
        <ModalFooter>
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
        </ModalFooter>
      </form>
    </Modal>
  );
};
