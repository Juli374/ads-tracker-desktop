# Admin Panel — Phase R (Plan)

> **Дата:** 2026-05-17
> **Статус:** план, не начато
> **Контекст:** parity-plan фазы A–P закрыты, Phase Q (design) исполнена. Следующий блок — admin surface для управления подписчиками когда пойдём в public release.

---

## ⚡ AMENDMENT 2026-05-17 (II) — Feature configurator модель

> Поверх первичной версии плана. **Читать ПЕРВЫМ.** Параллельный чат пересмотрел архитектуру: целимся не в "админку с тарифами", а в **feature configurator**: primary primitive = per-user набор фич, plans = только UI-пресеты.

### Ментальный сдвиг

- **Primary primitive:** `user_feature_overrides`, не `users.plan_id`.
- **Resolve:** `effective[key] = overrides[key] ?? plan.features[key] ?? OFF`.
- **plan_id NULL** — поддерживается полностью; "Custom" юзер без пресета — first-class.
- **Trial** — НЕ отдельная сущность. Это override со `state='trial', until=...`.
- **Admin-grant "AI на 7 дней"** — одна строка в overrides, никаких новых таблиц/колонок.

### Implementation Log

- **2026-05-17 21:09** — R.0 schema files created locally; auto-applied on next Railway deploy via Procfile (`migration_runner.py` runs before gunicorn boot). Migration: [backend/migrations/20260517210916_phase_r0_subscription_schema.py](../../../ads-tracker/backend/migrations/20260517210916_phase_r0_subscription_schema.py).
- **2026-05-17 21:30** — R.0.1 done. Desktop CI adds `npm run export-feature-keys + git diff --exit-code` step ([.github/workflows/ci.yml](../../.github/workflows/ci.yml)). Backend CI new ([../../../ads-tracker/.github/workflows/ci.yml](../../../ads-tracker/.github/workflows/ci.yml)), runs `tests/test_feature_keys.py` (5 tests). Sync helper `scripts/sync-backend-feature-keys.mjs` + npm script. Gate verified locally: idempotent emit, bogus tier → 1 fail, revert → 5/5 green.
- **2026-05-17 22:10** — R.2 done. `backend/models/entitlements.py` (resolver: `resolve_all_features`, `resolve_feature_state`, `build_signed_snapshot`) + `backend/routes/me.py` (`GET /api/me/entitlements`). 15/15 pytest tests cover: unknown user, custom (no plan), pro plan active/expired/in_grace/trialing, overrides win (on/off/trial-future/trial-past), HMAC sig changes per user.
- **2026-05-17 22:15** — R.1 done (sub-agent). `routes/billing.py` + `services/stripe_service.py` + 14 tests. Endpoints: POST `/api/billing/{checkout,portal,webhook}`. Webhook handles `customer.subscription.{created,updated,deleted}` + `invoice.{payment_failed,paid}`. Maps Stripe price → `subscription_plans.stripe_price_id_*` for plan_id update; status fall-back when no match. Never touches `user_feature_overrides`. Logs to `admin_actions` only on state change. `stripe>=15.0.0` added to requirements.
- **2026-05-17 22:20** — R.2.5 done (sub-agent). `middleware/entitlements.py` (`@require_feature(key)` decorator) + 7 tests + 43 decorators applied across 4 route files: `ai_advisor.py` (4 × `ai.advisor_panel`), `keyword_discovery.py` (7 × `ai.niche_explorer`), `scraper.py` (17 × `ai.niche_explorer`), `automation.py` (15 × `automation.rules`). Spec patterns (`reverse_asin`, `bid`, `bulk`, `deep`, `advanced`, `briefing`, `scheduled`) yielded zero matches in current route files — sub-agent noted; all features still gated through their default routes. 403 body: `{error: 'feature_not_entitled', feature_key, upgrade_url}`.
- **2026-05-17 22:25** — R.3 done. Next.js 15 admin scaffold at `/Users/yuliiparfonov/ads-tracker-admin/` (separate repo, NOT pushed). 19 files: app router pages (`/login`, `/`, `/users`, `/users/[id]`, `/audit`, `/settings`), `components/AdminShell.tsx`, typed `lib/api.ts` client, Tailwind + emerald accent + JetBrains Mono. Feature configurator UI: dropdown preset + 16 toggle rows + Save (diff) + Untie. Backend admin endpoints created: `routes/admin_users.py` (list/get/entitlements GET+PUT/untie-plan/grant-trial), `routes/admin_audit.py` (audit ledger), `routes/admin_stats.py` (MRR + paying + trialing + churn 30d), `models/admin_actions.py` (log + list helper).
- **2026-05-17 22:40** — R.5 done. `services/overrides_expiry_worker.py` (hourly cron, PG advisory lock 888889, logs `override_expired` admin_action per affected user). `routes/admin_2fa.py` (TOTP via `pyotp`: `/setup`, `/verify`, `/disable`; lazy ALTER TABLE for `totp_secret`/`totp_enabled`). Per-route limits `@limiter.limit("5 per minute")` on 2FA verify/disable. Sentry SDK init in `app.py` (no-op without `SENTRY_DSN`). `pyotp`, `qrcode`, `sentry-sdk[flask]` added to requirements.
- **2026-05-17 22:45** — Coordinator step. `routes/__init__.py` registers `billing_bp + me_bp + admin_users_bp + admin_audit_bp + admin_stats_bp + admin_2fa_bp`. `app.py` skips JWT auth for `/api/billing/webhook` (Stripe-Signature verifies inside handler) and boots `overrides_expiry_worker`. Flask app boots clean: **572 routes**, all 21 new Phase R routes confirmed registered.
- **2026-05-17 22:50** — R.4 done. `services/email_service.py` (Resend HTTP client via urllib + 4 templates: welcome, trial_ending, payment_failed, payment_recovered) + 8 tests. `docker-compose.metabase.yml` (Metabase OSS, H2 internal DB, healthcheck) at backend repo root. `docs/metabase-dashboards.md` with 9 ready-to-paste SQL queries (active subs, status distribution, signups, trial→paid conversion, admin activity, feature heatmap, overrides snapshot, churn 30d, MRR placeholder) + deployment checklist.
- **2026-05-17 22:55** — All Phase R coding done. Local pytest: **41 Phase R tests + 8 email tests = 49/49 GREEN.** Pre-existing test_api/test_auth fails (27) are unrelated regressions from older API breaking changes (`access_token` → `token`, global auth middleware predates those tests). Pending user actions in DoD report below.

### Decisions перед прогоном R.0 (2026-05-17)

- **SQLite path:** не поддерживаем. Backend в production — **Railway Postgres v17** (не Neon — fact base скорректирован 2026-05-17). Railway branching недоступен; pre-flight выполняется через `railway connect Postgres` + queries на конфликты до коммита. Daily Railway backups автоматические, восстановление через Railway UI. Параллельный SQLite SQL — пустая трата для personal-use first.
- **Drift prevention: Вариант A** — `npm run export-feature-keys` пишет committed `feature_keys.json` в desktop repo. Backend читает копию `backend/feature_keys.json` как canonical. Bootstrap — руками `cp` при добавлении ключа. Cross-repo CI — через квартал.
- **ON DELETE SET NULL** на `users.plan_id` — safety net. **Правило:** никогда не `DELETE` план фактически, только `is_active=false`. SET NULL — на случай accidental DELETE: мигрирует юзера в "custom" автоматом, лучше FK violation в проде.
- **`subscription_status` CHECK** — добавлен (none|active|in_grace|expired|trialing|past_due|canceled). Опечатки ловятся в DB, не на app-level.
- **INSERT presets idempotent** — `ON CONFLICT (code) DO NOTHING` обязателен. Re-run на partial failure безопасен.
- **Прогон:** через `Procfile` auto-migration. Push в main → Railway buildpack run сначала `python migrations/migration_runner.py`, потом gunicorn. Если миграция упадёт — backend не стартанёт; revert R.0 commit + ручной DROP применённых объектов через `railway connect Postgres`.
- **Порядок safe:** CREATE plans → INSERT presets → ALTER users (FK добавляется ПОСЛЕ INSERT'ов) → CREATE overrides. Race conditions нет.

### Что переопределяется в фазах ниже

| Фаза | Старая версия | **Новая (этот amendment)** |
|---|---|---|
| **R.0** | `users.tier`, отдельные billing колонки, `usage_events`, `admin_actions` | + `subscription_plans (features JSONB)` + `user_feature_overrides` как primary; **убрать** `users.tier`, `trial_ends_at`; tier — derived в endpoint |
| **R.0.1** | — | **новый.** Drift prevention: canonical feature_keys (TS ↔ Py) sync через generate-step или CI test |
| **R.2** | Hardcoded tier → features mapping | Resolve: load plan.features → overlay overrides → emit snapshot; **plan_id NULL → only overrides used** |
| **R.2.5** | — | **новый.** Server-side `@require_feature('<key>')` декоратор на ВСЕ Pro+Business endpoints. Без этого конструктор = UX-театр |
| **R.3** | "Change tier" dropdown | "Edit subscription" экран: dropdown "Load preset" + 16 toggle-рядов; Save = diff против предыдущего state → batch upsert/delete в overrides + `admin_actions` с before/after JSON; "Untie from plan" button |
| **R.5** | Comp expiry cron | Same cron, но удаляет любые `user_feature_overrides WHERE expires_at < NOW()` (trial-grants и temp comp — единый путь expiry) + emits entitlements-refresh |

### Definition of Done — Phase R

1. **Custom юзер** (plan_id=NULL + только overrides) работает end-to-end: backend snapshot → desktop применяет → locked фичи → UpgradeModal с корректным `tierRequired`.
2. **Admin одним экраном** переключает любую из 16 фич для любого юзера. Изменения в `admin_actions` с before/after JSON.
3. **Trial-grant на N дней** автоматически expirе-ится по cron (R.5).
4. **Stripe webhook** обновляет `plan_id` + `subscription_status`. Overrides НЕ затирает.
5. **Pro endpoint без entitlement** отдаёт **403 `{error:'feature_not_entitled', feature_key, upgrade_url}`** (machine-readable).
6. **feature_keys** в backend синхронизирован с TS через generate-step или CI-проверкой.

Если по ходу окажется что R.0–R.5 не покрывают какой-то из этих DoD — **стоп, обнови план, потом продолжай**. Не имплементировать "пока без overrides, потом добавим".

---

### R.0 (REVISED) — Subscription schema

```sql
-- 1) subscription_plans (NEW) — features = JSONB array of feature_keys
CREATE TABLE subscription_plans (
  id              SERIAL PRIMARY KEY,
  code            TEXT UNIQUE NOT NULL,          -- 'start' | 'pro' | 'business'
  name            TEXT NOT NULL,
  features        JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ["ai.title_generator", ...]
  stripe_price_id_monthly TEXT,
  stripe_price_id_yearly  TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO subscription_plans (code, name, features) VALUES
  ('start',    'Start',    '[]'::jsonb),
  ('pro',      'Pro',      '[
      "ai.title_generator","ai.advisor_panel","ai.reverse_asin","ai.niche_explorer",
      "ai.weekly_briefing","ai.bid_copilot",
      "analytics.hourly_dynamics","analytics.multi_period_metrics","analytics.search_terms_deep",
      "books.bulk_import","royalties.advanced_breakdown","export.unlimited"
   ]'::jsonb),
  ('business', 'Business', '[
      "ai.title_generator","ai.advisor_panel","ai.reverse_asin","ai.niche_explorer",
      "ai.weekly_briefing","ai.bid_copilot",
      "analytics.hourly_dynamics","analytics.multi_period_metrics","analytics.search_terms_deep",
      "marketplace.multi","automation.rules","automation.scheduled_reports",
      "books.bulk_import","royalties.advanced_breakdown","export.unlimited","support.priority"
   ]'::jsonb);

-- 2) users — add subscription columns. NOTE: NO `tier` (derived from plan.code), NO `trial_ends_at` (trials live in overrides)
ALTER TABLE users ADD COLUMN plan_id                INTEGER REFERENCES subscription_plans(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN subscription_status    TEXT DEFAULT 'none';   -- none|active|in_grace|expired|trialing|past_due|canceled
ALTER TABLE users ADD COLUMN stripe_customer_id     TEXT;
ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE users ADD COLUMN current_period_end     TIMESTAMP;
ALTER TABLE users ADD COLUMN flagged_reason         TEXT;
ALTER TABLE users ADD CONSTRAINT users_subscription_status_check
  CHECK (subscription_status IN ('none','active','in_grace','expired','trialing','past_due','canceled'));
CREATE INDEX idx_users_plan_id             ON users(plan_id);
CREATE INDEX idx_users_stripe_customer     ON users(stripe_customer_id);
CREATE INDEX idx_users_subscription_status ON users(subscription_status);

-- 3) user_feature_overrides — PRIMARY access table
--    Resolve: overrides[key] ?? plan.features[key] ?? OFF
CREATE TABLE user_feature_overrides (
  id               BIGSERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature_key      TEXT NOT NULL,            -- validated against canonical list (see R.0.1)
  state            TEXT NOT NULL CHECK (state IN ('on','off','trial')),
  reason           TEXT,                     -- 'manual_grant'|'comp_access'|'trial_promotion'|'admin_off'|...
  until            TIMESTAMP,                -- REQUIRED when state='trial'; optional for temporary 'on' grants
  set_by_admin_id  INTEGER REFERENCES users(id),
  set_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at       TIMESTAMP,                -- row dies at this time (R.5 cron sweeps it)
  CONSTRAINT uniq_user_feature UNIQUE(user_id, feature_key),
  CONSTRAINT trial_needs_until CHECK (state <> 'trial' OR until IS NOT NULL)
);
CREATE INDEX idx_overrides_user   ON user_feature_overrides(user_id);
CREATE INDEX idx_overrides_expiry ON user_feature_overrides(expires_at) WHERE expires_at IS NOT NULL;

-- 4) usage_events — append-only
CREATE TABLE usage_events (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id),
  event_type  TEXT NOT NULL,                 -- sync_started|sync_completed|book_added|api_call|...
  event_data  JSONB,
  occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_usage_events_user_time ON usage_events(user_id, occurred_at DESC);

-- 5) admin_actions — separate from existing audit_log (which is domain-level)
CREATE TABLE admin_actions (
  id              BIGSERIAL PRIMARY KEY,
  actor_id        INTEGER REFERENCES users(id),       -- which admin did it
  target_user_id  INTEGER REFERENCES users(id),       -- on whom
  action          TEXT NOT NULL,                       -- entitlements_changed|plan_set|untie_plan|impersonate_start|impersonate_end|refund_issued|flagged|...
  payload         JSONB,                               -- {before:{...}, after:{...}, diff:[...], reason:"..."}
  ts              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_admin_actions_target ON admin_actions(target_user_id, ts DESC);
CREATE INDEX idx_admin_actions_actor  ON admin_actions(actor_id, ts DESC);
```

**Что убрано относительно первой версии:**
- ❌ `users.tier` — derived через JOIN (plan.code) или 'start' для plan_id=NULL
- ❌ `users.trial_ends_at` — trial живёт в `user_feature_overrides.state='trial'`

**Что добавлено:**
- ✅ `subscription_plans` с `features JSONB` (легко править пресет, без alembic)
- ✅ `user_feature_overrides` как primary access table с CHECK constraints
- ✅ `payload JSONB` в admin_actions явно типизирован под `{before, after}` для diff-actions

---

### R.0.1 (NEW) — Drift prevention для feature_keys

Canonical source: [src/shared/entitlements.ts](../../src/shared/entitlements.ts) — `ALL_FEATURE_KEYS` + `DEFAULT_TIER_FOR_FEATURE`.

**Вариант A (предпочтительно):** generate-step.
- npm-скрипт `scripts/emit-feature-keys.ts` парсит TS AST, пишет JSON-снапшот в `dist/feature-keys.json` (committed) + копию в backend repo через CI PR-bot.
- Backend импортирует `backend/feature_keys.py` (auto-generated, do not edit).
- CI fail-on-diff: pytest test fetch'ит TS-снапшот через raw.githubusercontent.com и сверяет с локальным py.

**Вариант B (стартовый):** дублирующий py-список + CI test.
- В backend `models/feature_keys.py` — рукой синхронный список + dict.
- pytest `tests/test_feature_keys_sync.py` фетчит raw GitHub URL desktop-репо `src/shared/entitlements.ts`, экстрактит keys regex'ом, ассертит equality.
- Дешевле в имплементации, медленнее в развитии. Меняй при добавлении 5-й фичи.

**Выбираем:** Вариант B на старт; A — когда станет тесно (вероятно после R.3, когда админ начнёт добавлять фичи).

---

### R.2 (REVISED) — `/api/me/entitlements` resolve логика

```python
@require_auth
def get_entitlements():
    user = get_user_by_id(request.user_id)

    # 1) Plan features (set of feature_keys), tier derived
    if user['plan_id']:
        plan = get_plan(user['plan_id'])
        plan_features = set(plan['features'])
        tier = plan['code']                            # 'start'|'pro'|'business'
    else:
        plan_features = set()
        tier = 'start'                                  # default surface for custom users

    # 2) Overrides (primary)
    overrides = get_user_overrides(user['id'])         # {feature_key: row}

    # 3) Resolve effective state per canonical feature_key
    features = {}
    sub_active = user['subscription_status'] in ('active', 'in_grace', 'trialing')
    for key in ALL_FEATURE_KEYS:
        if key in overrides:
            row = overrides[key]
            if row['state'] == 'on':
                features[key] = {'state': 'on'}
            elif row['state'] == 'trial':
                features[key] = {'state': 'trial', 'until': row['until'].isoformat()}
                # NB: don't filter expired trials here — client checks `until` via isFeatureOn
            else:  # 'off'
                features[key] = {'state': 'off', 'reason': row.get('reason') or 'admin_off'}
        elif key in plan_features and sub_active:
            features[key] = {'state': 'on'}
        else:
            reason = 'expired' if user['subscription_status'] == 'expired' else 'tier'
            features[key] = {'state': 'off', 'reason': reason}

    expires_at = now() + timedelta(minutes=30)
    snapshot = {
      'v': 1, 'issued_at': now().isoformat(), 'expires_at': expires_at.isoformat(),
      'user_id': user['id'], 'tier': tier,
      'subscription': {'status': user['subscription_status'], 'renews_at': ..., 'in_grace_until': ...},
      'features': features,
      'overrides': {},  # already merged into features; keep field empty per schema or surface separately
    }
    snapshot['sig'] = hmac_sha256_hex(json.dumps(snapshot, sort_keys=True) + JWT_SECRET)
    return jsonify(snapshot)
```

---

### R.2.5 (NEW) — Server-side enforcement (КРИТИЧНО)

Параллельно с R.2. Без этого конструктор — UX-театр.

```python
# backend/middleware/entitlements.py
from functools import wraps
from flask import request, jsonify
from .auth import require_auth, _resolve_user_id
from models.entitlements import resolve_feature_state

def require_feature(feature_key):
    def decorator(f):
        @wraps(f)
        @require_auth
        def wrapper(*args, **kwargs):
            user_id = _resolve_user_id()                 # already authed
            eff = resolve_feature_state(user_id, feature_key)   # same resolve as /me/entitlements
            ok = eff['state'] == 'on' or (
                eff['state'] == 'trial' and eff['until_ts'] > now_ts()
            )
            if ok:
                return f(*args, **kwargs)
            return jsonify({
                'error': 'feature_not_entitled',
                'feature_key': feature_key,
                'upgrade_url': f'https://kdpbook.com/upgrade?from={feature_key}',
            }), 403
        return wrapper
    return decorator
```

**Применить на:** все routes, чьи `DEFAULT_TIER_FOR_FEATURE != 'start'`. Это значит **все** 16 фич у нас pro/business → все соответствующие endpoints должны быть гейтнуты. Сводная таблица mapping'а (заполнить при имплементации):

| feature_key | route(s) | tier |
|---|---|---|
| `ai.title_generator` | `routes/ai/title_*` | pro |
| `ai.advisor_panel` | `routes/ai_advisor.py:*` | pro |
| `ai.reverse_asin` | `routes/keyword_discovery.py:reverse_*` | pro |
| `ai.niche_explorer` | `routes/scraper.py` или новый routes/niche | pro |
| `ai.weekly_briefing` | `routes/telegram_reports.py:briefing_*` | pro |
| `ai.bid_copilot` | `routes/ai_advisor.py:bulk_apply_*` | pro |
| `analytics.hourly_dynamics` | `routes/metrics/*:hourly_*` | pro |
| `analytics.multi_period_metrics` | `routes/metrics/*:multi_*` | pro |
| `analytics.search_terms_deep` | `routes/search_terms.py` (deep variants) | pro |
| `marketplace.multi` | `routes/profile.py:marketplace_*` | business |
| `automation.rules` | `routes/automation.py` | business |
| `automation.scheduled_reports` | `routes/telegram_reports.py:scheduled_*` | business |
| `books.bulk_import` | `routes/books.py:bulk_*` | pro |
| `royalties.advanced_breakdown` | `routes/royalties.py:advanced_*` | pro |
| `export.unlimited` | inline check в `routes/*:export_*` + count limiter | pro |
| `support.priority` | UI-only (нет endpoint), отдельный TODO | business |

DoD пункт 5 проверяется test'ом который дёргает каждый из этих endpoints без entitlement и ассертит 403 + body shape.

---

### R.3 (REVISED) — admin UI "Edit subscription" экран

`/users/:id/entitlements`:

```
┌────────────────────────────────────────────────────────────┐
│ Subscription                                               │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ Plan: [ Pro ▾ ] [Untie from plan]                    │  │
│ │ Presets: Start / Pro / Business / Custom (no plan)   │  │
│ │ Stripe: cus_xxx  •  active  •  renews 2026-06-17     │  │
│ └──────────────────────────────────────────────────────┘  │
│                                                            │
│ Features (16)                                              │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ ai.title_generator     [On|Off|Trial until:____]     │  │
│ │   reason: ____ • set by admin@x on 2026-05-10        │  │
│ │   ↳ from plan: ON  (override would change to: Off)   │  │
│ │                                                       │  │
│ │ ai.advisor_panel       [On|Off|Trial until:____]     │  │
│ │   ↳ from plan: ON  (no override)                     │  │
│ │ ...                                                   │  │
│ └──────────────────────────────────────────────────────┘  │
│                                                            │
│            [ Cancel ]  [ Save changes ]                    │
└────────────────────────────────────────────────────────────┘
```

**Поведение:**
- "Load preset" hydrates UI значениями из `plan.features` (не пишет в БД до Save).
- Каждая toggle row показывает (a) plan default, (b) текущий override (если есть), (c) effective.
- Save → клиент шлёт массив изменений, backend делает diff vs текущее состояние:
  - row dropped → DELETE из overrides
  - row added/changed → UPSERT в overrides (UNIQUE(user_id, feature_key))
  - одна запись в `admin_actions` с `{action:'entitlements_changed', payload:{before:{...}, after:{...}, diff:[...]}}`
- **"Untie from plan":** `plan_id := NULL`, перед этим — **hydrate overrides текущими effective values** для всех 16 ключей, чтобы юзер не потерял доступ. Записать `admin_actions: untie_plan` с before/after.

**Endpoints (новые admin):**
```
GET  /api/admin/users/:id/entitlements           → {plan, overrides[], effective{}, available_plans[]}
PUT  /api/admin/users/:id/entitlements           → body: {plan_id?, overrides: [{key,state,until?,reason?,expires_at?}, ...]}
                                                    backend computes diff → UPSERT/DELETE → admin_actions
POST /api/admin/users/:id/untie-plan             → hydrate + plan_id:=NULL + admin_actions
```

---

### R.5 (REVISED) — Maintenance cron

```python
# services/overrides_expiry_worker.py
def expire_overrides_tick():
    """Hourly. One path for both expired trials and temp comps."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute('''
      SELECT DISTINCT user_id, feature_key, state, until, expires_at
      FROM user_feature_overrides
      WHERE expires_at IS NOT NULL AND expires_at < NOW()
    ''')
    affected = cur.fetchall()
    if not affected:
        return

    cur.execute('DELETE FROM user_feature_overrides WHERE expires_at < NOW()')
    conn.commit()

    user_ids = {r['user_id'] for r in affected}
    for uid in user_ids:
        emit_entitlements_refresh(uid)                                # push to desktop via WebSocket OR force refetch on next request
        log_admin_action(actor_id=SYSTEM_USER_ID, target_id=uid,
                         action='override_expired',
                         payload={'expired': [r for r in affected if r['user_id']==uid]})
```

NB: trial-grants со `state='trial'` тоже expirе-ятся этим же path'ом если у них стоит `expires_at`. Если у trial-override `until=2026-06-01` но `expires_at=NULL` — он останется в БД, но клиент сам перестанет считать его активным (`isFeatureOn` проверяет `until`). Договорённость: для admin-grant trial ставим `expires_at = until` чтобы row сам уехал.

---

*Конец AMENDMENT. Дальше — исходный план; части, переопределённые здесь, см. в этом блоке.*

---

## TL;DR

**Что хотим:** видеть подписчиков, их планы, billing-статус, использование; делать комп-доступы, рефанды, флаги, impersonation.

**Что есть:**

| Слой | Готово | Не готово |
|---|---|---|
| Backend auth | JWT + `require_admin` + `require_permission` (`middleware/auth.py`) | — |
| Backend admin routes | `routes/admin.py` (users CRUD, role, status, permissions, **audit_log**), `routes/admin_notes.py`, `routes/admin_meetings.py` | subscriber-level admin (plan, billing, usage views) |
| User schema | `id, email, password_hash, full_name, role, is_active, can_manage_*, avatar, created_at, last_login` | **нет** `tier, plan, subscription_status, stripe_customer_id, current_period_end, trial_ends_at` |
| Billing | `services/billing_check_worker` (это **Amazon Ads** ad-spend caps, **не SaaS billing**) | Stripe/Paddle/Lemon — не интегрировано |
| Usage tracking | косвенно: `last_login`, action_log per-user — но без агрегатов | нет таблицы `usage_events` / `usage_daily` |
| Desktop entitlements | `src/shared/entitlements.ts` — полная схема (Phase K skeleton): tier (start/pro/business), 16 feature keys, subscription status, overrides, sig | backend `/api/me/entitlements` не выкатан; UI пока через `ADS_TRACKER_FORCE_TIER` env |
| Admin UI | — | вообще ничего |

**Главный вывод:** backend задизайнен как **multi-user внутри агентства** (employees + granular permissions), но **не как SaaS с подписками**. Subscription-слой почти полностью новый.

---

## Архитектурное решение

**Не встраиваем admin в Electron-бинарь.** Причины:

1. Admin-код летит каждому юзеру на машину → реверсится. Для security-критичных операций (impersonation, refund) это плохой baseline.
2. Каждый admin-фикс = пересборка Electron + notarization + auto-update wait. Founder теряет часы там, где должен иметь минуты.
3. Если личный аккаунт founder сломался — нечем будет рулить, потому что админка живёт в его же приложении.
4. Mobile-доступ (телефон, "что-то у клиента горит в субботу") — невозможен из desktop binary.

**Делаем:** маленький **Next.js admin web-app** (отдельный repo `Juli374/ads-tracker-admin`), деплой на Vercel hobby ($0), смотрит на тот же Flask backend, ту же Postgres. Аутх — тот же JWT с `role='admin'`, server-side middleware (NextAuth + Flask `require_admin` на сервере). UI компактный — таблица + фильтры + ~6 кнопок действий.

**Параллельно:** Metabase OSS self-hosted на Railway ($5/mo container) над той же Postgres — для трендов (MRR, churn, DAU, sync volume). Это **read-only**, не дублирует UI.

**Где НЕ строим:**
- ❌ Retool/Forest/Appsmith — overpriced для одного founder'а, юзер пишет код быстрее чем будет учиться drag-drop. Лочат на свой auth/audit/SSO.
- ❌ Flask-Admin attached к существующему backend — мешает customer auth с admin auth, ugly, аудит-trail дублируется.
- ❌ Stripe Dashboard как замена — но Stripe Dashboard **остаётся** как канонический инструмент для refunds/coupons/subscriptions. Custom admin **не дублирует** то, что Stripe делает лучше.

**Reference паттерн:** 1Password 8 хранит operator-tooling отдельно от end-user binary (`electron-secure-defaults` + `electron-hardener` живут как отдельные репо/CLI). KB CS4 явно говорит: "operator concerns and end-user concerns hadrly belong in the same shipped artifact." Это же логика.

---

## Фазы

### **Phase R.0 — Subscription schema (backend)** (1 день)

Без этого нет смысла во всём остальном.

**Миграции:**

```sql
-- migrations/2026XXXXXXXXXX_subscription_columns.py
ALTER TABLE users ADD COLUMN tier TEXT DEFAULT 'start';         -- start|pro|business
ALTER TABLE users ADD COLUMN subscription_status TEXT DEFAULT 'none';  -- none|active|in_grace|expired|trialing
ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE users ADD COLUMN trial_ends_at TIMESTAMP;
ALTER TABLE users ADD COLUMN current_period_end TIMESTAMP;
ALTER TABLE users ADD COLUMN flagged_reason TEXT;               -- nullable, set by admin
CREATE INDEX idx_users_stripe_customer ON users(stripe_customer_id);
CREATE INDEX idx_users_subscription_status ON users(subscription_status);
```

```sql
-- usage_events: append-only, ~10–30 events/user/day
CREATE TABLE usage_events (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  event_type TEXT NOT NULL,    -- sync_started|sync_completed|book_added|api_call|...
  event_data JSONB,
  occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_usage_events_user_time ON usage_events(user_id, occurred_at DESC);
```

```sql
-- admin_actions: каждый write от админа сюда
CREATE TABLE admin_actions (
  id BIGSERIAL PRIMARY KEY,
  actor_id INTEGER REFERENCES users(id),     -- admin кто сделал
  target_user_id INTEGER REFERENCES users(id), -- над кем
  action TEXT NOT NULL,                       -- comp_granted|refund_issued|flagged|impersonate_start|impersonate_end|tier_changed
  payload JSONB,                              -- diff / reason / amount
  ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_admin_actions_target ON admin_actions(target_user_id, ts DESC);
CREATE INDEX idx_admin_actions_actor ON admin_actions(actor_id, ts DESC);
```

> `audit_log` уже есть, но он про domain-actions (campaign edit, bid change). `admin_actions` — **отдельная** таблица только для админских действий. Не сваливаем в одну, иначе на любой support-тикет нужно фильтровать тысячи записей.

**Helper:** `models/admin_actions.py` с `log_admin_action(actor_id, target_id, action, payload)`. Каждый новый admin-endpoint **обязан** вызвать его. Сделать `pytest`-тест который сканит routes/admin*.py и фейлит если в handler нет `log_admin_action`.

---

### **Phase R.1 — Stripe integration (backend)** (2 дня)

**Решение:** Stripe Billing Subscriptions + Customer Portal. Не Paddle (выше fee), не Lemon (younger). Stripe — дефолт для US SaaS.

**Что нужно:**
1. `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` в Railway env.
2. `routes/stripe.py`:
   - `POST /api/billing/checkout` — создаёт Checkout Session для price_id (start/pro/business mapping в конфиге).
   - `POST /api/billing/portal` — Customer Portal session для self-service (cancel, update card).
   - `POST /api/billing/webhook` — webhook handler для:
     - `customer.subscription.created` / `.updated` / `.deleted` → обновить `users.tier`, `subscription_status`, `current_period_end`.
     - `invoice.payment_failed` → `subscription_status='in_grace'`.
     - `customer.subscription.trial_will_end` → email (Phase R.4).
3. Stripe Prices (создать в Stripe Dashboard):
   - `price_start_monthly` — $0 (или skip, start = free tier)
   - `price_pro_monthly`, `price_pro_yearly`
   - `price_business_monthly`, `price_business_yearly`

**Source of truth — Stripe.** В Postgres только зеркало (для admin queries без latency). Refund — всегда через Stripe API, не в DB. Comp = Stripe coupon 100%-off applied to subscription (не флаг в БД).

**Тесты:** webhook fixtures из `stripe trigger`, не моки. Эта часть критична — feedback memory `feedback_testing.md`.

---

### **Phase R.2 — Entitlements endpoint (backend)** (0.5 дня)

`GET /api/me/entitlements` — то что desktop ждёт в [src/shared/entitlements.ts:5](src/shared/entitlements.ts:5).

Логика:
```python
@app.route('/api/me/entitlements')
@require_auth
def get_entitlements():
    user = get_user_by_id(request.user_id)
    tier = user['tier']  # start|pro|business
    sub_status = user['subscription_status']

    features = {}
    for feature_key in ALL_FEATURE_KEYS:
        min_tier = DEFAULT_TIER_FOR_FEATURE[feature_key]
        if tier_meets(tier, min_tier) and sub_status in ('active', 'in_grace', 'trialing'):
            features[feature_key] = {'state': 'on'}
        else:
            features[feature_key] = {'state': 'off', 'reason': 'tier' if not tier_meets else 'expired'}

    overrides = get_user_overrides(user['id'])  # per-user comp access

    return jsonify({
        'v': 1,
        'issued_at': now_iso(),
        'expires_at': (now + 30min).iso,
        'user_id': user['id'],
        'tier': tier,
        'subscription': {...},
        'features': features,
        'overrides': overrides,
        'sig': hmac_sha256(features + user_id + expires_at),
    })
```

Когда это есть — desktop **сам подхватит** через существующий Phase K скелет. Никаких изменений в desktop не нужно.

**Per-user overrides:** новая таблица `entitlement_overrides(user_id, feature_key, state, until, reason)` — комп-доступы к конкретным фичам, выдаются админом.

---

### **Phase R.3 — Admin web app (Next.js)** (3 дня)

**Repo:** `Juli374/ads-tracker-admin` (новый, не в этом).
**Stack:** Next.js 15 App Router + Tailwind + lucide-react (same vibe как desktop). NextAuth.js для session, но JWT всё ещё валидируется на Flask стороне.
**Deploy:** Vercel hobby (free).

**Страницы (минимальный v1):**

| Page | Что |
|---|---|
| `/login` | Email + password → POST `/api/auth/login` на Flask → cookie с JWT → redirect to `/` |
| `/` | Dashboard: total users, paying users, MRR (из Stripe API), DAU last 7d, churn last 30d. Кнопки: "Открыть Stripe", "Открыть Metabase" |
| `/users` | Таблица: email, tier, status, MRR, last_active, signed_up. Filters: tier, status, flagged. Search by email. |
| `/users/[id]` | Карточка юзера: profile, subscription, last 30d usage chart, last 50 actions. Action buttons: **Grant comp**, **Flag**, **Impersonate (read-only)**, **Refund last invoice**, **Cancel subscription**. Каждая → API + admin_actions log. |
| `/audit` | Лента admin_actions, filter by actor / target / action type. |
| `/settings` | Только для super-admin. List of admin users, токены |

**Endpoints на Flask backend (новые):**

```
GET    /api/admin/users?tier=&status=&q=          → пагинированная таблица
GET    /api/admin/users/:id                       → детали + computed: MRR, usage_summary, last_actions
POST   /api/admin/users/:id/comp                  → создать override → entitlement_overrides + admin_actions
POST   /api/admin/users/:id/flag                  → flagged_reason + admin_actions
POST   /api/admin/users/:id/impersonate           → mint JWT {sub:targetId, act:adminId, imp:true, readonly:true, exp:+30m} + admin_actions
POST   /api/admin/users/:id/refund                → Stripe Refund API + admin_actions
POST   /api/admin/users/:id/cancel                → Stripe subscription cancel + admin_actions
GET    /api/admin/audit                           → admin_actions paginated
GET    /api/admin/stats/mrr                       → live из Stripe + cached 1h
GET    /api/admin/stats/usage                     → from usage_events
```

**Impersonation паттерн** (важно):
1. Admin POST `/api/admin/users/:id/impersonate` → backend минтит **новый JWT** с claims:
   ```json
   {"sub": targetId, "act": adminId, "imp": true, "readonly": true, "exp": now+30min}
   ```
2. Возвращает токен админу. **Default: read-only.** Write-mode импер по отдельной кнопке "Promote to write" с дополнительным confirm-dialog.
3. Flask middleware: при `imp=true && readonly=true` → 403 на любой POST/PUT/PATCH/DELETE кроме `/api/auth/logout`.
4. Desktop / Next.js видит `imp=true` в `/api/me` → красный sticky-баннер "Impersonating <email>. Exit →" на каждой странице.
5. Audit: `admin_actions` пишет `impersonate_start` и `impersonate_end` (на logout).

**Reference:** Pigment Engineering — "Safe User Impersonation" (2026) — канонический writeup. RFC 8693 `act` claim для actor-token нотации.

---

### **Phase R.4 — Metabase + transactional emails** (1 день)

**Metabase:** Railway template, $5/mo, OSS Community edition. Подключить к той же Postgres. Дашборды:
- MRR over time
- Active subscribers by tier
- Trial → paid conversion
- Churn cohorts
- Daily sync events
- API errors per user (если будет смыл)

Это для founder'а. Не клиенты, не команда, не admin Next.js — separate tool.

**Emails:** Resend ($0 free tier до 3k/month) + React Email templates.
Триггеры (backend):
- Stripe webhook `trial_will_end` (3 дня до окончания) → "Your trial ends in 3 days"
- `invoice.payment_failed` → "Card declined, please update"
- `subscription.deleted` → "Sorry to see you go" + offer
- Admin `comp_granted` → "You got Pro access — here's why"

---

### **Phase R.5 — Hardening** (1 день, делать перед public release)

1. **Rate limit** admin endpoints — `flask-limiter` уже подключен (`backend/limiter.py`), просто навесить decorators. 60 req/min/user на admin/*.
2. **2FA для admin'ов** — TOTP через `pyotp`. Не SSO. Не SMS. Хранить `users.totp_secret` (encrypted column).
3. **Признак "comp expires"** — overrides с `until` field, ежедневный cron-задача (`admin_overrides_expiry_worker`) рассыпает emails и снимает доступ.
4. **Backup** — daily Railway Postgres snapshots автоматические; верифицировать retention в Railway UI (Project → Postgres → Backups).
5. **Sentry для admin app** — отдельный DSN.
6. **HIBP password breach check** при login админа (опц.).

---

## Что **не** делаем сейчас

- ❌ SSO/SAML — нет команды.
- ❌ Multi-tenant org structure — текущий "agency mode" (employees внутри одного main account) достаточен; SaaS-tenant=`user_id`, не отдельная org-сущность.
- ❌ Webhook outbox для customer integrations — нет таких запросов.
- ❌ GraphQL — REST хватит.
- ❌ Real-time admin updates (Socket.IO) — refresh + polling 30s.
- ❌ Custom domain для admin (admin.kdpbook.com) — Vercel preview URL до тех пор пока их не больше двоих.

---

## Estimate

| Phase | Days | Зависимость |
|---|---|---|
| R.0 schema | 1 | — |
| R.1 Stripe | 2 | R.0 |
| R.2 entitlements endpoint | 0.5 | R.0 |
| R.3 admin app | 3 | R.0, R.1 |
| R.4 Metabase + emails | 1 | R.0, R.1 |
| R.5 hardening | 1 | R.3 |
| **Total** | **~8.5 рабочих дней** | |

Если разделять с другими фазами parity-plan — ~2-3 недели календарных.

---

## Decision log

| Дата | Решение | Альтернатива | Почему |
|---|---|---|---|
| 2026-05-17 | Отдельный Next.js admin (не Electron) | Гейтить admin в desktop binary | Деплой decoupled, mobile-доступ, не лезет в подписанный bundle |
| 2026-05-17 | Stripe (не Paddle/Lemon) | Paddle MoR | US-friendly, дефолт у SaaS, есть Customer Portal |
| 2026-05-17 | Metabase отдельно (не часть admin app) | Charts inside Next.js | Build cost vs готовое read-only решение |
| 2026-05-17 | `admin_actions` отдельно от `audit_log` | Одна таблица | Запросы разной природы; не смешивать domain audit с support audit |
| 2026-05-17 | Impersonation default read-only | Default write | "the admin did X to a user" disasters — самый частый support-incident |
| 2026-05-17 | Не Retool/Forest/Appsmith | UI builders | Юзер пишет код быстрее, чем будет учиться, +monthly tax forever |

---

## Источники

- Researcher report 2026-05-17 (in this session)
- [Pigment — Safe User Impersonation](https://engineering.pigment.com/2026/04/08/safe-user-impersonation/)
- [Curity — Impersonation Approaches OAuth/OIDC](https://curity.io/resources/learn/impersonation-flow-approaches/)
- [Stripe Refunds API](https://docs.stripe.com/refunds), [Customer Portal](https://docs.stripe.com/customer-management)
- KB CS4 [`atlas/case-studies/04-1password.md`](../../electron-knowledge-base/atlas/case-studies/04-1password.md) — operator vs end-user tooling separation
- PostHog `ee/` directory — staff middleware reference (OSS)
- Cal.com `apps/web/pages/settings/admin/*` — same-binary admin pattern (что мы отвергаем — полезно почитать чтоб понять почему)
