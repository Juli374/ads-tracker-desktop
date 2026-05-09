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

interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser & {
    can_manage_bids?: boolean;
    can_manage_campaigns?: boolean;
    can_create_campaigns?: boolean;
    can_manage_negatives?: boolean;
    can_sync_data?: boolean;
    can_view_reports?: boolean;
  };
}

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

  /**
   * Email + password login. Возвращает JWT-токен и user info.
   * Toaster в caller'е, тут только сетевая ошибка.
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    return apiClient.post<LoginResponse>('/api/auth/login', { email, password });
  },
};
