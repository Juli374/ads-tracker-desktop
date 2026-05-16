import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { ApiError } from '../api/client';
import { calendarApi } from '../api/calendar';
import { useToast } from '../contexts/ToastContext';
import { Modal, ModalBody, ModalFooter } from './ui';

interface Props {
  /** Optional default date (YYYY-MM-DD). */
  defaultDate?: string;
  onClose: () => void;
  onCreated?: () => void;
}

const IMPORTANCES: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];

export const AddEventModal: React.FC<Props> = ({ defaultDate, onClose, onCreated }) => {
  const { t } = useTranslation('common');
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(defaultDate ?? new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('09:00');
  const [description, setDescription] = useState('');
  const [importance, setImportance] = useState<'low' | 'medium' | 'high'>('medium');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error(t('addEvent.errors.titleRequired'));
      return;
    }
    if (!date) {
      toast.error(t('addEvent.errors.dateRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const eventDate = time ? `${date}T${time}:00` : date;
      await calendarApi.create({
        title: trimmedTitle,
        event_date: eventDate,
        description: description.trim() || undefined,
        importance,
      });
      toast.success(t('addEvent.created'));
      onCreated?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('addEvent.errors.createFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !submitting && onClose()}
      size="md"
      title={t('addEvent.title')}
      closeOnEsc={!submitting}
      closeOnOverlay={!submitting}
      data-testid="add-event-modal"
    >
      <form onSubmit={handleSubmit}>
        <ModalBody className="p-4 space-y-3">
          <Field label={t('addEvent.fields.title')}>
            <input
              data-testid="add-event-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('addEvent.placeholders.title')}
              className="w-full h-9 px-3 text-sm rounded-md border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('addEvent.fields.date')}>
              <input
                type="date"
                data-testid="add-event-date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full h-9 px-3 text-sm rounded-md border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              />
            </Field>
            <Field label={t('addEvent.fields.time')}>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full h-9 px-3 text-sm rounded-md border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              />
            </Field>
          </div>

          <Field label={t('addEvent.fields.importance')}>
            <select
              value={importance}
              onChange={(e) => setImportance(e.target.value as 'low' | 'medium' | 'high')}
              className="w-full h-9 px-2 text-sm rounded-md border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            >
              {IMPORTANCES.map((imp) => (
                <option key={imp} value={imp}>
                  {t(`addEvent.importance.${imp}` as 'addEvent.importance.low')}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t('addEvent.fields.description')}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-md border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 resize-none"
            />
          </Field>
        </ModalBody>

        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-8 px-3 text-xs font-medium rounded-md text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors disabled:opacity-50"
          >
            {t('addEvent.cancel')}
          </button>
          <button
            type="submit"
            data-testid="add-event-submit"
            disabled={submitting || !title.trim() || !date}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            {submitting && <Loader2 size={12} className="animate-spin" />}
            {t('addEvent.submit')}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="block text-[11px] font-medium text-zinc-600 mb-1">{label}</span>
    {children}
  </label>
);
