import { vi } from 'vitest';
import type { ApiRequestPayload, ApiResponse, AppInfo } from '../shared/ipc';

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

  (window as unknown as { api: unknown }).api = {
    app: {
      getInfo: vi.fn(async (): Promise<AppInfo> => ({
        version: '0.1.0',
        platform: 'darwin' as NodeJS.Platform,
        isPackaged: false,
        ...options.appInfo,
      })),
      getApiBaseUrl: vi.fn(async () => options.apiBaseUrl ?? 'http://test.local'),
    },
    auth: {
      getToken: vi.fn(async () => options.token ?? 'at_live_test_token_xxxxxxxx'),
      setToken: vi.fn(async () => undefined),
      clearToken: vi.fn(async () => undefined),
    },
    request,
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
    '/api/marketplaces': [
      { code: 'USA', name: 'United States', currency: 'USD' },
      { code: 'UK', name: 'United Kingdom', currency: 'GBP' },
    ],
  };
}
