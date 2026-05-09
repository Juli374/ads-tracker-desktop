import React, { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { ApiError } from '../api/client';
import { adGroupsApi } from '../api/adGroups';

interface Props {
  campaignId: number;
  onClose(): void;
  onCreated(adGroupId: number): void;
}

export const AddAdGroupModal: React.FC<Props> = ({ campaignId, onClose, onCreated }) => {
  const toast = useToast();
  const [name, setName] = useState('Ad Group 1');
  const [defaultBid, setDefaultBid] = useState<string>('0.75');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.body.dataset.modalOpen = 'true';
    return () => {
      delete document.body.dataset.modalOpen;
    };
  }, []);

  useEffect(() => {
    const onWinKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onWinKey);
    return () => window.removeEventListener('keydown', onWinKey);
  }, [submitting, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Имя ad group обязательно');
      return;
    }
    const bid = Number(defaultBid);
    if (!Number.isFinite(bid) || bid <= 0) {
      toast.error('Default bid должен быть > 0');
      return;
    }
    setSubmitting(true);
    try {
      const res = await adGroupsApi.create(campaignId, { name: trimmed, default_bid: bid });
      toast.success('Ad group создана');
      onCreated(res.id);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Не удалось создать');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-zinc-900/20 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white border border-zinc-200 rounded-xl shadow-card overflow-hidden"
      >
        <div className="px-5 pt-5 pb-3 border-b border-zinc-100 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-zinc-900 tracking-tight">
            Новая Ad Group
          </h2>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="text-zinc-400 hover:text-zinc-700 transition-colors"
            aria-label="Закрыть"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700">Имя</label>
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
        </div>

        <div className="px-5 py-3 border-t border-zinc-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-8 px-3 text-xs font-medium rounded-md text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="h-8 px-4 text-xs font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-800 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 size={12} className="animate-spin" />}
            Создать
          </button>
        </div>
      </form>
    </div>
  );
};
