// Phase K — Tier-gating skeleton.
//
// Shared schema between main and renderer. Зеркалит то, что backend будет
// возвращать на GET /api/me/entitlements. Пока backend не выкатан — fallback
// на EMPTY_ENTITLEMENTS, либо force-tier через `ADS_TRACKER_FORCE_TIER` env.
//
// Идея: server отдаёт **детерминированный snapshot** платных фич юзера.
// Renderer берёт его (через IPC) и делает feature-gating чисто декларативно:
// `useEntitlement('ai.advisor_panel')` → `{on, state, tierRequired}`.

/** Тарифные уровни. Расширяемые, но строго одна шкала: start < pro < business. */
export type Tier = 'start' | 'pro' | 'business';

/**
 * Все известные feature keys. Хранится здесь, чтобы:
 *   - renderer мог проверять `useEntitlement(<key>)` с type-safety;
 *   - main мог валидировать payload от backend.
 *
 * Соответствует §B.6 master-plan'а. При добавлении новых фич — расширять и
 * этот union, и DEFAULT_TIER_FOR_FEATURE ниже.
 */
export type FeatureKey =
  | 'ai.title_generator'
  | 'ai.advisor_panel'
  | 'ai.reverse_asin'
  // Phase M.1 — Niche Explorer (Research page with keyword/ASIN sub-tabs +
  // AI-synthesised saturation/weak-cover analysis). Pro tier.
  | 'ai.niche_explorer'
  // Phase M.5 Lane E — Weekly Author Briefing (Pro tier). main-process cron
  // composes a digest of the last 7 days and runs it through Anthropic; result
  // is stored locally + push-notified.
  | 'ai.weekly_briefing'
  // Phase M.3 — Bid Co-pilot. Pro tier. Extends AIAdvisorPanel with a bulk-apply
  // table: «Lower bid 12% on these 8 keywords» → one click BULK PATCH через
  // existing targets API (Phase J.2).
  | 'ai.bid_copilot'
  | 'analytics.hourly_dynamics'
  | 'analytics.multi_period_metrics'
  | 'analytics.search_terms_deep'
  | 'marketplace.multi'
  | 'automation.rules'
  | 'automation.scheduled_reports'
  | 'books.bulk_import'
  | 'royalties.advanced_breakdown'
  | 'export.unlimited'
  | 'support.priority';

/** Полный список всех FeatureKey — нужен для DRY-инициализации EMPTY_ENTITLEMENTS. */
export const ALL_FEATURE_KEYS: readonly FeatureKey[] = [
  'ai.title_generator',
  'ai.advisor_panel',
  'ai.reverse_asin',
  'ai.niche_explorer',
  'ai.weekly_briefing',
  'ai.bid_copilot',
  'analytics.hourly_dynamics',
  'analytics.multi_period_metrics',
  'analytics.search_terms_deep',
  'marketplace.multi',
  'automation.rules',
  'automation.scheduled_reports',
  'books.bulk_import',
  'royalties.advanced_breakdown',
  'export.unlimited',
  'support.priority',
] as const;

/**
 * Дефолтный минимальный tier для каждой фичи. Используется в `useEntitlement` /
 * UpgradeModal, чтобы показать корректный CTA («Upgrade to Pro» / «Business»).
 * Источник правды на ENV рендера — здесь хранить нельзя бэкенду-only логику,
 * это статичный mapping для UX-нужд.
 */
export const DEFAULT_TIER_FOR_FEATURE: Record<FeatureKey, Tier> = {
  'ai.title_generator': 'pro',
  'ai.advisor_panel': 'pro',
  'ai.reverse_asin': 'pro',
  'ai.niche_explorer': 'pro',
  'ai.weekly_briefing': 'pro',
  'ai.bid_copilot': 'pro',
  'analytics.hourly_dynamics': 'pro',
  'analytics.multi_period_metrics': 'pro',
  'analytics.search_terms_deep': 'pro',
  'marketplace.multi': 'business',
  'automation.rules': 'business',
  'automation.scheduled_reports': 'business',
  'books.bulk_import': 'pro',
  'royalties.advanced_breakdown': 'pro',
  'export.unlimited': 'pro',
  'support.priority': 'business',
};

/**
 * Per-feature state. Renderer ветвится по `state`:
 *   - 'on'      → фича доступна
 *   - 'off'     → закрыто; `reason` объясняет почему (для UpgradeModal CTA)
 *   - 'trial'   → доступно до `until` (ISO timestamp)
 *
 * 'off.reason'='tier' — самый частый кейс (start, фича за pro). Остальные —
 * 'expired' (подписка истекла), 'admin_off' (агентство отключило), 'unknown'
 * (server вернул unknown reason — fail-closed: показать UpgradeModal).
 */
export type FeatureState =
  | { state: 'on' }
  | { state: 'off'; reason: 'tier' | 'expired' | 'admin_off' | 'unknown' }
  | { state: 'trial'; until: string };

/**
 * Подписка юзера. `status='active'` — оплачено и в сроке. 'in_grace' — оплата
 * не прошла, но даём 3-дневный grace-period (renews_at прошёл, but in_grace_until
 * ещё впереди). 'expired' — grace тоже истёк, фичи закрыты.
 */
export interface SubscriptionInfo {
  status: 'active' | 'in_grace' | 'expired' | 'none';
  renews_at?: string;
  in_grace_until?: string;
}

/**
 * Полный entitlements snapshot. Server sig'ит это (`sig`) — клиент НЕ проверяет
 * подпись (это ответственность backend'а при валидации на стороне сервера),
 * но хранит её для отладки / cache-invalidation.
 *
 * `v=1` — версионируем schema. При breaking change → `v=2`, server и client
 * договорятся через capability negotiation позже.
 */
export interface Entitlements {
  v: 1;
  /** ISO timestamp когда server выпустил этот snapshot. */
  issued_at: string;
  /** ISO timestamp когда snapshot истекает и нужен refresh. */
  expires_at: string;
  /** Backend user_id. */
  user_id: number | null;
  tier: Tier;
  subscription: SubscriptionInfo;
  features: Record<FeatureKey, FeatureState>;
  /**
   * Per-user overrides от support (например, гостевой Pro-доступ кому-то).
   * Если есть запись — она побеждает в `features`.
   */
  overrides?: Partial<Record<FeatureKey, FeatureState>>;
  /** HMAC от server'а (sha256(features+user_id+expires_at)). UI не валидирует. */
  sig: string;
}

/**
 * Стартовое значение: tier='start', все features off с reason='tier'. Используется
 * пока backend не выкатан /api/me/entitlements (404) или пока юзер не залогинен.
 *
 * Функция (а не constant), чтобы не было shared mutable references.
 */
export function emptyEntitlements(): Entitlements {
  const features = Object.fromEntries(
    ALL_FEATURE_KEYS.map((k) => [k, { state: 'off', reason: 'tier' } as const]),
  ) as Record<FeatureKey, FeatureState>;
  return {
    v: 1,
    issued_at: new Date(0).toISOString(),
    expires_at: new Date(0).toISOString(),
    user_id: null,
    tier: 'start',
    subscription: { status: 'none' },
    features,
    sig: '',
  };
}

/** Constant snapshot для синхронного использования (renderer initial state). */
export const EMPTY_ENTITLEMENTS: Entitlements = emptyEntitlements();

/**
 * Чистая helper: вернуть `true`, если фича доступна (включая trial-период).
 * Renderer hooks используют её для conditional rendering.
 */
export function isFeatureOn(e: Entitlements, key: FeatureKey): boolean {
  // Override побеждает над базовым features.
  const fromOverride = e.overrides?.[key];
  if (fromOverride) {
    return effectiveStateIsOn(fromOverride);
  }
  const fromBase = e.features[key];
  if (!fromBase) return false;
  return effectiveStateIsOn(fromBase);
}

function effectiveStateIsOn(s: FeatureState): boolean {
  if (s.state === 'on') return true;
  if (s.state === 'trial') {
    const untilTs = Date.parse(s.until);
    if (!Number.isFinite(untilTs)) return false;
    return Date.now() < untilTs;
  }
  return false;
}

/**
 * Helper для main process: построить synthetic Entitlements для force-tier env
 * override (`ADS_TRACKER_FORCE_TIER=pro|business|start`). Используется в dev /
 * QA, когда backend ещё не отдаёт настоящих entitlements.
 *
 * tier='start' → все features off
 * tier='pro' / 'business' → все features `on`
 */
export function forcedTierEntitlements(tier: Tier): Entitlements {
  const allOn = tier !== 'start';
  const features = Object.fromEntries(
    ALL_FEATURE_KEYS.map((k) => [
      k,
      allOn ? { state: 'on' as const } : { state: 'off' as const, reason: 'tier' as const },
    ]),
  ) as Record<FeatureKey, FeatureState>;
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 60 * 1000); // 30 min
  return {
    v: 1,
    issued_at: now.toISOString(),
    expires_at: expires.toISOString(),
    user_id: 0,
    tier,
    subscription: { status: tier === 'start' ? 'none' : 'active' },
    features,
    sig: 'forced-tier-env',
  };
}
