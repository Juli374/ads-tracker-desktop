import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { ApiError } from '../../api/client';
import { tasksApi, type Task, type TaskStatus, type TaskPriority } from '../../api/tasks';
import { useToast } from '../../contexts/ToastContext';
import { Modal, ModalBody, ModalFooter } from '../ui';

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done'];
const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

interface Props {
  task: Task;
  onClose: () => void;
  onSaved: (next: Task) => void;
  onDeleted?: (id: number) => void;
}

export const EditTaskModal: React.FC<Props> = ({ task, onClose, onSaved, onDeleted }) => {
  const { t } = useTranslation('operations');
  const toast = useToast();

  const [title, setTitle] = useState(task.title ?? '');
  const [description, setDescription] = useState(task.description ?? '');
  const [status, setStatus] = useState<TaskStatus>(task.status ?? 'todo');
  const [priority, setPriority] = useState<TaskPriority>(task.priority ?? 'medium');
  const [dueDate, setDueDate] = useState((task.due_date ?? '').slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error(t('edit.errors.titleRequired'));
      return;
    }
    setSubmitting(true);
    try {
      await tasksApi.update(task.id, {
        title: trimmed,
        description: description.trim() || null,
        status,
        priority,
        due_date: dueDate || null,
      });
      const next: Task = {
        ...task,
        title: trimmed,
        description: description.trim() || null,
        status,
        priority,
        due_date: dueDate || null,
      };
      toast.success(t('edit.saved'));
      onSaved(next);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('edit.errors.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!onDeleted) return;
    if (deleting || submitting) return;
    setDeleting(true);
    try {
      await tasksApi.delete(task.id);
      toast.success(t('edit.deleted'));
      onDeleted(task.id);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('edit.errors.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !submitting && !deleting && onClose()}
      size="md"
      title={t('edit.title')}
      closeOnEsc={!submitting && !deleting}
      closeOnOverlay={!submitting && !deleting}
      data-testid="edit-task-modal"
    >
      <form onSubmit={handleSave}>
        <ModalBody className="p-4 space-y-3">
          <Field label={t('edit.fields.title')}>
            <input
              data-testid="edit-task-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full h-9 px-3 text-sm rounded-md border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400"
            />
          </Field>

          <Field label={t('edit.fields.description')}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-md border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 resize-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('edit.fields.status')}>
              <select
                data-testid="edit-task-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full h-9 px-2 text-sm rounded-md border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`kanban.columns.${s}` as 'kanban.columns.todo')}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('edit.fields.priority')}>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full h-9 px-2 text-sm rounded-md border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {t(`edit.priorities.${p}` as 'edit.priorities.low')}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label={t('edit.fields.dueDate')}>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full h-9 px-3 text-sm rounded-md border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400"
            />
          </Field>
        </ModalBody>

        <ModalFooter justify="between">
          {onDeleted ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={submitting || deleting}
              data-testid="edit-task-delete"
              className="h-8 px-3 text-xs font-medium rounded-md text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {deleting ? t('edit.deleting') : t('edit.delete')}
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting || deleting}
              className="h-8 px-3 text-xs font-medium rounded-md text-zinc-700 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors disabled:opacity-50"
            >
              {t('edit.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting || deleting || !title.trim()}
              data-testid="edit-task-save"
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              {submitting && <Loader2 size={12} className="animate-spin" />}
              {t('edit.save')}
            </button>
          </div>
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
