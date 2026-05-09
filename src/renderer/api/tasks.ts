import { apiClient } from './client';

export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked' | string;
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent' | string;

export interface Task {
  id: number;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority?: TaskPriority;
  due_date?: string | null;
  created_at?: string;
  updated_at?: string;
  assignee_id?: number | null;
  task_type?: string;
  book_id?: number | null;
  campaign_id?: number | null;
  [k: string]: unknown;
}

export interface TasksListResponse {
  items?: Task[];
  total?: number;
}

export const tasksApi = {
  list(opts: { status?: TaskStatus; limit?: number } = {}): Promise<Task[] | TasksListResponse> {
    return apiClient.get<Task[] | TasksListResponse>('/api/tasks', {
      status: opts.status,
      limit: opts.limit ?? 100,
    });
  },

  create(data: Partial<Task> & { title: string }): Promise<{ id: number; message?: string }> {
    return apiClient.post<{ id: number; message?: string }>('/api/tasks', data);
  },

  updateStatus(id: number, status: TaskStatus): Promise<{ message: string }> {
    return apiClient.put<{ message: string }>(`/api/tasks/${id}/status`, { status });
  },

  update(id: number, data: Partial<Task>): Promise<{ message: string }> {
    return apiClient.put<{ message: string }>(`/api/tasks/${id}`, data);
  },

  delete(id: number): Promise<{ message: string }> {
    return apiClient.del<{ message: string }>(`/api/tasks/${id}`);
  },
};

// Нормализация ответа: backend может вернуть { items: [...] } или массив.
export const normalizeTasks = (res: Task[] | TasksListResponse): Task[] => {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.items)) return res.items;
  return [];
};
