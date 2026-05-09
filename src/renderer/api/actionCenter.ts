import { apiClient } from './client';

export interface MetricsSnapshot {
  spend?: number;
  sales?: number;
  orders?: number;
  clicks?: number;
  impressions?: number;
  acos?: number;
  roi?: number;
  ctr?: number;
}

export interface ActionLog {
  id: number;
  book_id: number | null;
  marketplace: string | null;
  campaign_id: number | null;
  action_type: string;
  entity_type: string;
  entity_id: number | null;
  entity_name: string | null;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  source: string;
  is_experiment: boolean;
  experiment_id: number | null;
  week_number: number;
  year: number;
  wednesday_date: string | null;
  metrics_before: MetricsSnapshot | null;
  metrics_after: MetricsSnapshot | null;
  impact_calculated_at: string | null;
  created_at: string;
  book_title?: string;
  book_cover?: string;
}

export interface RecentActionsResponse {
  actions?: ActionLog[];
  // На старых деплоях backend может возвращать массив напрямую — обрабатываем оба варианта.
  total?: number;
}

export const actionCenterApi = {
  // GET /api/actions/recent — feed недавних действий по всему аккаунту.
  // На некоторых backend'ах поддерживается пагинация limit/offset.
  recent(opts: { limit?: number; offset?: number } = {}): Promise<RecentActionsResponse | ActionLog[]> {
    return apiClient.get<RecentActionsResponse | ActionLog[]>('/api/actions/recent', {
      limit: opts.limit ?? 50,
      offset: opts.offset,
    });
  },
};

// Утилиты-форматтеры для UI.
const ACTION_TYPE_RU: Record<string, string> = {
  pause: 'Пауза',
  unpause: 'Запуск',
  change_bid: 'Изменение бида',
  add_negative: 'Добавлен negative',
  scale: 'Скейл',
  transfer: 'Перенос',
  add_to_targeting: 'Добавлен в targeting',
  adjust_default_bid: 'Default bid',
  adjust_placement_modifier: 'Placement modifier',
  optimize_placements_3step: 'Optimize placements',
  alert: 'Alert',
  no_action: 'Мониторинг',
};

export const actionTypeLabel = (type: string): string =>
  ACTION_TYPE_RU[type] ?? type;

const ENTITY_TYPE_RU: Record<string, string> = {
  campaign: 'кампания',
  ad_group: 'ad group',
  target: 'target',
  keyword: 'keyword',
  search_term: 'search term',
  book: 'книга',
  asin: 'ASIN',
  placement: 'placement',
};

export const entityTypeLabel = (type: string): string =>
  ENTITY_TYPE_RU[type] ?? type;
