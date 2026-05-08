import { apiClient } from './client';

// Backend возвращает массив строк-кодов: ['USA', 'UK', ...].
// Оборачиваем в объект с code чтобы UI мог хранить дополнительные поля
// (currency и т.п.) если они появятся.
export interface Marketplace {
  code: string;
}

export const marketplacesApi = {
  list(): Promise<string[]> {
    return apiClient.get<string[]>('/api/marketplaces');
  },
};
