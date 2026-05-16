import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { ApiError } from '../api/client';
import { adGroupsApi } from '../api/adGroups';
import { Modal, ModalBody, ModalFooter } from './ui';

interface Props {
  campaignId: number;
  onClose(): void;
  onCreated(adGroupId: number): void;
}

export const AddAdGroupModal: React.FC<Props> = ({ campaignId, onClose, onCreated }) => {
  const { t } = useTranslation('campaigns');
  const toast = useToast();
  const [name, setName] = useState('Ad Group 1');
  const [defaultBid, setDefaultBid] = useState<string>('0.75');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t('addAdGroup.errors.nameRequired'));
      return;
    }
    const bid = Number(defaultBid);
    if (!Number.isFinite(bid) || bid <= 0) {
      toast.error(t('addAdGroup.errors.defaultBidPositive'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await adGroupsApi.create(campaignId, { name: trimmed, default_bid: bid });
      toast.success(t('addAdGroup.created'));
      onCreated(res.id);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('addAdGroup.errors.createFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !submitting && onClose()}
      size="md"
      title={t('addAdGroup.title')}
      closeOnEsc={!submitting}
      closeOnOverlay={!submitting}
    >
      <form onSubmit={handleSubmit}>
        <ModalBody className="px-5 py-4 space-y-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700">{t('addAdGroup.fields.name')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="w-full h-9 px-3 text-sm rounded-md border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700">
              Default bid ($)
            </label>
            <input
              type="number"
              min="0.02"
              step="0.01"
              value={defaultBid}
              onChange={(e) => setDefaultBid(e.target.value)}
              className="w-full h-9 px-3 text-sm rounded-md border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400"
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
            {t('addAdGroup.actions.cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="h-8 px-4 text-xs font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-800 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 size={12} className="animate-spin" />}
            {t('addAdGroup.actions.submit')}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
};
