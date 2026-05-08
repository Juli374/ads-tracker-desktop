import { apiClient } from './client';

export interface AuthUser {
  id: number;
  email: string;
  full_name: string | null;
  role: string;
  avatar: string | null;
}

interface VerifyResponse {
  valid: boolean;
  user: AuthUser;
}

const API_KEY_PREFIX = 'at_live_';

// Анонимный профиль для API-key auth — backend не возвращает user info по at_live ключу
const apiKeyUser: AuthUser = {
  id: 0,
  email: 'api-key',
  full_name: null,
  role: 'api_key',
  avatar: null,
};

export const authApi = {
  /**
   * Проверяет токен. Поддерживает оба формата:
   * — JWT: вызывает /api/auth/verify, возвращает user info из ответа
   * — at_live_* API-key: пингует /api/tasks?limit=1 (через @require_auth),
   *   user info недоступен → возвращаем заглушку
   */
  async verify(token: string): Promise<AuthUser> {
    if (token.startsWith(API_KEY_PREFIX)) {
      // require_auth-protected endpoint, понимает at_live
      await apiClient.get<unknown>('/api/tasks', { limit: 1 });
      return apiKeyUser;
    }
    const res = await apiClient.get<VerifyResponse>('/api/auth/verify');
    return res.user;
  },
};
