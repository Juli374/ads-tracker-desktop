import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import { tasksApi, normalizeTasks, type Task, type TaskStatus } from '../api/tasks';
import {
  Card,
  ErrorBanner,
  LoadingRow,
  PageHeader,
} from '../components/ui';
import { useToast } from '../contexts/ToastContext';

const COLUMN_IDS: Array<{ id: TaskStatus; tone: string }> = [
  { id: 'todo', tone: 'bg-zinc-100 text-zinc-700' },
  { id: 'in_progress', tone: 'bg-sky-50 text-sky-700' },
  { id: 'blocked', tone: 'bg-amber-50 text-amber-700' },
  { id: 'done', tone: 'bg-emerald-50 text-emerald-700' },
];

export const OperationsCenterPage: React.FC = () => {
  const { t } = useTranslation('operations');
  const toast = useToast();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useMemo(
    () => async () => {
      setLoading(true);
      setUnsupported(false);
      try {
        const res = await tasksApi.list({ limit: 200 });
        setTasks(normalizeTasks(res));
      } catch (err) {
        if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
          setUnsupported(true);
          setTasks([]);
          return;
        }
        toast.error(err instanceof ApiError ? err.message : t('kanban.errors.load'));
        setTasks([]);
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toast],
  );

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const map: Record<string, Task[]> = { todo: [], in_progress: [], blocked: [], done: [] };
    tasks?.forEach((tsk) => {
      const col = COLUMN_IDS.find((c) => c.id === tsk.status)?.id ?? 'todo';
      map[col].push(tsk);
    });
    return map;
  }, [tasks]);

  const handleStatus = async (id: number, next: TaskStatus) => {
    try {
      await tasksApi.updateStatus(id, next);
      setTasks((prev) =>
        prev ? prev.map((tsk) => (tsk.id === id ? { ...tsk, status: next } : tsk)) : prev,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('kanban.errors.updateStatus'));
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await tasksApi.create({ title: trimmed, status: 'todo' });
      toast.success(t('kanban.created'));
      setNewTitle('');
      setCreating(false);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('kanban.errors.createFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="operations-page">
      <PageHeader
        title={t('kanban.title')}
        subtitle={
          unsupported
            ? t('kanban.subtitle.unsupported')
            : tasks
            ? t('kanban.subtitle.taskCount', { count: tasks.length })
            : t('kanban.loading')
        }
        rightSlot={
          !unsupported ? (
            <button
              type="button"
              onClick={() => setCreating((v) => !v)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 transition-colors"
            >
              <Plus size={12} />
              {t('kanban.addTask')}
            </button>
          ) : null
        }
      />

      {unsupported && <ErrorBanner message={t('kanban.errors.unsupportedBanner')} />}

      {!unsupported && creating && (
        <Card title={t('kanban.newCardTitle')}>
          <form onSubmit={handleCreate} className="px-5 py-3 flex items-center gap-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={t('kanban.placeholder')}
              autoFocus
              className="
                flex-1 h-9 px-3 text-sm rounded-md border border-zinc-200 bg-white
                text-zinc-900 placeholder:text-zinc-400
                focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
              "
            />
            <button
              type="submit"
              disabled={submitting || !newTitle.trim()}
              className="
                inline-flex items-center gap-1.5 h-9 px-3 rounded-md
                bg-zinc-900 text-white text-xs font-medium
                hover:bg-zinc-800 transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              {submitting ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              {t('kanban.submit')}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setNewTitle('');
              }}
              className="
                h-9 px-3 text-xs font-medium rounded-md
                text-zinc-700 border border-zinc-200 bg-white
                hover:bg-zinc-50 transition-colors
              "
            >
              {t('kanban.cancel')}
            </button>
          </form>
        </Card>
      )}

      {!unsupported && (
        <div className="grid grid-cols-4 gap-4">
          {COLUMN_IDS.map((col) => (
            <div key={col.id} className="flex flex-col gap-2 min-h-[300px]">
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${col.tone}`}>
                  {t(`kanban.columns.${col.id}` as 'kanban.columns.todo')}
                </span>
                <span className="text-[10px] text-zinc-400 tabular-nums">
                  {grouped[col.id].length}
                </span>
              </div>
              <div className="space-y-2 flex-1">
                {loading && !tasks ? (
                  <LoadingRow />
                ) : grouped[col.id].length === 0 ? (
                  <div className="text-[11px] text-zinc-300 text-center py-6 border border-dashed border-zinc-200 rounded-md">
                    {t('kanban.columnEmpty')}
                  </div>
                ) : (
                  grouped[col.id].map((tsk) => (
                    <TaskCard key={tsk.id} task={tsk} onStatus={(next) => handleStatus(tsk.id, next)} />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const TaskCard: React.FC<{ task: Task; onStatus: (s: TaskStatus) => void }> = ({ task, onStatus }) => {
  const { t } = useTranslation('operations');
  return (
    <div className="bg-white border border-zinc-200 rounded-md p-2.5 shadow-soft hover:border-zinc-300 transition-colors">
      <div className="text-xs font-medium text-zinc-900 mb-1.5 leading-snug">{task.title}</div>
      {task.description && (
        <div className="text-[11px] text-zinc-500 mb-2 line-clamp-2">{task.description}</div>
      )}
      <div className="flex items-center justify-between gap-2">
        <select
          value={task.status}
          onChange={(e) => onStatus(e.target.value as TaskStatus)}
          className="
            h-6 pl-1.5 pr-5 text-[10px] rounded cursor-pointer
            border border-zinc-200 bg-white text-zinc-700
            focus:outline-none focus:ring-2 focus:ring-zinc-900/10
          "
          aria-label={t('kanban.statusAria', { title: task.title })}
        >
          {COLUMN_IDS.map((c) => (
            <option key={c.id} value={c.id}>
              {t(`kanban.columns.${c.id}` as 'kanban.columns.todo')}
            </option>
          ))}
        </select>
        {task.due_date && (
          <span className="text-[10px] text-zinc-400 tabular-nums">{task.due_date.slice(0, 10)}</span>
        )}
      </div>
    </div>
  );
};
