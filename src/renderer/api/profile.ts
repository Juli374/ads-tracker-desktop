import { apiClient } from './client';

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
};
