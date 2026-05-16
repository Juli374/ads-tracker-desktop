import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { apiClient } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import { Modal, ModalBody, ModalFooter } from '../ui';

interface Props {
  bookId: number;
  onClose(): void;
  onSaved(): void;
}

export const AddChangeModal: React.FC<Props> = ({ bookId, onClose, onSaved }) => {
  const { t } = useTranslation('books');
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [changeType, setChangeType] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiClient.post(`/api/books/${bookId}/content-changes`, {
        change_type: changeType,
        note,
        date,
      });
      toast.success(t('modals.addChange.save'));
      onSaved();
      onClose();
    } catch {
      toast.error(t('modals.addChange.errors.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !submitting && onClose()}
      size="sm"
      title={t('modals.addChange.title')}
      ariaLabel={t('modals.addChange.title')}
      closeOnEsc={!submitting}
      closeOnOverlay={!submitting}
    >
      <form onSubmit={handleSubmit}>
        <ModalBody className="px-5 py-4 space-y-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700">
              {t('modals.addChange.fields.type')}
            </label>
            <input
              type="text"
              value={changeType}
              onChange={(e) => setChangeType(e.target.value)}
              className={inputClass}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700">
              {t('modals.addChange.fields.note')}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-md border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700">
              {t('modals.addChange.fields.date')}
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
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
            {t('modals.addChange.cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="h-8 px-4 text-xs font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-800 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {submitting && <Loader2 size={12} className="animate-spin" />}
            {t('modals.addChange.save')}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
};

const inputClass =
  'w-full h-9 px-3 text-sm rounded-md border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400';
