import { apiClient } from './client';
import { uploadFile } from './upload';

export interface UserProfile {
  id: number;
  email: string;
  full_name: string | null;
  role: string;
  avatar: string | null;
  created_at?: string;
  last_login?: string | null;
  is_active?: number;
}

export const profileApi = {
  // Возвращается как { user: {...} }. async/await вместо .then(), чтобы caller
  // мог нормально обернуть в try/catch (раньше unhandled rejection через .then()
  // мог уронить strict prod build — code-quality finding #6).
  async get(): Promise<UserProfile> {
    const res = await apiClient.get<{ user: UserProfile }>('/api/profile');
    return res.user;
  },

  // PUT /api/profile — обновляет full_name (backend ограничивает только этим полем).
  async update(data: { full_name: string }): Promise<UserProfile> {
    const res = await apiClient.put<{ message: string; user: UserProfile }>(
      '/api/profile',
      data,
    );
    return res.user;
  },

  // POST /api/profile/avatar — multipart upload с полем "avatar".
  // Возвращает обновлённого user.
  async uploadAvatar(file: File): Promise<UserProfile> {
    const res = await uploadFile<{ message: string; user: UserProfile }>(
      '/api/profile/avatar',
      file,
      'avatar',
    );
    return res.user;
  },
};
