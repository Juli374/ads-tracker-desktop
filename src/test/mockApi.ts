import { vi } from 'vitest';
import type {
  AiGenerateResult,
  AiSettings,
  AiTestKeyResult,
  ApiRequestPayload,
  ApiResponse,
  AppInfo,
  AutoNegScanResult,
  AutoNegState,
  AutoNegThresholds,
  BriefingRunResult,
  DesktopApi,
  DialogOpenFileResult,
  LocalRoyaltyMonthSummary,
  LocalRoyaltyParseResult,
  LocalRoyaltyRecord,
  LocalRoyaltyUpload,
  MediaUploadPayload,
  MediaUploadResponse,
  UpdateStatus,
  WeeklyBriefing,
} from '../shared/ipc';
import {
  ALL_FEATURE_KEYS,
  type Entitlements,
  type FeatureKey,
  type FeatureState,
  type Tier,
} from '../shared/entitlements';

interface MockApiOptions {
  responses?: Record<string, unknown>;
  appInfo?: Partial<AppInfo>;
  apiBaseUrl?: string;
  token?: string | null;
  aiSettings?: Partial<AiSettings>;
  aiTestKey?: AiTestKeyResult;
  /** Phase L Lane A: pre-canned `ai.generate` response. */
  aiGenerateResult?: AiGenerateResult;
  /** Path returned by `dialog.openFile`. `null` simulates a cancelled picker. */
  dialogPath?: string | null;
  /** Pre-canned `localRoyalty.parseFile` result. */
  parseResult?: LocalRoyaltyParseResult;
  /** Pre-canned `mediaUpload` response (defaults to a 200 success). */
  mediaUploadResponse?: MediaUploadResponse;
  /**
   * Phase K: pre-canned entitlements. Tests могут передать `{ tier: 'start' }`
   * чтобы протестить locked-state, или `{ tier: 'pro' }` для unlocked.
   * Если не передано — default tier='pro', все features `on` (большинство
   * существующих тестов написаны до Phase K и не должны ломаться).
   */
  entitlements?: Partial<Entitlements> & { tier?: Tier };
  /** Phase L.2 Lane B — override autoNeg.getState() return value. */
  autoNegState?: AutoNegState;
  /** Phase L.2 Lane B — override autoNeg.getSettings() return value. */
  autoNegThresholds?: AutoNegThresholds;
  /** Phase L.2 Lane B — override autoNeg.runNow() return value. */
  autoNegScanResult?: AutoNegScanResult;
  /** Phase M.5 Lane E — override briefing.getLast() return value. */
  briefingLast?: WeeklyBriefing | null;
  /** Phase M.5 Lane E — override briefing.list() return value. */
  briefingList?: WeeklyBriefing[];
  /** Phase M.5 Lane E — override briefing.runNow() return value. */
  briefingRunResult?: BriefingRunResult;
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
  // can override via options.mediaUploadResponse or vi.stubGlobal('api', {...}).
  const mediaUploadResponse: MediaUploadResponse = options.mediaUploadResponse ?? {
    ok: true,
    status: 200,
    data: { url: 'https://test.local/uploaded.png' },
  };
  const mediaUpload = vi.fn(
    async (): Promise<MediaUploadResponse> => mediaUploadResponse,
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

  // Phase J.4 Lane D defaults.
  const dialogPath = options.dialogPath === undefined ? null : options.dialogPath;
  const defaultParseResult: LocalRoyaltyParseResult = {
    records: [
      {
        asin: 'B01TEST001',
        book_title: 'Mock Book',
        units: 5,
        royalty: 12.5,
        revenue: 12.5,
        currency: 'USD',
      },
    ],
    warnings: [],
    format: 'monthly-royalty',
    source_path: dialogPath ?? '/mock/path/report.xlsx',
  };
  const parseResult = options.parseResult ?? defaultParseResult;

  // Phase K: build mock entitlements. Default = tier='pro' with all features ON,
  // чтобы существующие тесты, которые не знают про tier-gating, продолжали
  // видеть фичи без блокировок.
  const mockTier: Tier = options.entitlements?.tier ?? 'pro';
  const allFeaturesOn = mockTier !== 'start';
  const baseFeatures = Object.fromEntries(
    ALL_FEATURE_KEYS.map((k: FeatureKey) => [
      k,
      allFeaturesOn
        ? ({ state: 'on' } as FeatureState)
        : ({ state: 'off', reason: 'tier' } as FeatureState),
    ]),
  ) as Record<FeatureKey, FeatureState>;
  const mockEntitlements: Entitlements = {
    v: 1,
    issued_at: '2026-05-14T00:00:00Z',
    expires_at: '2026-05-14T01:00:00Z',
    user_id: 1,
    tier: mockTier,
    subscription: { status: mockTier === 'start' ? 'none' : 'active' },
    features: baseFeatures,
    sig: 'mock-sig',
    ...options.entitlements,
    // Объединяем features из options поверх baseFeatures если есть
    ...(options.entitlements?.features
      ? { features: { ...baseFeatures, ...options.entitlements.features } }
      : {}),
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
      // Phase I.2 Lane B
      getLogPath: vi.fn(async () => '/mock/logs/ads-tracker.log'),
      // Phase I.7 Lane G
      getGitCommit: vi.fn(async () => 'test123'),
    },
    auth: {
      getToken: vi.fn(async () => options.token ?? 'at_live_test_token_xxxxxxxx'),
      setToken: vi.fn(async () => undefined),
      clearToken: vi.fn(async () => undefined),
      // Phase I.4 Lane D: 401 push-event from main. Default noop subscribe.
      onExpired: vi.fn(() => () => undefined),
    },
    request,
    mediaUpload,
    onDeepLink: vi.fn(() => () => undefined),
    shell: {
      openExternal: vi.fn(async () => undefined),
      // Phase I.2 Lane B
      showItemInFolder: vi.fn(async () => undefined),
    },
    // Phase I.2 Lane B — renderer log forwarder.
    log: {
      error: vi.fn(async () => undefined),
      warn: vi.fn(async () => undefined),
      info: vi.fn(async () => undefined),
      debug: vi.fn(async () => undefined),
    },
    // Phase I.4 Lane D: OAuth CSRF state. Default mocks return empty state.
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
      // Phase J.4 Lane D
      parseFile: vi.fn(async () => parseResult),
    },
    update: {
      getStatus: vi.fn(async () => updateIdle),
      check: vi.fn(async () => updateIdle),
      quitAndInstall: vi.fn(async () => undefined),
      // Phase Q.5+
      setAutoDownload: vi.fn(async () => updateIdle),
      downloadNow: vi.fn(async () => updateIdle),
      // Push subscription; default mock is a no-op that returns an unsubscribe.
      onChange: vi.fn(() => () => undefined),
    },
    // Phase J.3 Lane C: AI settings + test-key channel.
    // Phase J.7 Lane G: AI Advisor streaming.
    ai: {
      getSettings: vi.fn(async (): Promise<AiSettings> => ({
        claudeKey: '',
        models: {
          completion: 'claude-opus-4-7',
          vision: 'claude-opus-4-7',
          fast: 'claude-haiku-4-5',
          advisor: 'claude-opus-4-7',
        },
        brandVoice: { pov: '', toneWords: [], bannedWords: [] },
        ...options.aiSettings,
      })),
      setSettings: vi.fn(async () => undefined),
      testKey: vi.fn(
        async (): Promise<AiTestKeyResult> =>
          options.aiTestKey ?? { ok: true, status: 200 },
      ),
      streamStart: vi.fn(async () => undefined),
      streamCancel: vi.fn(async () => undefined),
      onStreamChunk: vi.fn(() => () => undefined),
      // Phase L Lane A: one-shot generation. Default returns a deterministic
      // stub so tests can assert the wiring without caring about content.
      generate: vi.fn(
        async (): Promise<AiGenerateResult> =>
          options.aiGenerateResult ?? {
            text: 'Mock AI-generated copy: A Thrilling New Adventure',
            rationale: 'Mock rationale: emphasises action and curiosity.',
            model: 'claude-opus-4-7',
          },
      ),
    },
    // Phase J.4 Lane D: native open-file dialog.
    dialog: {
      openFile: vi.fn(async (): Promise<DialogOpenFileResult> => ({ path: dialogPath })),
    },
    // Phase K: entitlements skeleton. Default tier='pro' all-on (см. выше).
    // Tests могут переопределить через `installMockApi({ entitlements: { tier: 'start' } })`.
    entitlements: {
      get: vi.fn(async () => mockEntitlements),
      refresh: vi.fn(async () => mockEntitlements),
      onChange: vi.fn(() => () => undefined),
    },
    // Phase L.2 Lane B — Auto-Negativator. Default disabled, defaults for
    // thresholds, no last-run. Tests can override via options.autoNegState /
    // options.autoNegThresholds / options.autoNegScanResult.
    autoNeg: {
      getState: vi.fn(
        async (): Promise<AutoNegState> =>
          options.autoNegState ?? {
            enabled: false,
            lastRunAt: null,
            lastRecommendationCount: 0,
            nextRunAt: null,
            lastError: null,
          },
      ),
      toggle: vi.fn(
        async (enabled: boolean): Promise<AutoNegState> => ({
          enabled,
          lastRunAt: null,
          lastRecommendationCount: 0,
          nextRunAt: null,
          lastError: null,
          ...options.autoNegState,
        }),
      ),
      runNow: vi.fn(
        async (): Promise<AutoNegScanResult> =>
          options.autoNegScanResult ?? {
            added: 0,
            inspected: 0,
            skipped: 0,
            errors: [],
          },
      ),
      getSettings: vi.fn(
        async (): Promise<AutoNegThresholds> =>
          options.autoNegThresholds ?? {
            minClicks: 10,
            minAcosMultiplier: 1.5,
            minOrdersForAcos: 2,
          },
      ),
      setSettings: vi.fn(
        async (t: AutoNegThresholds): Promise<AutoNegThresholds> => t,
      ),
      onStateChange: vi.fn(() => () => undefined),
    },
    // Phase M.5 Lane E — Weekly Author Briefing. Default: nothing yet.
    briefing: {
      getLast: vi.fn(
        async (): Promise<WeeklyBriefing | null> =>
          options.briefingLast === undefined ? null : options.briefingLast,
      ),
      list: vi.fn(
        async (): Promise<WeeklyBriefing[]> => options.briefingList ?? [],
      ),
      runNow: vi.fn(
        async (): Promise<BriefingRunResult> =>
          options.briefingRunResult ?? {
            briefing: {
              id: 1,
              generated_at: '2026-05-14T09:00:00Z',
              period_from: '2026-05-07',
              period_to: '2026-05-14',
              content: 'Top movers:\n- Test Book performed well.\n\nUnderperforming:\n- N/A this week.\n\nSuggested actions:\n- Keep going.',
              model: 'claude-opus-4-7',
            },
          },
      ),
      onChange: vi.fn(() => () => undefined),
    },
    // Phase M.4 — Cover QA. Default: report says ok with no failed checks.
    coverQa: {
      check: vi.fn(async () => ({
        width: 1600,
        height: 2560,
        aspectRatio: 1.6,
        dpi: 300,
        format: 'png',
        colorSpace: 'srgb',
        fileSize: 1024 * 500,
        checks: [],
      })),
    },
    // Phase N — Telemetry consent. Default: opted out (matches main default).
    // Tests that exercise the privacy UI can override via vi.stubGlobal.
    telemetry: {
      getConsent: vi.fn(async () => false),
      setConsent: vi.fn(async () => undefined),
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
    // Phase J.1 Lane A — multiple terms in inbox + counts so tab badges render.
    '/api/search-terms': {
      items: [
        {
          id: 1,
          searchTerm: 'crockpot recipes',
          campaignId: 'C100',
          campaignName: 'Test Campaign',
          localCampaignId: 100,
          bookId: 1,
          bookTitle: 'Test Book',
          marketplace: 'USA',
          currency: 'USD',
          keywordId: 'kw-1',
          keywordText: 'crockpot',
          matchType: 'broad',
          termType: 'keyword',
          impressions: 1000,
          clicks: 50,
          cost: 25,
          sales: 0,
          orders: 0,
          ctr: 5,
          cpc: 0.5,
          acos: 0,
          classification: 'WASTEFUL',
          inboxStatus: 'inbox',
        },
        {
          id: 2,
          searchTerm: 'slow cooker dinner',
          campaignId: 'C100',
          campaignName: 'Test Campaign',
          localCampaignId: 100,
          bookId: 1,
          bookTitle: 'Test Book',
          marketplace: 'USA',
          currency: 'USD',
          keywordId: 'kw-1',
          keywordText: 'crockpot',
          matchType: 'broad',
          termType: 'keyword',
          impressions: 800,
          clicks: 40,
          cost: 18,
          sales: 60,
          orders: 3,
          ctr: 5,
          cpc: 0.45,
          acos: 30,
          classification: 'PROFITABLE',
          inboxStatus: 'inbox',
        },
        {
          id: 3,
          searchTerm: 'B0EXAMPLE1',
          campaignId: 'C100',
          campaignName: 'Test Campaign',
          localCampaignId: 100,
          bookId: 1,
          bookTitle: 'Test Book',
          marketplace: 'USA',
          currency: 'USD',
          termType: 'asin',
          impressions: 500,
          clicks: 25,
          cost: 12,
          sales: 0,
          orders: 0,
          ctr: 5,
          cpc: 0.48,
          acos: 0,
          classification: 'IRRELEVANT',
          inboxStatus: 'inbox',
        },
      ],
      total: 3,
      page: 1,
      per_page: 50,
      pages: 1,
      summary: {
        totalImpressions: 2300,
        totalClicks: 115,
        totalCost: 55,
        totalSales: 60,
        totalOrders: 3,
        avgCtr: 5,
        avgAcos: 91.7,
        termsCount: 3,
      },
      // Tab badges read counts from this object.
      inboxCounts: {
        inbox: 3,
        snoozed: 2,
        done: 5,
        archived_pause: 1,
        archived_final: 4,
        total: 15,
      },
      classificationCounts: {
        WASTEFUL: 1,
        PROFITABLE: 1,
        IRRELEVANT: 1,
      },
    },
    // Phase J.1 Lane A — bulk action endpoints (default success shape).
    // Tests can override via installMockApi({responses: {...}}).
    '/api/search-terms/snooze': { updated: 0 },
    '/api/search-terms/pause': { updated: 0, pausedTargets: 0 },
    '/api/search-terms/move': { moved: 0, failed: 0 },
    '/api/search-terms/bulk-status': { updated: 0 },
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
    '/api/metrics/summary/hourly': {
      date_from: '2026-05-01',
      date_to: '2026-05-15',
      attribution_window: '7d',
      hourly: [
        { hour: '2026-05-15T08:00:00Z', spend: 5, sales: 20, orders: 1, acos: 25 },
        { hour: '2026-05-15T14:00:00Z', spend: 12, sales: 50, orders: 3, acos: 24 },
        { hour: '2026-05-15T22:00:00Z', spend: 3, sales: 8, orders: 0, acos: 37.5 },
        { hour: '2026-05-13T10:00:00Z', spend: 9, sales: 40, orders: 2, acos: 22.5 },
      ],
    },
    '/api/metrics/budget-pacing': {
      date_from: '2026-05-01',
      date_to: '2026-05-31',
      month_start: '2026-05-01',
      campaigns: [
        {
          campaign_id: 100,
          campaign_name: 'Test Campaign',
          marketplace: 'USA',
          monthly_budget: 300,
          month_to_date_spend: 200,
          projected_spend: 410,
          daily_spend: [10, 12, 8, 14, 11, 16, 9, 13, 12, 10, 14, 17, 18, 16],
        },
        {
          campaign_id: 101,
          campaign_name: 'Brand Defense',
          marketplace: 'UK',
          monthly_budget: 600,
          month_to_date_spend: 280,
          projected_spend: 595,
          daily_spend: [18, 22, 24, 19, 21, 17, 25, 22, 18, 20, 24, 26, 22, 23],
        },
        {
          campaign_id: 102,
          campaign_name: 'Underspending',
          marketplace: 'DE',
          monthly_budget: 1000,
          month_to_date_spend: 200,
          projected_spend: 415,
          daily_spend: [12, 14, 16, 11, 15, 18, 14, 13, 17, 12, 13, 14, 16, 15],
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
    // Phase J.2 Lane B — bulk targets endpoints. Caller передаёт
    // target_ids[] + payload; mock возвращает { updated: count } чтобы
    // KeywordsTable показал toast «Updated N targets».
    '/api/targets/bulk-pause': { updated: 1, message: 'OK' },
    '/api/targets/bulk-resume': { updated: 1, message: 'OK' },
    '/api/targets/bulk-update-bid': { updated: 1, message: 'OK' },
    '/api/targets/bulk-move': { updated: 1, message: 'OK' },
    '/api/targets/bulk-add-negative': { added: 1, message: 'OK' },
    // Phase J.2 Lane B — per-week placement breakdown. Если backend
    // не выкатан, getPlacementHistory вернёт null (тест проверяет 404
    // через path: '/api/campaigns/100/placement-history' отсутствует).
    // По умолчанию рендерим минимальный shape с одной неделей.
    '/api/campaigns/100/placement-history': {
      campaign_id: 100,
      weeks: [
        {
          week_start: '2026-05-04',
          week_end: '2026-05-10',
          week_label: 'W19',
          is_current: true,
          top_of_search: {
            impressions: 1000, clicks: 100, cost: 50, sales: 200, orders: 10,
            acos: 25, ctr: 10, percent: 60,
          },
          product_pages: {
            impressions: 500, clicks: 30, cost: 15, sales: 60, orders: 3,
            acos: 25, ctr: 6, percent: 25,
          },
          rest_of_search: {
            impressions: 200, clicks: 10, cost: 5, sales: 20, orders: 1,
            acos: 25, ctr: 5, percent: 15,
          },
        },
      ],
    },
  };
}
