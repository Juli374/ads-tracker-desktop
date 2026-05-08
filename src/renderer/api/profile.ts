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
  // Возвращается как { user: {...} }
  get(): Promise<UserProfile> {
    return apiClient
      .get<{ user: UserProfile }>('/api/profile')
      .then((res) => res.user);
  },
};
