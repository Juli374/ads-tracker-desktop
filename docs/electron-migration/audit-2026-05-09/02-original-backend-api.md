# Original Backend API — Endpoints by Feature

**Source repo:** `/Users/yuliiparfonov/ads-tracker/backend/` (Flask + Neon PostgreSQL).
**Base URL (prod):** `https://ads-tracker-production.up.railway.app`.
**Date of audit:** 2026-05-09.
**Scope:** только endpoints, нужные core-фичам desktop-клиента. Утилитарные, агентские, командные модули — в "Out of scope".

См. также: cross-cutting секция в конце (auth, error format, pagination, dates).

---

## Auth — `routes/auth.py`

Blueprint prefix: `/api/auth`. Эти endpoints **не требуют токена** (исключены из global before_request middleware).

- `POST /api/auth/register` — регистрация (закрыта после 3 пользователей, для desktop'а не нужна).
  - body: `{ email, password, full_name? }`
  - 201: `{ message, user }`
  - rate-limited: 3/hour.
- `POST /api/auth/login` — логин по email/password.
  - body: `{ email, password }`
  - 200: `{ access_token, token_type: "Bearer", expires_in: 86400, user: { id, email, full_name, role, avatar, can_manage_bids, can_manage_campaigns, can_create_campaigns, can_manage_negatives, can_sync_data, can_view_reports } }`
  - также ставит httpOnly cookie `auth_token` (samesite=None, secure). Для desktop важен только токен в JSON-теле.
  - rate-limited: 10/min.
- `POST /api/auth/logout` — чистит cookie. Для desktop не критично (мы храним токен сами в `safeStorage`).
  - 200: `{ message }`
- `GET /api/auth/verify` — проверить токен. Принимает cookie или `Authorization: Bearer`.
  - 200: `{ valid: true, user: {...same shape as login user...} }`
  - 401: `{ error }`
- `GET /api/auth/users` — список пользователей (требует Bearer-токен).
  - 200: `[ { id, email, full_name, role, ... } ]`

**Нет `/refresh`.** Текущий бэкенд НЕ поддерживает refresh tokens — JWT живёт 24 часа, потом нужно re-login. Это надо учесть в desktop: при 401 на verify предлагать вставить новый токен.

---

## Profile — `routes/profile.py` (user profile)

Blueprint prefix: `/api/profile`. Это **профиль текущего юзера приложения**, а НЕ Amazon Ads profiles. Amazon-профили живут в `/api/amazon-ads/profiles` (см. ниже).

- `GET /api/profile` — текущий юзер.
  - 200: `{ user: { id, email, full_name, role, avatar, can_*, ... } }`
- `PUT /api/profile` — обновить имя.
  - body: `{ full_name }`
  - 200: `{ message, user }`
- `POST /api/profile/avatar` — multipart upload, поле `avatar`. PNG/JPG/JPEG/GIF/WEBP, до 2MB.
  - 200: `{ message, avatar: "<url>" }`
- `PUT /api/profile/password` — смена пароля.
  - body: `{ current_password, new_password, confirm_password }`
  - 200: `{ message }`

---

## Amazon Ads Profiles + Settings + Token — `routes/amazon_ads/`

Blueprint prefix: `/api/amazon-ads` (модульный package: `profiles.py`, `settings.py`, `token.py`, `sync.py`, `updates.py`, `reports.py`, `oauth.py`, `creation.py`).

Все endpoints требуют Bearer JWT или API-key (`at_live_...`); часть update-эндпойнтов также проверяет permission через `require_permission(...)`.

### Profiles (вкладка "Profiles" в настройках)

- `GET /api/amazon-ads/profiles` — список сохранённых Amazon-профилей из локальной БД.
  - 200: `{ success, count, profiles: [ { profile_id, country_code, account_name, ..., fetched_from_region } ] }`
- `POST /api/amazon-ads/sync/profiles` — pull профилей из Amazon (NA/EU/FE).
  - 200: `{ success, message, count, regions_checked, profiles }`

### Settings / Credentials (Amazon API ключи)

- `GET /api/amazon-ads/settings`
  - 200: `{ id, client_id, region, is_active, created_at, last_token_refresh, configured: true }` или `{ configured: false, message }`
- `POST /api/amazon-ads/settings` — сохранить креды.
  - body: `{ client_id, client_secret, refresh_token, region: "NA"|"EU"|"FE" }`
  - 200: `{ success, message, settings_id }`
- `POST /api/amazon-ads/test-connection` — проверка кредов через профайлы.
  - 200: `{ success, message, profiles_count }`

### Token management

- `GET /api/amazon-ads/token-info` — текущий access_token + ttl.
  - 200: `{ access_token, token_expires_at: ISO, last_token_refresh: ISO }`
- `POST /api/amazon-ads/refresh-token` — форс-обновить access_token.
  - 200: `{ success, message, token_expires_at: ISO }`

### OAuth flow (`oauth.py`)

- `GET /api/amazon-ads/oauth/config` — публичный конфиг (client_id, redirect_uri).
- `POST /api/amazon-ads/oauth/authorize` — начать OAuth flow.
- `POST /api/amazon-ads/oauth/callback` — callback от Amazon.
- `POST /api/amazon-ads/oauth/manual-exchange` — вручную обменять auth_code → tokens.
- `POST /api/amazon-ads/oauth/reveal-token` — вернуть refresh_token (одноразово, для OAuth UX).

Для desktop OAuth не критичен на старте — юзер может ввести готовые credentials. Но эти endpoints оставлены для будущей интеграции.

### Sync (`sync.py`)

- `GET /api/amazon-ads/portfolios/<profile_id>` — портфолио профиля (cached).
- `POST /api/amazon-ads/sync/campaigns/<asin>` — full-sync кампаний для ASIN (campaigns + ad_groups + keywords + product_targets, опционально negatives).
  - body: `{ profile_id, options: { campaigns, adGroups, keywords, productTargets, negativeKeywords } }`
  - 200: `{ success, campaigns: {...}, adGroups: {...}, keywords: {...}, productTargets: {...} }`
- `POST /api/amazon-ads/sync/keywords` — sync keywords только.
  - body: `{ profile_id, campaign_id? }`
- `POST /api/amazon-ads/full-sync` — полная sync для одного профиля (Sponsored Products).
- `POST /api/amazon-ads/sb-full-sync` — Sponsored Brands вариант.
- `POST /api/amazon-ads/combined-full-sync` — SP + SB одновременно.
- `POST /api/amazon-ads/sync/start` — запустить async sync, вернуть job_id.
  - 200: `{ success, job_id }`
- `GET /api/amazon-ads/sync/status/<job_id>` — прогресс job'а.
  - 200: `{ status, progress, stage, ... }`
- `GET /api/amazon-ads/sync/active` — активные jobs.
- `POST /api/amazon-ads/sync/cancel/<job_id>` — отменить job.

### Updates (Amazon-side, `updates.py`)

Все требуют permission `can_manage_campaigns` или `can_manage_bids`. Обновляют сущность одновременно в Amazon и локальной БД, логируют в WeeklyHistory + audit_log.

- `PUT /api/amazon-ads/campaigns/<int:campaign_id>/budget`
  - body: `{ budget }`
  - 200: `{ success, message, old_value, new_value }`
- `PUT /api/amazon-ads/campaigns/<int:campaign_id>/state`
  - body: `{ state: "ENABLED"|"PAUSED"|"ARCHIVED" }`
- `PUT /api/amazon-ads/campaigns/<int:campaign_id>/bidding-strategy`
  - body: `{ strategy: "LEGACY_FOR_SALES"|"AUTO_FOR_SALES"|"MANUAL" }`
- `PUT /api/amazon-ads/campaigns/<int:campaign_id>/placement-modifiers`
  - body: `{ top_of_search?, product_pages?, rest_of_search? }`
- `PUT /api/amazon-ads/targets/<int:target_id>/bid`
  - body: `{ bid }` (требует `can_manage_bids`)
- `PUT /api/amazon-ads/targets/<int:target_id>/state`
  - body: `{ state }`
- `POST /api/amazon-ads/targets/bulk-update` — массовое обновление bids/state.
- `PUT /api/amazon-ads/ad-groups/<int:ad_group_id>/bid`
  - body: `{ default_bid }`

### Campaign creation (`creation.py`)

- `POST /api/amazon-ads/campaigns/create-full` — создать кампанию + ad_group + keywords за один запрос.

### Reports (`reports.py`) — больше для бэкенд-воркеров, desktop'у в core не нужны

Очередь, статус, тип отчёта, скачивание, schedule. ~25 endpoints. Заметные:
- `GET /api/amazon-ads/reports/queue/status`
- `POST /api/amazon-ads/reports/queue/add`, `/queue/add-batch`, `/queue/retry/<id>`
- `GET /api/amazon-ads/reports/types`
- `GET /api/amazon-ads/reports`, `POST /api/amazon-ads/reports/create`, `GET /<id>/status`, `POST /<id>/download`
- `POST /api/amazon-ads/reports/create-and-download` — sync convenience.
- `GET /api/amazon-ads/reports/stream` — SSE.
- `POST /api/amazon-ads/reports/stream/start`, `/start-parallel`, `/start-batch`
- `GET /api/amazon-ads/reports/<int:report_id>/data`
- `GET /api/amazon-ads/reports/schedule/{status,history,profiles}`, `POST /schedule/run`, `PUT /schedule/profiles`
- `GET /api/amazon-ads/reports/finalization/stats`, `POST /finalization/run`
- `GET /api/amazon-ads/reports/coverage`

**Для desktop на старте достаточно `/sync/*` endpoints**, reports — отложить.

### SSE (`__init__.py`)

- `POST /api/amazon-ads/sse-token` — выпустить short-lived токен (60 сек) для SSE-подключений (renderer не может слать cookie через `EventSource`). Renderer получает SSE-токен → подключается к streaming endpoint с `?token=<sse>`. **Важно для desktop**, если будем стримить sync-прогресс.

---

## Books — `routes/books.py`

Blueprint prefix: `/api/books`.

- `GET /api/books` — список книг.
  - query: `?archived=1` — только архивные. `?all=1` — включая архивные.
  - 200: `[ { id, title, subtitle, cover_image, amazon_link, trim_size, interior_type, page_count, account, publication_date, is_archived, ... } ]`
- `POST /api/books` — создать.
  - body: `{ title, subtitle?, cover_image?, amazon_link?, trim_size?, interior_type?, page_count?, account?, publication_date?, book_language?, author_name?, target_audience?, main_topics?, keywords?, description? }`
  - 201: `{ id, message }`
- `GET /api/books/<id>` — книга с ASIN'ами.
  - 200: `{ id, title, ..., asins: [ { id, marketplace, asin, format, price, is_active } ] }`
- `PUT /api/books/<id>` — обновить (любые поля книги).
  - body: subset of fields from POST.
  - 200: `{ message }`
- `DELETE /api/books/<id>`
- `POST /api/books/<id>/archive`
- `POST /api/books/<id>/unarchive`
- `POST /api/books/<id>/cover` — multipart upload (поле `cover`).
  - 200: `{ cover_image: "<url>" }`

### Book ASINs

- `GET /api/books/<book_id>/asins` — список ASIN'ов книги.
- `POST /api/books/<book_id>/asins`
  - body: `{ marketplace, asin, format?, price? }`
  - 201: `{ id, message }`
- `PUT /api/books/<book_id>/asins/<asin_id>`
  - body: `{ price?, format?, is_active?, marketplace, changes_data?: { old_value_formatted, new_value_formatted, reason } }`
- `DELETE /api/books/<book_id>/asins/<asin_id>`

### KDP Royalty Calculator

- `POST /api/books/<book_id>/kdp-metrics`
  - body: `{ list_price_usd, marketplace? }`
  - 200: `{ marketplace, currency, list_price, printing_cost, royalty, royalty_rate, min_list_price, break_even_acos, max_cpc, is_price_too_low }` (или массив для всех маркетов).

### AI Profile

- `POST /api/books/<book_id>/generate-ai-profile` — Claude генерирует profile (требует Anthropic key).
  - 200: `{ success, profile: { summary, topics, keywords, target_audience, related_concepts, anti_profile, generated_at } }`

---

## Book Content Changes — `routes/book_content_changes.py`

Используется в Books → детали книги (changelog by week).

- `GET /api/books/<book_id>/content-changes` — `?limit=<n>`
- `GET /api/books/<book_id>/content-changes/grouped` — сгруппировано по неделям.
- `POST /api/books/<book_id>/content-changes`
  - body: `{ change_type, old_value?, new_value?, reason?, week_number?, year? }`
  - 201: `{ id, message }`

---

## Book Preferences — `routes/book_preferences.py`

Editable memory blocks для AI-оркестратора. Desktop может не показывать на старте, но endpoints перечислены.

- `GET /api/books/<int:book_asin_id>/preferences` — `?active_only=true`
- `POST /api/books/<int:book_asin_id>/preferences`
  - body: `{ preference_text, preference_type?: "seasonality"|"be_acos_override"|"protected_keyword"|"free", source?, source_steering_id?, expires_at? }`
  - header: `X-Session-ID` (опц.)
- `PATCH /api/book-preferences/<id>`
- `DELETE /api/book-preferences/<id>` — `?hard=true` для жёсткого удаления.
- `GET /api/preferences/for-orchestrator?asin=<>&marketplace=<>`

---

## Campaigns — `routes/campaigns.py`

Blueprint без prefix; routes используют полные пути `/api/...`.

- `GET /api/asins/<int:asin_id>/campaigns` — кампании по ASIN.
- `POST /api/asins/<int:asin_id>/campaigns`
  - body: `{ name, campaign_type, targeting_type, budget, bidding_strategy?, top_of_search?, product_pages?, rest_of_search? }`
  - 201: `{ id, message }`
- `GET /api/campaigns/<int:campaign_id>` — кампания + детали (ad_groups, targets, history).
  - 200: `{ id, name, campaign_type, targeting_type, budget, bidding_strategy, top_of_search, product_pages, rest_of_search, status, amazon_campaign_id, amazon_profile_id, ad_groups: [...], ... }`
- `PUT /api/campaigns/<int:campaign_id>` — обновить (numeric поля парсятся).
- `PUT /api/campaigns/<int:campaign_id>/with-history` — атомарное update + лог изменений.
  - body: `{ ...fields, changes_data: { ... } }`
- `GET /api/marketplaces` — справочник маркетов.

---

## Ad Groups — `routes/ad_groups.py`

- `GET /api/campaigns/<int:campaign_id>/ad-groups` — список.
- `POST /api/campaigns/<int:campaign_id>/ad-groups`
  - body: `{ name, default_bid?, status? }` (default_bid=0.50, status="Active")
  - 201: `{ id, message }`
- `GET /api/ad-groups/<int:ad_group_id>` — ad_group + targets.
- `PUT /api/ad-groups/<int:ad_group_id>` — body subset (`default_bid`, `name`, `status`).
- `PUT /api/ad-groups/<int:ad_group_id>/with-history`
  - body: `{ campaign_id?, changes_data?, ... }`
- `DELETE /api/ad-groups/<int:ad_group_id>`

---

## Targets — `routes/targets.py`

- `GET /api/ad-groups/<int:ad_group_id>/targets` — targets ad-group'а.
- `POST /api/ad-groups/<int:ad_group_id>/targets` — создать (single или bulk).
  - single body: `{ target_type, name, bid, match_type?, status? }`
  - bulk body: `{ targets: [ {target_type, name, bid, match_type, status}, ... ] }`
  - 201: `{ id, message }` или `{ ids: [...], message }`
- `GET /api/campaigns/<int:campaign_id>/targets` — все targets кампании.
- `POST /api/campaigns/<int:campaign_id>/targets` — **400, deprecated.** Создавать только через ad-group.
- `PUT /api/targets/<int:target_id>` — body: `{ bid?, name?, status?, match_type? }`.
- `PUT /api/targets/<int:target_id>/with-history`
  - body: `{ ...fields, campaign_id?, changes_data? }`

---

## Negatives — `routes/negatives.py`

Negative keywords + targets (ASIN). Sync to Amazon by default.

- `GET /api/campaigns/<int:campaign_id>/negatives`
- `POST /api/campaigns/<int:campaign_id>/negatives`
  - body: `{ keywords: [...] | keyword: "...", match_type?: "Exact"|"Phrase", sync_to_amazon?: true }`
  - 201: `{ success, results, ... }` или 400 при ошибке.
- `DELETE /api/negatives/<int:negative_id>` — `?sync_to_amazon=true|false`.
- `GET /api/ad-groups/<int:ad_group_id>/negatives`
- `POST /api/ad-groups/<int:ad_group_id>/negatives` — same body.
- `POST /api/campaigns/<int:campaign_id>/negative-targets`
  - body: `{ asins: [...] | asin: "B...", sync_to_amazon? }`
- `POST /api/ad-groups/<int:ad_group_id>/negative-targets` — same.

---

## Negative Lists — `routes/negative_lists.py`

Глобальные/by-book списки negative-keywords.

- `GET /api/negative-lists` — `?book_id=<>&include_global=true`
  - 200: `[ { id, bookId, name, description, isDefault, itemCount, createdAt, isGlobal } ]`
- `GET /api/negative-lists/<int:list_id>` — детали + items.
- `POST /api/negative-lists` — создать список.
- `POST /api/negative-lists/book/<int:book_id>` — get-or-create список книги.
- `PUT /api/negative-lists/<int:list_id>` — переименовать/описание.
- `DELETE /api/negative-lists/<int:list_id>` — нельзя дефолтные.
- `POST /api/negative-lists/<int:list_id>/items` — добавить items (single/bulk).
  - body: `{ items: [{keyword, match_type, reason?, ...}, ...] }` или `{ keyword, match_type, ... }`
- `DELETE /api/negative-lists/items/<int:item_id>`
- `GET /api/books/<int:book_id>/negative-keywords` — все negatives книги across lists.

---

## Search Terms — `routes/search_terms.py`

Большой модуль (≈30 endpoints). Главные для desktop:

- `GET /api/search-terms` — основная таблица с фильтрацией.
  - query: `date_from, date_to (req), profile_id?, campaign_id? (amazon_id), local_campaign_id?, book_id?, marketplace?, keyword_id?, classification[]?, inbox_status?, min_clicks?, min_spend?, term_type?, target_id?, account?, sort_by?, sort_order?, page?, per_page?, search?`
  - 200: `{ items: [...], pagination: { page, per_page, total, pages }, classification_counts: {...} }`
- `GET /api/targets/search` — поиск target'ов по text.
- `GET /api/search-terms/summary` — агрегаты.
- `POST /api/search-terms/actions` — массовые действия (classify, snooze, etc.).
- `POST /api/search-terms/add-negative-by-text` — добавить negative по тексту term'а.
- `GET /api/campaigns/<int:campaign_id>/search-terms`, `/summary`, `/by-target`
- `GET /api/targets/<int:target_id>/search-terms`
- `GET /api/search-terms/inbox-counts` — счётчики (inbox/snoozed/done/archived).
- `POST /api/search-terms/status` — массовая смена статуса.
- `POST /api/search-terms/<int:status_id>/snooze` — body `{ until }`
- `POST /api/search-terms/<int:status_id>/archive`
- `POST /api/search-terms/<int:status_id>/done`
- `POST /api/search-terms/<int:status_id>/return-to-inbox`
- `POST /api/search-terms/<int:status_id>/restore-and-remove-negative`
- `GET /api/search-terms/<int:status_id>/history`
- `GET /api/search-terms/<int:status_id>/related-count`
- `POST /api/search-terms/<int:status_id>/analyze-relevance` — Claude relevance analysis.
- `POST /api/search-terms/analyze-relevance-batch`
- `GET|POST /api/search-terms/analyze-all-inbox`
- `GET /api/search-terms/analyze-stream` — SSE для прогресса анализа.
- `GET /api/search-terms/trend?term=<>&...` — динамика.
- `POST /api/search-terms/enrich-pr` — обогащение через Publisher Rocket.
- `POST /api/search-terms/run-ai-analysis`
- `GET /api/search-terms/worker-status`

Desktop core: первые 6-8 endpoints. AI-анализ можно отложить.

---

## Marketing Stream — `routes/marketing_stream.py` (вкладка "Стрим" в настройках)

Blueprint prefix: `/api/marketing-stream`. Все endpoints обёрнуты `@require_auth` (хотя global middleware дублирует).

- `GET /api/marketing-stream/mappings` — все advertiser_id↔profile_id mappings.
- `POST /api/marketing-stream/mappings`
  - body: `{ advertiser_id, profile_id, country_code?, marketplace_id?, region? }`
  - 201: `{ message, mapping_id }`
- `GET /api/marketing-stream/mappings/lookup/<advertiser_id>`
- `GET /api/marketing-stream/sync/status` — `?region=&dataset_type=`
  - 200: `[ { region, dataset_type, last_sync_at, last_success_at, last_error, items_processed, ... } ]`
- `GET /api/marketing-stream/sync/stats` — `?region=&dataset_type=&since_date=YYYY-MM-DD`
- `POST /api/marketing-stream/sync/run`
  - body: `{ region?, dataset_type?, lookback_hours?, max_files? }`
  - 200: `{ ... }` (sync results or job id)
- `GET /api/marketing-stream/sync/schedule`
- `GET /api/marketing-stream/sync/history`
- `GET /api/marketing-stream/sync/audit`
- `GET /api/marketing-stream/health` — health-check без auth внутри роута, но global middleware всё равно требует токен.

---

## Royalties — `routes/royalties.py` (вкладка "Роялти")

Blueprint prefix: `/api/royalties`.

- `POST /api/royalties/upload` — multipart, поле `file` (.xlsx).
  - form: `target_year, target_month, account?`
  - 201: `{ success, upload_id, target_month, records_imported, total_records, new_books_created }`
- `GET /api/royalties/uploads` — `?limit=20`
  - 200: `[ { id, filename, account, target_month, records, ..., uploaded_at } ]`
- `GET /api/royalties/summary/<target_month>` — `target_month` формат `YYYY-MM-01`.
  - 200: aggregated summary.
- `GET /api/royalties/books/needs-setup` — книги, созданные при импорте, ждут конфиг.
- `POST /api/royalties/books/<int:book_id>/complete-setup`
- `GET /api/royalties/accounts` — уникальные аккаунты.
- `GET /api/royalties/matrix?months_back=12`
  - 200: `{ accounts: [...], months: [...], matrix: { 'YYYY-MM': { 'Account': { uploaded, records, ... } } } }`
- `GET /api/royalties/uploads/<int:upload_id>/download`
  - 200: `{ download_url, filename, expires_in: 3600 }` (presigned R2 URL).

---

## AI Advisor — `routes/ai_advisor.py` (вкладка "AI Claude")

Blueprint prefix: `/api/ai-advisor`. Чат с Claude по конкретной кампании.

- `POST /api/ai-advisor/message` — отправить сообщение, **SSE response** (`text/event-stream`).
  - body: `{ campaign_id, message }`
  - stream events: `{ type: 'text_delta', text }`, `{ type: 'done', tokens_input, tokens_output, tool_calls }`, `{ type: 'error', message }`
- `GET /api/ai-advisor/campaign/<int:campaign_id>/history`
  - 200: `{ conversationId, messages: [ { id, role, content, modelUsed, createdAt } ] }`
- `DELETE /api/ai-advisor/campaign/<int:campaign_id>/history`
- `GET /api/ai-advisor/campaign/<int:campaign_id>/context` — debug, system prompt + tools.

---

## AI Audits — `routes/ai_audits.py`

Без url_prefix; пути `/api/ai-audits/...`.

- `POST /api/ai-audits` — **публичный (no auth)** — создаётся CLI-агентом снаружи.
  - body: `{ marketplace, asin, book_name?, week_start, week_end, audit_date?, be_acos?, total_spend?, total_orders?, total_acos?, raw_content?, summary?, actions?: [...], audit_type?, run_id? }`
- `GET /api/ai-audits` — список с фильтрами.
  - query: `book_asin_id, marketplace, asin, status, date_from, date_to, limit=50, offset=0`
  - 200: `{ audits, count }`
- `GET /api/ai-audits/status-grid` — матрица books × marketplaces.
  - query: `week_start, week_end, month, year`
- `GET /api/ai-audits/<int:audit_id>` — один аудит со всеми actions.
- `PUT /api/ai-audits/<int:audit_id>/status`
  - body: `{ status: "pending"|"reviewed"|"applied"|"archived" }`
- `DELETE /api/ai-audits/<int:audit_id>`
- `GET /api/ai-audits/<int:audit_id>/actions`
- `PUT /api/ai-audits/actions/<int:action_id>/status`
  - body: `{ status: "pending"|"approved"|"applied"|"rejected"|"skipped", error_message? }`
- `POST /api/ai-audits/<int:audit_id>/actions/<int:action_id>/apply` — применить через Amazon API.
  - body: `{ options?: {...}, dry_run? }`
  - **Сначала** надо `PATCH .../confirm` (см. ниже), иначе 403.
- `PATCH /api/ai-audits/<int:audit_id>/actions/<int:action_id>/confirm` — записать confirmation gate.
  - header: `X-Session-ID`
- `POST /api/ai-audits/<int:audit_id>/confirm-batch`
- `POST /api/ai-audits/<int:audit_id>/apply-all` — применить все confirmed actions.
- `GET /api/ai-audits/<int:audit_id>/run-trace` — observability.

---

## Integrations — `routes/integrations.py` ("Учётные данные")

Blueprint prefix: `/api/integrations`. **Все требуют admin** (`@require_admin`).

### API Keys

- `GET /api/integrations/api-keys` — список.
  - 200: `{ success, api_keys: [ { id, name, key_prefix, created_at, last_used_at, revoked_at } ] }`
- `POST /api/integrations/api-keys` — создать.
  - body: `{ name }`
  - 201: `{ success, id, name, key_prefix, full_key }` (full_key показан **один раз**).
- `DELETE /api/integrations/api-keys/<int:key_id>` — revoke.

### Webhooks

- `GET /api/integrations/webhooks`
  - 200: `{ success, webhooks: [ { id, name, url, events: [...], is_active, created_at, last_triggered_at, last_status_code } ] }`
- `POST /api/integrations/webhooks`
  - body: `{ name, url, secret?, events: [...] }`
  - 201: `{ success, id, secret }` (secret показан один раз).
- `PUT /api/integrations/webhooks/<int:webhook_id>` — body subset.
- `DELETE /api/integrations/webhooks/<int:webhook_id>`
- `POST /api/integrations/webhooks/<int:webhook_id>/test` — отправить test-payload.
- `GET /api/integrations/webhooks/<int:webhook_id>/deliveries` — лог.

### Inbound webhook (от внешних систем)

- `POST /api/integrations/inbound` — auth через API key (`at_live_...`) **или** JWT.
  - body: `{ event, source_id, status, comment? }`

---

## App Settings — `routes/app_settings.py` (глобальные настройки)

Blueprint prefix: `/api/settings`. Хранит API-ключи (Anthropic / OpenAI / advisor) и model-selection.

### Anthropic API key

- `GET /api/settings/anthropic` — статус.
  - 200: `{ configured: bool, masked_key? }`
- `POST /api/settings/anthropic`
  - body: `{ api_key }` (должен начинаться с `sk-ant-`)
- `DELETE /api/settings/anthropic`
- `POST /api/settings/anthropic/test` — пинг к Anthropic API.
  - 200: `{ success, message }`

### Advisor API key (отдельный ключ для AI Advisor чата)

- `GET /api/settings/advisor-key`
- `POST /api/settings/advisor-key` — body: `{ api_key }`
- `DELETE /api/settings/advisor-key`

### Models

- `GET /api/settings/models` — доступные Claude-модели (cached + fallback).
  - 200: `[ { id, name, description, input_cost, output_cost, supports_vision } ]`
- `POST /api/settings/models/refresh` — pull список из Anthropic API.
- `GET /api/settings/ai-models` — выбранные модели для разных задач.
  - 200: `{ profile, relevance, advisor }`
- `POST /api/settings/ai-models`
  - body: `{ profile?, relevance?, advisor? }`

### OpenAI API key

- `GET /api/settings/openai`
- `POST /api/settings/openai` — body: `{ api_key }`
- `DELETE /api/settings/openai`
- `POST /api/settings/openai/test`

### STT (Speech-to-Text)

- `GET /api/settings/stt-models` — список моделей.
- `GET /api/settings/stt-model` — текущая.
- `POST /api/settings/stt-model` — body: `{ model }`

---

## Metrics — `routes/metrics/` (dashboard)

Blueprint без prefix; пути `/api/metrics/*` и `/api/campaigns/<id>/metrics*`. Модули: `batch.py`, `campaign.py`, `summary.py`, `special.py`.

### Common query params (где применимо)

- `from`, `to` — даты `YYYY-MM-DD` (default: last 7 days).
- `attribution` — `1d|7d|14d|30d` (default `7d`).
- `accounts[]`, `marketplaces[]`, `book_ids[]` — filter arrays.

### Batch (`batch.py`)

- `GET /api/metrics/summary` — total impressions/clicks/cost/sales/orders/acos/roas.
- `POST /api/metrics/books/batch`
  - body: `{ book_ids: [...], from?, to?, attribution? }`
  - 200: `{ <book_id>: { impressions, clicks, cost, sales, orders, acos, roas, ... } }`
- `POST /api/metrics/campaigns/batch`
  - body: `{ campaign_ids: [...], from?, to?, attribution? }`

### Per campaign / target (`campaign.py`)

- `GET /api/campaigns/<campaign_id>/metrics`
- `GET /api/targets/<target_id>/metrics`
- `GET /api/campaigns/<campaign_id>/targets/metrics` — для всех targets.
- `GET /api/campaigns/<campaign_id>/metrics/daily`
- `GET /api/campaigns/<campaign_id>/metrics/hierarchy` — campaign→ad_group→target.
- `GET /api/campaigns/<campaign_id>/metrics/placements` — top_of_search/product_pages/rest_of_search.

### Summary (`summary.py`)

- `GET /api/metrics/summary/by-marketplace` — + royalty data.
- `GET /api/metrics/summary/by-account`
- `GET /api/metrics/summary/daily`
- `GET /api/metrics/summary/weekly`
- `GET /api/metrics/summary/by-book` — + royalty/profit.
- `GET /api/metrics/summary/by-book/trends`
- `GET /api/metrics/summary/overview` — high-level KPI tiles.
- `GET /api/metrics/summary/top-performers`
- `GET /api/metrics/summary/by-campaign`
- `GET /api/metrics/summary/by-keyword`
- `GET /api/metrics/summary/by-placement`
- `GET /api/metrics/summary/by-match-type`
- `GET /api/metrics/summary/by-bidding-strategy`
- `GET /api/metrics/summary/by-campaign-type`
- `GET /api/metrics/summary/by-targeting-type`
- `GET /api/metrics/summary/hourly`

### Special (`special.py`)

- `GET /api/metrics/books/<int:book_id>/marketplaces` — per-marketplace разбивка.
- `GET /api/metrics/books/<int:book_id>/marketplace/<marketplace>/organic` — органик.
- `GET /api/metrics/summary/organic-total`
- `GET /api/metrics/budget-pacing`
- `GET /api/metrics/book-asins/<int:book_asin_id>/weekly`
- `GET /api/metrics/campaigns/<amazon_campaign_id>/weekly`
- `GET /api/metrics/campaigns/<amazon_campaign_id>/hourly`
- `GET /api/metrics/ad-groups/<amazon_ad_group_id>/weekly`
- `GET /api/metrics/targets/<amazon_target_id>/weekly`
- `GET /api/alerts` — system-wide alerts.

---

## Weekly Metrics — `routes/weekly_metrics.py`

- `GET /api/book-asins/<int:book_asin_id>/weekly-metrics?limit=<n>` — список.
- `GET /api/book-asins/<int:book_asin_id>/weekly-metrics/current` — текущая неделя или `null`.
- `POST /api/book-asins/<int:book_asin_id>/weekly-metrics`
  - body: `{ ad_spend, total_royalty, organic_percentage, week_number?, year? }`
- `GET /api/weekly-metrics/<int:metric_id>`
- `DELETE /api/weekly-metrics/<int:metric_id>`

---

## Weeks & Changes — `routes/weeks.py`

Используется для лога изменений по неделям внутри кампании.

- `GET /api/campaigns/<int:campaign_id>/weeks` — недели с изменениями.
- `POST /api/campaigns/<int:campaign_id>/weeks`
  - body: `{ week_number?, year? }` (default: текущая неделя)
- `GET /api/weeks/<int:weekly_id>/changes`
- `POST /api/weeks/<int:weekly_id>/changes`
  - body: `{ field, old_value, new_value, reason? }`
- `GET /api/campaigns/<int:campaign_id>/all-changes` — все изменения по кампании.

---

## Periods — `routes/periods.py`

- `GET /api/periods` — все Monday-to-Monday недели.
  - 200: `[ { id, week_number, year, week_start_date, week_end_date, created_at } ]`

---

## Notifications — `routes/notifications.py` (оповещения на дашборде)

Blueprint prefix: `/api/notifications`.

- `GET /api/notifications`
  - query: `unread_only=false, type?, limit=50 (max 200), offset=0`
  - 200: `{ notifications: [...], count }`
- `GET /api/notifications/summary`
  - 200: `{ ...counts_by_type, current_billing_alerts: number, billing_alerts: [...] }`
- `GET /api/notifications/unread-count?type=`
  - 200: `{ unread_count, billing_alerts_count, total }`
- `POST /api/notifications/<int:notification_id>/read`
- `POST /api/notifications/read-all` — body: `{ type? }`
- `DELETE /api/notifications/<int:notification_id>`
- `GET /api/notifications/billing-alerts`
  - 200: `{ alerts, count }`

---

## Ratings & BSR Settings — `routes/ratings_settings.py`

- `GET /api/settings/ratings/status`
  - 200: `{ workers: { bsr_hourly: {...}, ratings_daily: {...} }, total_books, manual_job_running }`
- `GET /api/settings/ratings/books` — books with current ratings + BSR.
- `GET /api/book/<int:book_id>/ratings` — ratings по всем маркетам.
- `GET /api/ratings/all-books` — агрегаты для таблицы.
- `GET /api/book/<int:book_id>/bsr-history?marketplace=&hours=24`
- `GET /api/ratings/bsr-summary` — last BSR per book × marketplace.
- `POST /api/settings/ratings/trigger-bsr`
- `POST /api/settings/ratings/trigger-ratings`
- `POST /api/settings/ratings/scrape-single`
  - body: `{ book_id, marketplace, asin }`

---

## Rank Tracking Settings — `routes/rank_tracking_settings.py`

- `GET /api/settings/rank-tracking/status`
  - 200: `{ worker, lastStats, currentKeywords, currentMarketplaces, settings: { minImpressions, enabled, proxyConfigured }, manualJobRunning }`
- `POST /api/settings/rank-tracking/trigger`

---

## Cross-cutting

### Auth middleware

- Установлен через `@app.before_request` в `app.py:291`. Все `/api/*` endpoints требуют токен **кроме**:
  - `/api/auth/*` (login/register/verify/logout/users)
  - `/api/admin/*`
  - `/api/health`
  - `/uploads/*`
  - `POST /api/ai-audits` (для CLI-агента)
  - `OPTIONS` (CORS preflight)
- Принимаются: **httpOnly cookie `auth_token`** (samesite=None, secure) **или** заголовок `Authorization: Bearer <jwt|api_key>`. Desktop использует header.
- Два формата токена:
  - **JWT** — выдаёт `/api/auth/login`, ttl 24h, payload `{ user_id, email, exp, iat }`.
  - **API key** — формат `at_live_<40hex>`, выдаётся через `/api/integrations/api-keys` (admin-only), хранится в БД bcrypt-хэшем.
- Дополнительные decorators: `@require_admin` (only role=admin), `@require_permission('can_manage_*')` (admin всегда проходит).
- **Worker daemon**: эндпойнты `/api/workers`, `/api/agent-runs`, `/api/director` принимают header `X-Worker-Key` (out of scope для desktop).
- **SSE**: cookie не работает в `EventSource`, поэтому есть `/api/amazon-ads/sse-token` для коротких токенов.

### Error response format

Стандарт: `{ "error": "<message>" }` со статусом 4xx/5xx. Иногда добавляется `details` или `hint`. Часть endpoints возвращает `{ success: false, error: "..." }` со статусом 200 (например, тесты соединения). При успехе обычно `{ success: true, message?, ... }` либо просто массив/объект данных.

### Pagination convention

Не унифицирована:
- `?limit=<n>&offset=<n>` — большинство (notifications, audits, royalties).
- `?page=<n>&per_page=<n>` — search_terms.
- `?limit=<n>` без offset — простые списки (uploads, weekly_metrics).
- Многие списки (books, campaigns, ad_groups, targets) **без пагинации** — отдают всё.

### Date format

- Daty: ISO `YYYY-MM-DD` для query params (`from`, `to`, `date_from`, `date_to`, `week_start`, `week_end`).
- Месяц для royalties: `YYYY-MM-01` (полная дата с днём=01).
- Timestamps в response: PostgreSQL ISO datetime, иногда без timezone (наивные). Token expiry — ISO с UTC.
- `attribution_window`: строка `1d|7d|14d|30d`.
- `marketplace`: ISO-style code (`USA`, `UK`, `DE`, `FR`, `ES`, `IT`, `CA`, `AU`, ...). Иногда `com`, `co.uk` для скрейпинга — преобразуется в коде.

### CORS

Origin echo для известных доменов, `Allow-Credentials: true`. Desktop использует `net.fetch` без credentials → cookie не пишется/не читается, всё через Bearer.

### Rate limiting

- `auth.py`: `register` — 3/hour, `login` — 10/min. Глобальный limiter не агрессивный.

### Security headers

`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`.

---

## Out of scope (for reference)

Следующие модули **не нужны** desktop core, отмечены одной строкой:

- `routes/chat.py` (`/api/chat`) — командный chat между юзерами (мульти-юзер фича).
- `routes/calendar.py` (`/api/calendar`) — календарь публикаций.
- `routes/accounting.py` (`/api/accounting`) — beta-модуль учёта расходов.
- `routes/scraper.py` — Amazon ASIN scraper utility.
- `routes/publisher_rocket.py` (`/api/publisher-rocket`) — keyword research, отдельный workflow.
- `routes/knowledge.py` — KB file viewer.
- `routes/telegram_reports.py` (`/api/telegram-reports`) — TG bot integration.
- `routes/agent_runs.py`, `routes/director.py`, `routes/workers.py`, `routes/worker_monitoring.py`, `routes/automation.py` — control plane PPC-агента (worker daemon, X-Worker-Key auth).
- `routes/action_center.py`, `routes/action_steering.py` — changelog + user feedback на agent actions.
- `routes/admin.py`, `routes/admin_notes.py`, `routes/admin_meetings.py` — админ-панель и заметки.
- `routes/director.py` — control plane для PPC-оркестратора.
- `routes/project_notes.py`, `routes/campaign_notes.py` — заметки.
- `routes/tasks.py` — таск-трекер для Operations Center.
- `routes/templates.py` — bid templates utility.
- `routes/transcribe.py` (`/api/transcribe`) — speech-to-text.
- `routes/turn.py` (`/api/turn`) — TURN credentials proxy для WebRTC.
- `routes/utility.py` — миграции/диагностика.
- `routes/suggested_keywords.py`, `routes/keyword_discovery.py`, `routes/keyword_lists.py` — keyword research workflow.
- `routes/personal.py` (`/api/personal`) — admin-only personal finance.
- `routes/rank_tracker.py` — endpoints для самой rank-tracking фичи (отличается от settings — сами results+keywords).

---

## Сводка для главы "API contract"

- **Группы (in scope):** 19 (Auth, Profile, Amazon Ads {Profiles, Settings, Token, Sync, Updates, Reports, OAuth, Creation, SSE}, Books, Book Content Changes, Book Preferences, Campaigns, Ad Groups, Targets, Negatives, Negative Lists, Search Terms, Marketing Stream, Royalties, AI Advisor, AI Audits, Integrations, App Settings, Metrics, Weekly Metrics, Weeks, Periods, Notifications, Ratings Settings, Rank Tracking Settings).
- **Total endpoints (in scope):** ≈ 220 routes.
- **Самые тяжёлые группы:** Amazon Ads (~60+ endpoints, особенно `reports.py` ≈25 и `updates.py` ≈9), Search Terms (≈30), Metrics (≈30 в т.ч. Special ≈11), AI Audits (≈14), App Settings (≈18).
- **Auth:** Bearer JWT (24h, нет refresh) или API-key `at_live_*`. Global before_request middleware. Public exceptions: только `/api/auth/*`, `/api/health`, `POST /api/ai-audits`, `/uploads/*`.
- **Минимальный desktop core (для парити):**
  - Auth: login + verify.
  - Books: list/get/create/update/asins.
  - Campaigns + AdGroups + Targets: list/get/update.
  - Negatives + Negative Lists: list + add.
  - Metrics: `summary`, `summary/by-*`, batch endpoints.
  - Notifications: list + read.
  - AmazonAds: profiles, settings, sync (campaigns, full-sync), updates (budget, state, bid).
  - Royalties: upload + matrix + summary.
  - Settings: anthropic key, advisor key, models.
- **SSE:** AI Advisor `POST /message` и `GET /api/amazon-ads/reports/stream`, `/search-terms/analyze-stream`. Renderer должен брать SSE-токен через `/api/amazon-ads/sse-token`.
- **Multipart:** book covers, profile avatars, royalty xlsx upload — нужен IPC канал для бинарных загрузок (`net.fetch` в main, не renderer).
