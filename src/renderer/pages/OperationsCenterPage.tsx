import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { ApiError } from '../api/client';
import { tasksApi, normalizeTasks, type Task, type TaskStatus } from '../api/tasks';
import {
  ActiveFiltersBar,
  Card,
  ErrorBanner,
  LoadingRow,
  PageHeader,
} from '../components/ui';
import { EditTaskModal } from '../components/operations/EditTaskModal';
import { useToast } from '../contexts/ToastContext';
import { useGlobalFilterChips } from '../contexts/GlobalFiltersContext';
import { useBooks } from '../contexts/BooksContext';

const COLUMN_IDS: Array<{ id: TaskStatus; tone: string }> = [
  { id: 'todo', tone: 'bg-zinc-100 text-zinc-700' },
  { id: 'in_progress', tone: 'bg-sky-50 text-sky-700' },
  { id: 'blocked', tone: 'bg-amber-50 text-amber-700' },
  { id: 'done', tone: 'bg-emerald-50 text-emerald-700' },
];

const TASK_DND_TYPE = 'operations-task';

interface TaskDragItem {
  id: number;
  status: TaskStatus;
}

export const OperationsCenterPage: React.FC = () => {
  const { t } = useTranslation('operations');
  const toast = useToast();
  const { list: booksList } = useBooks();
  const chips = useGlobalFilterChips(booksList);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);

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
    [toast, t],
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

  // KPI: total / open / blocked / done-this-week.
  const kpi = useMemo(() => {
    const total = tasks?.length ?? 0;
    const open = (grouped.todo?.length ?? 0) + (grouped.in_progress?.length ?? 0);
    const blocked = grouped.blocked?.length ?? 0;
    const doneThisWeek = computeDoneThisWeek(grouped.done ?? []);
    return { total, open, blocked, doneThisWeek };
  }, [tasks, grouped]);

  const handleStatus = async (id: number, next: TaskStatus) => {
    // Optimistic update.
    setTasks((prev) =>
      prev ? prev.map((tsk) => (tsk.id === id ? { ...tsk, status: next } : tsk)) : prev,
    );
    try {
      await tasksApi.updateStatus(id, next);
    } catch (err) {
      // Revert on failure.
      setTasks((prev) =>
        prev
          ? prev.map((tsk) =>
              tsk.id === id ? { ...tsk, status: tsk.status } : tsk,
            )
          : prev,
      );
      toast.error(err instanceof ApiError ? err.message : t('kanban.errors.updateStatus'));
      load();
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

  const handleSaved = (next: Task) => {
    setTasks((prev) => (prev ? prev.map((tsk) => (tsk.id === next.id ? next : tsk)) : prev));
  };

  const handleDeleted = (id: number) => {
    setTasks((prev) => (prev ? prev.filter((tsk) => tsk.id !== id) : prev));
  };

  return (
    <DndProvider backend={HTML5Backend}>
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

        <ActiveFiltersBar chips={chips} />

        {!unsupported && tasks && (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4" data-testid="operations-kpi">
            <KpiTile label={t('kanban.kpi.total')} value={kpi.total} />
            <KpiTile label={t('kanban.kpi.open')} value={kpi.open} />
            <KpiTile label={t('kanban.kpi.blocked')} value={kpi.blocked} tone="amber" />
            <KpiTile label={t('kanban.kpi.doneThisWeek')} value={kpi.doneThisWeek} tone="emerald" />
          </div>
        )}

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
              <DroppableColumn
                key={col.id}
                column={col}
                tasks={grouped[col.id]}
                loading={loading && !tasks}
                onDrop={(item) => {
                  if (item.status !== col.id) handleStatus(item.id, col.id);
                }}
                onEdit={(tsk) => setEditTask(tsk)}
              />
            ))}
          </div>
        )}

        {editTask && (
          <EditTaskModal
            task={editTask}
            onClose={() => setEditTask(null)}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        )}
      </div>
    </DndProvider>
  );
};

const KpiTile: React.FC<{ label: string; value: number; tone?: 'amber' | 'emerald' }> = ({
  label,
  value,
  tone,
}) => (
  <div className="border border-zinc-200 rounded-lg bg-white px-3 py-2.5">
    <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">{label}</div>
    <div
      className={`mt-1 text-lg font-semibold tabular-nums ${
        tone === 'amber'
          ? 'text-amber-600'
          : tone === 'emerald'
          ? 'text-emerald-600'
          : 'text-zinc-900'
      }`}
    >
      {value}
    </div>
  </div>
);

interface DroppableColumnProps {
  column: { id: TaskStatus; tone: string };
  tasks: Task[];
  loading: boolean;
  onDrop: (item: TaskDragItem) => void;
  onEdit: (task: Task) => void;
}

const DroppableColumn: React.FC<DroppableColumnProps> = ({ column, tasks, loading, onDrop, onEdit }) => {
  const { t } = useTranslation('operations');
  const [{ isOver, canDrop }, drop] = useDrop<TaskDragItem, void, { isOver: boolean; canDrop: boolean }>({
    accept: TASK_DND_TYPE,
    canDrop: (item) => item.status !== column.id,
    drop: onDrop,
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  return (
    <div
      ref={drop}
      data-testid={`operations-column-${column.id}`}
      className={`flex flex-col gap-2 min-h-[300px] rounded-md p-1.5 transition-colors ${
        isOver && canDrop ? 'bg-zinc-100 ring-1 ring-zinc-300' : ''
      }`}
    >
      <div className="flex items-center justify-between px-1">
        <span
          className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${column.tone}`}
        >
          {t(`kanban.columns.${column.id}` as 'kanban.columns.todo')}
        </span>
        <span className="text-[10px] text-zinc-400 tabular-nums">{tasks.length}</span>
      </div>
      <div className="space-y-2 flex-1">
        {loading ? (
          <LoadingRow />
        ) : tasks.length === 0 ? (
          <div className="text-[11px] text-zinc-300 text-center py-6 border border-dashed border-zinc-200 rounded-md">
            {t('kanban.columnEmpty')}
          </div>
        ) : (
          tasks.map((tsk) => <DraggableTaskCard key={tsk.id} task={tsk} onEdit={() => onEdit(tsk)} />)
        )}
      </div>
    </div>
  );
};

interface DraggableTaskCardProps {
  task: Task;
  onEdit: () => void;
}

const DraggableTaskCard: React.FC<DraggableTaskCardProps> = ({ task, onEdit }) => {
  const { t } = useTranslation('operations');
  const [{ isDragging }, drag] = useDrag<TaskDragItem, void, { isDragging: boolean }>({
    type: TASK_DND_TYPE,
    item: { id: task.id, status: task.status },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  return (
    <div
      ref={drag}
      data-testid={`task-card-${task.id}`}
      data-task-status={task.status}
      className={`bg-white border border-zinc-200 rounded-md p-2.5 shadow-soft hover:border-zinc-300 transition-colors cursor-grab active:cursor-grabbing ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="text-xs font-medium text-zinc-900 leading-snug flex-1">{task.title}</div>
        <button
          type="button"
          onClick={onEdit}
          className="text-zinc-400 hover:text-zinc-700 flex-shrink-0"
          aria-label={t('kanban.editAria', { title: task.title })}
          data-testid={`task-edit-${task.id}`}
        >
          <Pencil size={11} />
        </button>
      </div>
      {task.description && (
        <div className="text-[11px] text-zinc-500 mb-2 line-clamp-2">{task.description}</div>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-zinc-400 uppercase tracking-wider">
          {task.priority ?? 'medium'}
        </span>
        {task.due_date && (
          <span className="text-[10px] text-zinc-400 tabular-nums">{task.due_date.slice(0, 10)}</span>
        )}
      </div>
    </div>
  );
};

function computeDoneThisWeek(doneTasks: Task[]): number {
  const now = new Date();
  const weekStart = new Date(now);
  // Start of week (Monday)
  const day = weekStart.getUTCDay();
  const diff = (day === 0 ? -6 : 1 - day);
  weekStart.setUTCDate(weekStart.getUTCDate() + diff);
  weekStart.setUTCHours(0, 0, 0, 0);

  return doneTasks.filter((tsk) => {
    const completedAt = (tsk.updated_at as string | undefined) ?? (tsk.created_at as string | undefined);
    if (!completedAt) return false;
    const date = new Date(completedAt);
    if (Number.isNaN(date.getTime())) return false;
    return date >= weekStart;
  }).length;
}
