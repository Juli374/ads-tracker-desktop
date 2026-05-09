import { apiClient } from './client';

export interface CalendarEvent {
  id: number;
  title: string;
  description?: string | null;
  event_date: string;
  event_type?: string;
  importance?: 'low' | 'medium' | 'high' | string;
  book_id?: number | null;
  marketplace?: string | null;
  created_at?: string;
}

export const calendarApi = {
  upcoming(): Promise<CalendarEvent[]> {
    return apiClient.get<CalendarEvent[]>('/api/calendar/upcoming-events');
  },

  byMonth(year: number, month: number): Promise<CalendarEvent[]> {
    return apiClient.get<CalendarEvent[]>(
      `/api/calendar/events/month/${year}/${month}`,
    );
  },

  create(data: {
    title: string;
    event_date: string;
    description?: string;
    event_type?: string;
    importance?: string;
    book_id?: number;
    marketplace?: string;
  }) {
    return apiClient.post<{ id: number; message?: string }>(
      '/api/calendar/events',
      data,
    );
  },

  delete(id: number) {
    return apiClient.del<{ message: string }>(`/api/calendar/events/${id}`);
  },
};
