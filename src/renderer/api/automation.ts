import { apiClient } from './client';

export type RecommendationStatus = 'pending' | 'applied' | 'dismissed' | 'snoozed';
export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'low';
export type RecActionType =
  | 'transfer'
  | 'scale'
  | 'add_negative'
  | 'pause'
  | 'change_bid'
  | 'unpause'
  | 'add_to_targeting'
  | 'adjust_placement_modifier'
  | 'adjust_default_bid'
  | 'alert'
  | 'optimize_placements_3step'
  | 'no_action';

export interface Recommendation {
  id: number;
  ruleId: number;
  ruleCode: string;
  ruleName: string;
  category?: string;
  entityType: string;
  entityId: number;
  entityName: string;
  campaignId?: number;
  campaignName?: string;
  adGroupId?: number;
  adGroupName?: string;
  marketplace?: string;
  actionType: RecActionType | string;
  actionDescription: string;
  actionParams?: Record<string, unknown>;
  reason: string;
  metricsSnapshot: Record<string, number | undefined>;
  status: RecommendationStatus;
  priority: RecommendationPriority;
  createdAt: string;
  expiresAt?: string;
  appliedAt?: string;
  dismissedAt?: string;
  dismissedReason?: string;
  snoozedUntil?: string;
}

export interface RecommendationStats {
  total: number;
  pending: number;
  applied: number;
  dismissed: number;
  snoozed: number;
  byPriority?: Record<string, number>;
  byCategory?: Record<string, number>;
}

export interface RecommendationsResponse {
  items: Recommendation[];
  total: number;
  limit: number;
  offset: number;
  stats?: RecommendationStats;
}

export interface RecommendationsFilters {
  status?: RecommendationStatus;
  priority?: RecommendationPriority;
  entityType?: string;
  campaignId?: number;
  ruleCode?: string;
  limit?: number;
  offset?: number;
}

export const automationApi = {
  list(filters: RecommendationsFilters = {}): Promise<RecommendationsResponse> {
    return apiClient.get<RecommendationsResponse>('/api/automation/recommendations', {
      status: filters.status,
      priority: filters.priority,
      entity_type: filters.entityType,
      campaign_id: filters.campaignId,
      rule_code: filters.ruleCode,
      limit: filters.limit ?? 50,
      offset: filters.offset,
    });
  },

  apply(id: number, data: Record<string, unknown> = {}) {
    return apiClient.post<{ success: boolean; appliedAt: string }>(
      `/api/automation/recommendations/${id}/apply`,
      data,
    );
  },

  dismiss(id: number, reason: string) {
    return apiClient.post<{ success: boolean }>(
      `/api/automation/recommendations/${id}/dismiss`,
      { reason },
    );
  },

  snooze(id: number, until: string) {
    return apiClient.post<{ success: boolean; snoozedUntil: string }>(
      `/api/automation/recommendations/${id}/snooze`,
      { until },
    );
  },
};

// Локализуется через t(`priority.${p}`); неизвестные значения пробрасываются как есть.
export const KNOWN_PRIORITIES = new Set<string>(['critical', 'high', 'medium', 'low']);

export const priorityClasses = (p: string): string => {
  switch (p) {
    case 'critical':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'high':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'medium':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    default:
      return 'bg-zinc-100 text-zinc-700 border-zinc-200';
  }
};
