import { apiClient } from './client';

export interface Notification {
  id: number;
  type: string;
  severity?: string;
  title: string;
  message: string;
  is_read: number | boolean;
  created_at: string;
  data?: Record<string, unknown> | null;
}

export interface NotificationsListResponse {
  notifications: Notification[];
  count: number;
}

export interface UnreadCountResponse {
  unread_count: number;
  billing_alerts_count: number;
  total: number;
}

export const notificationsApi = {
  list(opts: { limit?: number; unreadOnly?: boolean; offset?: number } = {}) {
    return apiClient.get<NotificationsListResponse>('/api/notifications', {
      limit: opts.limit ?? 20,
      unread_only: opts.unreadOnly ? 'true' : undefined,
      offset: opts.offset,
    });
  },

  unreadCount() {
    return apiClient.get<UnreadCountResponse>('/api/notifications/unread-count');
  },

  markRead(id: number) {
    return apiClient.post<{ message: string }>(
      `/api/notifications/${id}/read`,
    );
  },

  markAllRead() {
    return apiClient.post<{ message: string; count: number }>(
      '/api/notifications/read-all',
    );
  },
};
