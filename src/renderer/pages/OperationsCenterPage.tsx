import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { ApiError } from '../api/client';
import { tasksApi, normalizeTasks, type Task, type TaskStatus } from '../api/tasks';
import {
  Card,
  ErrorBanner,
  LoadingRow,
  PageHeader,
} from '../components/ui';
import { useToast } from '../contexts/ToastContext';

const COLUMNS: Array<{ id: TaskStatus; label: string; tone: string }> = [
  { id: 'todo', label: 'Todo', tone: 'bg-zinc-100 text-zinc-700' },
  { id: 'in_progress', label: 'In progress', tone: 'bg-sky-50 text-sky-700' },
  { id: 'blocked', label: 'Blocked', tone: 'bg-amber-50 text-amber-700' },
  { id: 'done', label: 'Done', tone: 'bg-emerald-50 text-emerald-700' },
];

export const OperationsCenterPage: React.FC = () => {
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
        toast.error(err instanceof ApiError ? err.message : 'Не удалось загрузить задачи');
        setTasks([]);
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const map: Record<string, Task[]> = { todo: [], in_progress: [], blocked: [], done: [] };
    tasks?.forEach((t) => {
      const col = COLUMNS.find((c) => c.id === t.status)?.id ?? 'todo';
      map[col].push(t);
    });
    return map;
  }, [tasks]);

  const handleStatus = async (id: number, next: TaskStatus) => {
    try {
      await tasksApi.updateStatus(id, next);
      setTasks((prev) =>
        prev ? prev.map((t) => (t.id === id ? { ...t, status: next } : t)) : prev,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Не удалось обновить статус');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await tasksApi.create({ title: trimmed, status: 'todo' });
      toast.success('Задача создана');
      setNewTitle('');
      setCreating(false);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Не удалось создать задачу');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Операционный центр"
        subtitle={
          unsupported
            ? 'Endpoint недоступен'
            : tasks
            ? `${tasks.length} задач`
            : 'Загрузка…'
        }
        rightSlot={
          !unsupported ? (
            <button
              type="button"
              onClick={() => setCreating((v) => !v)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 transition-colors"
            >
              <Plus size={12} />
              Задача
            </button>
          ) : null
        }
      />

      {unsupported && <ErrorBanner message="Endpoint /api/tasks вернул 401/403/404." />}

      {!unsupported && creating && (
        <Card title="Новая задача">
          <form onSubmit={handleCreate} className="px-5 py-3 flex items-center gap-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Что нужно сделать?"
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
              Добавить
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
              Отмена
            </button>
          </form>
        </Card>
      )}

      {!unsupported && (
        <div className="grid grid-cols-4 gap-4">
          {COLUMNS.map((col) => (
            <div key={col.id} className="flex flex-col gap-2 min-h-[300px]">
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${col.tone}`}>
                  {col.label}
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
                    пусто
                  </div>
                ) : (
                  grouped[col.id].map((t) => (
                    <TaskCard key={t.id} t={t} onStatus={(next) => handleStatus(t.id, next)} />
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

const TaskCard: React.FC<{ t: Task; onStatus: (s: TaskStatus) => void }> = ({ t, onStatus }) => (
  <div className="bg-white border border-zinc-200 rounded-md p-2.5 shadow-soft hover:border-zinc-300 transition-colors">
    <div className="text-xs font-medium text-zinc-900 mb-1.5 leading-snug">{t.title}</div>
    {t.description && (
      <div className="text-[11px] text-zinc-500 mb-2 line-clamp-2">{t.description}</div>
    )}
    <div className="flex items-center justify-between gap-2">
      <select
        value={t.status}
        onChange={(e) => onStatus(e.target.value as TaskStatus)}
        className="
          h-6 pl-1.5 pr-5 text-[10px] rounded cursor-pointer
          border border-zinc-200 bg-white text-zinc-700
          focus:outline-none focus:ring-2 focus:ring-zinc-900/10
        "
        aria-label={`Статус задачи: ${t.title}`}
      >
        {COLUMNS.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      {t.due_date && (
        <span className="text-[10px] text-zinc-400 tabular-nums">{t.due_date.slice(0, 10)}</span>
      )}
    </div>
  </div>
);
