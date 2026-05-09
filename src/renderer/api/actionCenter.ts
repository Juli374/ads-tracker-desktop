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

// Known enum types — UI должна локализовать через t(`actionType.${type}`).
// Для незнакомых значений компонент покажет raw type fallback'ом.
export const KNOWN_ACTION_TYPES = new Set<string>([
  'pause',
  'unpause',
  'change_bid',
  'add_negative',
  'scale',
  'transfer',
  'add_to_targeting',
  'adjust_default_bid',
  'adjust_placement_modifier',
  'optimize_placements_3step',
  'alert',
  'no_action',
]);

export const KNOWN_ENTITY_TYPES = new Set<string>([
  'campaign',
  'ad_group',
  'target',
  'keyword',
  'search_term',
  'book',
  'asin',
  'placement',
]);
