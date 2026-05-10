import { vi } from 'vitest';
import type {
  ApiRequestPayload,
  ApiResponse,
  AppInfo,
  DesktopApi,
  LocalRoyaltyMonthSummary,
  LocalRoyaltyRecord,
  LocalRoyaltyUpload,
  MediaUploadPayload,
  MediaUploadResponse,
  UpdateStatus,
} from '../shared/ipc';

interface MockApiOptions {
  responses?: Record<string, unknown>;
  appInfo?: Partial<AppInfo>;
  apiBaseUrl?: string;
  token?: string | null;
}

export function installMockApi(options: MockApiOptions = {}): void {
  const responses = options.responses ?? {};

  const request = vi.fn(async (payload: ApiRequestPayload): Promise<ApiResponse> => {
    const data = responses[payload.path];
    if (data === undefined) {
      return { status: 404, ok: false, data: null, error: 'Not mocked' };
    }
    return { status: 200, ok: true, data };
  }) as unknown as <T = unknown>(payload: ApiRequestPayload) => Promise<ApiResponse<T>>;

  // Multipart upload — default success shape; tests that need different behaviour
  // can override via vi.stubGlobal('api', {...}) (see upload.test.ts).
  const mediaUpload = vi.fn(
    async (): Promise<MediaUploadResponse> => ({
      ok: true,
      status: 200,
      data: { url: 'https://test.local/uploaded.png' },
    }),
  ) as unknown as <T = unknown>(payload: MediaUploadPayload) => Promise<MediaUploadResponse<T>>;

  // Local royalty store — shapes mirror cloud /api/royalties/* responses (see
  // src/main/local-db/royalty.ts for the source of truth). Default mocks return
  // realistic, deterministic values so RoyaltiesPage in local-mode renders.
  const localRoyaltyUpload: LocalRoyaltyUpload = {
    id: 1,
    account_id: 1,
    account_name: 'Test Account',
    marketplace: 'USA',
    target_month: '2026-04',
    uploaded_at: '2026-05-01T00:00:00Z',
    source_filename: 'royalty-2026-04.xlsx',
    total_units: 100,
    total_royalty: 200,
    total_revenue: 500,
    currency: 'USD',
  };

  const localRoyaltyRecord: LocalRoyaltyRecord = {
    id: 1,
    upload_id: 1,
    asin: 'B0TEST0001',
    book_title: 'Test Book',
    marketplace: 'USA',
    target_month: '2026-04',
    units: 100,
    royalty: 200,
    revenue: 500,
    currency: 'USD',
  };

  const localRoyaltySummary: LocalRoyaltyMonthSummary = {
    target_month: '2026-04',
    totals: { units: 100, royalty: 200, revenue: 500 },
    by_marketplace: [
      { marketplace: 'USA', units: 100, royalty: 200, revenue: 500 },
    ],
  };

  const updateIdle: UpdateStatus = {
    state: 'idle',
    enabled: false,
  };

  (window as unknown as { api: DesktopApi }).api = {
    app: {
      getInfo: vi.fn(async (): Promise<AppInfo> => ({
        version: '0.1.0',
        platform: 'darwin' as NodeJS.Platform,
        isPackaged: false,
        ...options.appInfo,
      })),
      getApiBaseUrl: vi.fn(async () => options.apiBaseUrl ?? 'https://test.local'),
    },
    auth: {
      getToken: vi.fn(async () => options.token ?? 'at_live_test_token_xxxxxxxx'),
      setToken: vi.fn(async () => undefined),
      clearToken: vi.fn(async () => undefined),
      // 401 push-event from main; tests don't need to fire it, just unsubscribe noop.
      onExpired: vi.fn(() => () => undefined),
    },
    request,
    mediaUpload,
    onDeepLink: vi.fn(() => () => undefined),
    shell: {
      openExternal: vi.fn(async () => undefined),
    },
    oauth: {
      writeState: vi.fn(async () => undefined),
      consumeState: vi.fn(async () => null),
    },
    localRoyalty: {
      listUploads: vi.fn(async () => [localRoyaltyUpload]),
      listRecords: vi.fn(async () => [localRoyaltyRecord]),
      getSummary: vi.fn(async () => localRoyaltySummary),
      import: vi.fn(async () => ({
        upload_id: 1,
        records_added: 1,
      })),
      delete: vi.fn(async () => ({ deleted: 1 })),
      filePath: vi.fn(async () => '/tmp/test-royalty.json'),
    },
    update: {
      getStatus: vi.fn(async () => updateIdle),
      check: vi.fn(async () => updateIdle),
      quitAndInstall: vi.fn(async () => undefined),
      // Push subscription; default mock is a no-op that returns an unsubscribe.
      onChange: vi.fn(() => () => undefined),
    },
  };
}

export function mockApiResponses(): Record<string, unknown> {
  return {
    '/api/auth/verify': {
      valid: true,
      user: {
        id: 1,
        email: 'test@test.local',
        full_name: 'Test User',
        role: 'user',
        avatar: null,
      },
    },
    '/api/metrics/summary/by-book': {
      date_from: '2026-05-01',
      date_to: '2026-05-15',
      attribution_window: '7d',
      books: [
        {
          book_id: 1,
          title: 'Test Book',
          cover_image: null,
          account: 'Test',
          marketplace: 'USA',
          currency: 'USD',
          impressions: 1000,
          clicks: 100,
          cost: 50,
          sales: 200,
          orders: 10,
          ctr: 10,
          cpc: 0.5,
          acos: 25,
          royalty: 80,
          profit: 30,
          tacos: 12.5,
          roas: 4,
        },
      ],
    },
    '/api/metrics/summary/by-campaign': {
      date_from: '2026-05-01',
      date_to: '2026-05-15',
      attribution_window: '7d',
      total_count: 1,
      campaigns: [
        {
          campaign_id: 100,
          amazon_campaign_id: 'C100',
          campaign_name: 'Test Campaign',
          campaign_type: 'sp',
          targeting_type: 'manual',
          status: 'enabled',
          book_id: 1,
          book_title: 'Test Book',
          book_cover: null,
          marketplace: 'USA',
          currency: 'USD',
          impressions: 500,
          clicks: 50,
          cost: 25,
          sales: 100,
          orders: 5,
          ctr: 10,
          cpc: 0.5,
          cr: 10,
          acos: 25,
          profit: 15,
        },
      ],
    },
    '/api/metrics/summary/daily': {
      date_from: '2026-05-01',
      date_to: '2026-05-15',
      attribution_window: '7d',
      daily: [
        {
          date: '2026-05-15',
          impressions: 100,
          clicks: 10,
          spend: 5,
          sales: 20,
          orders: 1,
          ctr: 10,
          cpc: 0.5,
          cr: 10,
          acos: 25,
          roi: 4,
          royalty: 8,
          profit: 3,
        },
      ],
    },
    '/api/metrics/summary/weekly': {
      date_from: '2026-05-01',
      date_to: '2026-05-15',
      attribution_window: '7d',
      weekly: [
        {
          week_start: '2026-05-09',
          week_end: '2026-05-15',
          impressions: 700,
          clicks: 70,
          spend: 35,
          sales: 140,
          orders: 7,
          ctr: 10,
          cpc: 0.5,
          cr: 10,
          acos: 25,
          roi: 4,
          royalty: 56,
          profit: 21,
        },
      ],
    },
    '/api/metrics/summary/by-marketplace': {
      date_from: '2026-05-01',
      date_to: '2026-05-15',
      attribution_window: '7d',
      marketplaces: {
        USA: {
          impressions: 1000,
          clicks: 100,
          cost: 50,
          sales: 200,
          orders: 10,
          ctr: 10,
          cpc: 0.5,
          cr: 10,
          acos: 25,
          royalty: 80,
          profit: 30,
          tacos: 12.5,
          roas: 4,
        },
      },
    },
    '/api/search-terms': {
      items: [],
      total: 0,
      page: 1,
      per_page: 50,
      pages: 0,
      summary: {
        totalImpressions: 0,
        totalClicks: 0,
        totalCost: 0,
        totalSales: 0,
        totalOrders: 0,
        avgCtr: 0,
        avgAcos: 0,
        termsCount: 0,
      },
      inboxCounts: {},
      classificationCounts: {},
    },
    '/api/metrics/summary/overview': {
      date_from: '2026-05-01',
      date_to: '2026-05-15',
      prev_date_from: '2026-04-16',
      prev_date_to: '2026-04-30',
      attribution_window: '7d',
      current_period: {
        impressions: 10000, clicks: 500, spend: 200, sales: 800, orders: 40,
        acos: 25, roi: 4, ctr: 5, royalty: 320, profit: 120, tacos: 12.5, roas: 4,
      },
      previous_period: {
        impressions: 9000, clicks: 450, spend: 220, sales: 700, orders: 35,
        acos: 31.4, roi: 3.18, ctr: 5, royalty: 280, profit: 60, tacos: 14.2, roas: 3.18,
      },
      changes: {
        impressions: 11.1, clicks: 11.1, spend: -9.1, sales: 14.3, orders: 14.3,
        acos: -20.4, roi: 25.8, ctr: 0, royalty: 14.3, profit: 100, tacos: -12, roas: 25.8,
      },
    },
    '/api/metrics/summary/top-performers': {
      date_from: '2026-05-01',
      date_to: '2026-05-15',
      attribution_window: '7d',
      books: {
        winners: [
          { id: 1, title: 'Test Book', cover_image: null, profit: 30, spend: 50, sales: 200, orders: 10, acos: 25 },
        ],
        losers: [],
      },
      campaigns: {
        winners: [
          { id: 100, name: 'Test Campaign', book_title: 'Test Book', marketplace: 'USA', campaign_type: 'sp', profit: 15, spend: 25, sales: 100, orders: 5, acos: 25 },
        ],
        losers: [],
      },
    },
    '/api/alerts': { alerts: [] },
    // Campaign details: ad groups, targets, negatives
    '/api/campaigns/100/ad-groups': [
      {
        id: 1000,
        campaign_id: 100,
        name: 'AG-1',
        default_bid: 0.5,
        state: 'enabled',
        targets_count: 1,
      },
    ],
    '/api/campaigns/100/targets': [
      {
        id: 5000,
        ad_group_id: 1000,
        campaign_id: 100,
        keyword_text: 'test keyword',
        match_type: 'exact',
        bid: 0.5,
        state: 'enabled',
      },
    ],
    '/api/campaigns/100/negatives': [],
    '/api/metrics/summary/by-keyword': {
      date_from: '2026-05-01',
      date_to: '2026-05-15',
      attribution_window: '7d',
      total_count: 1,
      keywords: [
        {
          keyword_id: 'kw-1',
          keyword_text: 'test keyword',
          match_type: 'exact',
          target_type: 'keyword',
          campaign_id: 100,
          campaign_name: 'Test Campaign',
          ad_group_id: 1000,
          ad_group_name: 'AG-1',
          book_id: 1,
          book_title: 'Test Book',
          book_cover: null,
          marketplace: 'USA',
          currency: 'USD',
          target_id: 5000,
          bid: 0.5,
          status: 'enabled',
          impressions: 100,
          clicks: 10,
          cost: 5,
          sales: 20,
          orders: 1,
          ctr: 10,
          cpc: 0.5,
          cr: 10,
          acos: 25,
          profit: 3,
        },
      ],
    },
    '/api/actions/recent': {
      actions: [
        {
          id: 1,
          book_id: 1,
          marketplace: 'USA',
          campaign_id: 100,
          action_type: 'change_bid',
          entity_type: 'target',
          entity_id: 5000,
          entity_name: 'test keyword',
          field: 'bid',
          old_value: '0.5',
          new_value: '0.75',
          reason: 'Низкий CTR при высоком bid',
          source: 'manual',
          is_experiment: false,
          experiment_id: null,
          week_number: 19,
          year: 2026,
          wednesday_date: null,
          metrics_before: { spend: 5, sales: 20, orders: 1, acos: 25 },
          metrics_after: { spend: 7, sales: 30, orders: 2, acos: 23 },
          impact_calculated_at: null,
          created_at: '2026-05-09T10:00:00Z',
          book_title: 'Test Book',
        },
      ],
      total: 1,
    },
    '/api/automation/recommendations': {
      items: [
        {
          id: 10,
          ruleId: 1,
          ruleCode: 'high-acos',
          ruleName: 'ACOS выше цели',
          category: 'bid',
          entityType: 'keyword',
          entityId: 5000,
          entityName: 'test keyword',
          campaignId: 100,
          campaignName: 'Test Campaign',
          marketplace: 'USA',
          actionType: 'pause',
          actionDescription: 'Поставить на паузу — ACOS 75% > target 30%',
          actionParams: {},
          reason: 'Спендим без продаж',
          metricsSnapshot: { spend: 25, sales: 33, acos: 75, clicks: 50 },
          status: 'pending',
          priority: 'high',
          createdAt: '2026-05-08T12:00:00Z',
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
      stats: {
        total: 1,
        pending: 1,
        applied: 0,
        dismissed: 0,
        snoozed: 0,
      },
    },
    '/api/negative-lists': [
      {
        id: 1,
        bookId: null,
        name: 'Brand exclusions',
        description: 'Конкуренты',
        isDefault: false,
        itemCount: 0,
        createdAt: '2026-05-01T00:00:00Z',
        isGlobal: true,
      },
    ],
    '/api/marketplaces': ['USA', 'UK', 'CA', 'AU', 'DE', 'FR', 'ES', 'IT'],
    '/api/amazon-ads/profiles': [],
    '/api/royalties/uploads': [
      {
        id: 1,
        account_id: 1,
        account_name: 'Test',
        marketplace: 'USA',
        target_month: '2026-04',
        uploaded_at: '2026-05-01T00:00:00Z',
        total_units: 100,
        total_royalty: 200,
        total_revenue: 500,
      },
    ],
    '/api/royalties/summary/2026-04': { target_month: '2026-04' },
    '/api/tasks': [
      { id: 1, title: 'Test task', status: 'todo', priority: 'medium' },
    ],
    '/api/calendar/upcoming-events': [],
    '/api/accounting/accounts': [],
    '/api/accounting/categories': [],
    '/api/accounting/transactions': [],
    '/api/metrics/summary/by-placement': {
      date_from: '2026-05-01',
      date_to: '2026-05-15',
      attribution_window: '7d',
      placements: [
        {
          placement: 'top_of_search',
          impressions: 1000,
          clicks: 100,
          cost: 50,
          sales: 200,
          orders: 10,
          ctr: 10,
          acos: 25,
        },
      ],
    },
    '/api/notifications/unread-count': {
      unread_count: 0,
      billing_alerts_count: 0,
      total: 0,
    },
    '/api/notifications': { notifications: [], count: 0 },
    '/api/books': [
      {
        id: 1,
        title: 'Test Book',
        subtitle: null,
        cover_image: null,
        amazon_link: null,
        trim_size: '6x9',
        interior_type: 'bw_cream',
        page_count: 100,
        account: 'Test',
        publication_date: null,
      },
    ],
  };
}
