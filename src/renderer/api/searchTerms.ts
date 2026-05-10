import { ApiError, apiClient } from './client';

// Backend возвращает items в camelCase (transform_to_camel_case)
export interface SearchTermItem {
  id: number;
  searchTerm: string;
  campaignId?: string;
  campaignName?: string;
  localCampaignId?: number;
  bookId?: number | null;
  bookTitle?: string | null;
  marketplace?: string;
  currency?: string;
  keywordId?: string;
  keywordText?: string;
  matchType?: string;
  termType?: 'keyword' | 'asin';
  impressions: number;
  clicks: number;
  cost: number;
  sales: number;
  orders: number;
  ctr: number;
  cpc: number;
  acos: number;
  classification?: string;
  inboxStatus?: string;
}

export interface SearchTermsSummary {
  totalImpressions: number;
  totalClicks: number;
  totalCost: number;
  totalSales: number;
  totalOrders: number;
  avgCtr: number;
  avgAcos: number;
  termsCount: number;
}

export interface SearchTermsResponse {
  items: SearchTermItem[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
  summary?: SearchTermsSummary;
  inboxCounts?: Record<string, number>;
  classificationCounts?: Record<string, number>;
}

export interface SearchTermsFilters {
  dateFrom: string;
  dateTo: string;
  bookId?: number;
  marketplace?: string;
  campaignId?: string;
  localCampaignId?: number;
  // Backend принимает одиночный account string. Если глобальный фильтр
  // выбрал ровно один — передаём, иначе undefined (без фильтрации).
  account?: string;
  keywordId?: string;
  termType?: 'keywords' | 'asins';
  classifications?: string[];
  inboxStatus?: string;
  minClicks?: number;
  minSpend?: number;
  search?: string;
  sortBy?: 'clicks' | 'cost' | 'sales' | 'acos' | 'orders' | 'impressions';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  perPage?: number;
}

function toQuery(
  f: SearchTermsFilters,
): Record<string, string | number | string[] | undefined> {
  return {
    date_from: f.dateFrom,
    date_to: f.dateTo,
    book_id: f.bookId,
    marketplace: f.marketplace,
    campaign_id: f.campaignId,
    local_campaign_id: f.localCampaignId,
    account: f.account,
    keyword_id: f.keywordId,
    term_type: f.termType,
    classification: f.classifications,
    inbox_status: f.inboxStatus,
    min_clicks: f.minClicks,
    min_spend: f.minSpend,
    search: f.search,
    sort_by: f.sortBy ?? 'clicks',
    sort_order: f.sortOrder ?? 'desc',
    page: f.page ?? 1,
    per_page: f.perPage ?? 50,
  };
}

export type NegativeMatchType = 'Exact' | 'Phrase';

export interface AddNegativeByTextResult {
  success: boolean;
  found_in_reports: boolean;
  search_term_id: number | null;
  negative_id: number | null;
  archived_status: boolean;
  related_statuses_archived: number;
  saved_to_list: boolean;
  error?: string;
}

// === Phase J.1 Lane A: inbox workflow ===

/**
 * Состояния inbox-конвейера. Совпадают со значениями `inbox_status`,
 * которые возвращает backend в `SearchTermItem` и в `inboxCounts`.
 */
export type SearchTermInboxStatus =
  | 'inbox'
  | 'snoozed'
  | 'done'
  | 'archived_pause'
  | 'archived_final';

export type SearchTermsTabId = SearchTermInboxStatus | 'all';

/**
 * Снуз: presets на 1/3/7 дней + опция custom date.
 * Backend ждёт абсолютную дату `until_date` (YYYY-MM-DD) либо `days` (1..30).
 */
export interface SnoozeRequest {
  // Один из ID search-term-ов (statusId / id из item-а). Bulk поддержан.
  statusIds: number[];
  // Преселектные кейсы — отправляем `days`. Custom — отправляем `untilDate`.
  days?: number;
  untilDate?: string; // YYYY-MM-DD
  reason?: string;
}

export interface SnoozeResult {
  updated: number;
}

/**
 * Pause: «отложить keyword/target до конкретной даты, потом вернуть в inbox».
 * Параллельно может pause-аить связанный ad-targeting.
 */
export interface PauseTargetsRequest {
  statusIds: number[];
  // 30/60/90/120 дней — фронт раскладывает в кнопки.
  days: number;
  reason?: string;
}

export interface PauseTargetsResult {
  updated: number;
  pausedTargets: number;
}

/**
 * Move keyword(s) → target ad-group + match-type + bid.
 */
export interface MoveTargetsRequest {
  statusIds: number[];
  adGroupId: number;
  matchType: 'Exact' | 'Phrase' | 'Broad';
  bid?: number;
  // Auto-add negative в исходный ad-group, чтобы избежать каннибализации.
  addNegative?: boolean;
}

export interface MoveTargetsResult {
  moved: number;
  failed: number;
  errors?: string[];
}

/**
 * Bulk inbox-status transition (snooze/done/return-to-inbox/archive).
 * Используется для тривиальных кейсов без ввода (done, inbox, archive_final).
 */
export interface BulkInboxUpdateRequest {
  statusIds: number[];
  newStatus: SearchTermInboxStatus;
}

export interface BulkInboxUpdateResult {
  updated: number;
}

/**
 * Rank-history: organic position over time. Endpoint опциональный — если
 * backend не подключил, возвращаем `null`. UI рисует graceful empty.
 */
export interface RankHistoryPoint {
  checkedAt: string;
  organicRank: number | null;
  organicPage: number | null;
}

export interface RankHistoryResponse {
  history: RankHistoryPoint[];
  // Если backend пустой/не подключён — null.
  unsupported?: boolean;
}

export interface TrendPoint {
  date: string;
  clicks: number;
  spend: number;
  orders: number;
  sales: number;
}

export interface TrendResponse {
  points: TrendPoint[];
  unsupported?: boolean;
}

/**
 * Опции get-target ad-groups для move-modal'a. Используем существующий
 * `/api/asins/:asinId/campaigns` через campaigns-API; here мы декларируем
 * shape для UI-консьюмера (modal сам подгружает campaigns + ad-groups).
 */
export interface AdGroupOption {
  id: number;
  campaignId: number;
  campaignName: string;
  name: string;
}

async function getOrNullOn404<T>(path: string): Promise<T | null> {
  try {
    return await apiClient.get<T>(path);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 501)) {
      return null;
    }
    throw err;
  }
}

export const searchTermsApi = {
  list(filters: SearchTermsFilters): Promise<SearchTermsResponse> {
    return apiClient.get<SearchTermsResponse>('/api/search-terms', toQuery(filters));
  },

  summary(
    filters: Pick<SearchTermsFilters, 'dateFrom' | 'dateTo' | 'bookId'>,
  ): Promise<SearchTermsSummary> {
    return apiClient.get<SearchTermsSummary>('/api/search-terms/summary', {
      date_from: filters.dateFrom,
      date_to: filters.dateTo,
      book_id: filters.bookId,
    });
  },

  addNegativeByText(params: {
    keywordText: string;
    campaignId: number;
    matchType?: NegativeMatchType;
  }): Promise<AddNegativeByTextResult> {
    return apiClient.post<AddNegativeByTextResult>(
      '/api/search-terms/add-negative-by-text',
      {
        keyword_text: params.keywordText,
        campaign_id: params.campaignId,
        match_type: params.matchType ?? 'Exact',
        level: 'campaign',
        sync_to_amazon: true,
      },
    );
  },

  // === Inbox workflow (Phase J.1 Lane A) ===

  /**
   * Bulk snooze. Поддерживает либо `days` (preset), либо абсолютный
   * `until_date` (custom date picker). При наличии обоих backend берёт
   * `until_date`.
   */
  snooze(req: SnoozeRequest): Promise<SnoozeResult> {
    return apiClient.post<SnoozeResult>('/api/search-terms/snooze', {
      status_ids: req.statusIds,
      days: req.days,
      until_date: req.untilDate,
      reason: req.reason,
    });
  },

  /**
   * Bulk pause: переводит выбранные search-terms в `archived_pause` со сроком
   * автоматического возврата в inbox. Также пытается paused-нуть связанные
   * targets (`paused_targets` в response).
   */
  pauseTargets(req: PauseTargetsRequest): Promise<PauseTargetsResult> {
    return apiClient.post<PauseTargetsResult>('/api/search-terms/pause', {
      status_ids: req.statusIds,
      days: req.days,
      reason: req.reason,
    });
  },

  /**
   * Bulk move keywords/targets в другой ad-group. Опционально создаёт
   * negative в исходном ad-group чтобы избежать каннибализации.
   */
  moveTargets(req: MoveTargetsRequest): Promise<MoveTargetsResult> {
    return apiClient.post<MoveTargetsResult>('/api/search-terms/move', {
      status_ids: req.statusIds,
      ad_group_id: req.adGroupId,
      match_type: req.matchType,
      bid: req.bid,
      add_negative: req.addNegative ?? false,
    });
  },

  /**
   * Bulk inbox-status transition. Используется для action'ов «не требующих
   * ввода»: done, inbox (return), archived_final.
   */
  bulkUpdateInboxStatus(req: BulkInboxUpdateRequest): Promise<BulkInboxUpdateResult> {
    return apiClient.post<BulkInboxUpdateResult>('/api/search-terms/bulk-status', {
      status_ids: req.statusIds,
      new_status: req.newStatus,
    });
  },

  /**
   * Rank history. Возвращает `null` если backend endpoint не подключён
   * (404/501). UI рисует graceful empty state «Endpoint не подключён».
   *
   * Query: keyword (required), book_id, marketplace, days (default 90).
   */
  async getRankHistory(params: {
    statusId: number;
    keyword: string;
    bookId?: number | null;
    marketplace?: string | null;
    days?: number;
  }): Promise<RankHistoryResponse | null> {
    const query = new URLSearchParams();
    query.set('keyword', params.keyword);
    if (params.bookId) query.set('book_id', String(params.bookId));
    if (params.marketplace) query.set('marketplace', params.marketplace);
    query.set('days', String(params.days ?? 90));
    const path = `/api/search-terms/${params.statusId}/rank-history?${query.toString()}`;
    return getOrNullOn404<RankHistoryResponse>(path);
  },

  /**
   * Daily trend for a search term. Возвращает `null` если backend endpoint
   * не подключён.
   */
  async getTrend(params: {
    statusId: number;
    days?: number;
  }): Promise<TrendResponse | null> {
    const query = new URLSearchParams();
    query.set('days', String(params.days ?? 30));
    const path = `/api/search-terms/${params.statusId}/trend?${query.toString()}`;
    return getOrNullOn404<TrendResponse>(path);
  },
};
