# Ruflo в ads-tracker-desktop — практический гайд

Установлено: ruflo v3.7.0-alpha.17. Версия проекта: Electron 41 + React 18 + TS + webpack + Forge.

**Твой `CLAUDE.md` не тронут** — ruflo увидел существующий файл и его пропустил. Все правила Electron-проекта (security baseline, IPC только typed, никаких backend-изменений отсюда) остаются в силе.

---

## Что добавилось в репо

| Путь | В git? | Зачем |
|---|---|---|
| `.claude/agents/` | можно | 99 готовых агентов |
| `.claude/commands/` | можно | 88 slash-команд |
| `.claude/skills/` | можно | скиллы |
| `.claude/helpers/hook-handler.cjs` | можно | хук-обработчик |
| `.claude/settings.json` | можно | 7 хуков активны |
| `.mcp.json` | можно | конфиг MCP-сервера ruflo |
| `.claude-flow/` | **нет** (в `.gitignore`) | runtime, логи, сессии |
| `.swarm/memory.db` | **нет** | векторная память |
| `ruvector.db` | **нет** | RuVector БД |
| `_install.log` | **нет** | лог установки |

`.gitignore` обновлён — runtime в git не попадёт. Если хочешь чтобы и определения агентов оставались только локальными — добавь `.claude/` и `.mcp.json` в `.gitignore` тоже.

---

## Как запустить

```bash
cd /Users/yuliiparfonov/ads-tracker-desktop
claude
```

При первом запуске Claude Code спросит подтвердить старт MCP-сервера `ruflo` из `.mcp.json` — соглашайся. Дальше он подхватит:
- 7 хуков (вмешиваются на каждый Bash/Write/Edit/UserPromptSubmit)
- `agent` определения из `.claude/agents/`
- `slash`-команды из `.claude/commands/`
- 246 MCP-инструментов от ruflo

**Хуки замедляют работу.** Если будет тормозить — отключи их временно: переименуй `.claude/settings.json` → `.claude/settings.json.off`.

---

## 5 живых сценариев под этот проект

### 1. Добавить новую страницу в renderer

Например, страницу `Notifications`. В Claude Code:

> «Добавь страницу Notifications в `src/renderer/pages/`. Используй паттерны из существующих `Books.tsx` и `Campaigns.tsx`. Подключи в `App.tsx` и `MainLayout.tsx`. Без Cloudscape, только Tailwind + lucide-react.»

Что произойдёт под капотом:
- `hooks_route` определит что это **feature** → нужны architect + coder + tester
- Спавнится swarm из 3-4 агентов через `agent_spawn`
- Каждый шлёт следующему `SendMessage` с результатом
- `analyze_diff-risk` оценит твой дифф перед коммитом

### 2. Семантический поиск по прошлым решениям

```bash
npx ruflo memory search -q "auth token storage"
```

Или прямо в Claude Code:
> «Найди в памяти ruflo всё что мы делали с safeStorage и auth-token»

Память живёт в `.swarm/memory.db` — между сессиями сохраняется. Чем дольше пользуешься, тем полезнее.

### 3. Сохранить решение чтобы не забыть

```bash
npx ruflo memory store -k "ipc-validation-pattern" \
  --value "Все IPC handlers валидируют args через zod схему до бизнес-логики. См src/main/ipc-handlers.ts:42"
```

В следующей сессии при упоминании IPC ruflo сам напомнит.

### 4. Security review IPC-каналов

> «Прогони security audit всех IPC-каналов в `src/shared/ipc.ts` и `src/main/ipc-handlers.ts`. Проверь что соответствует `electron-knowledge-base/atlas/core/03-security.md`.»

Активируется агент `security-auditor` + `aidefence_scan` + `analyze_file-risk` для каждого handler.

### 5. Найти где не хватает тестов

```bash
npx ruflo hooks worker-dispatch --trigger testgaps
```

Воркер просканирует `src/`, сравнит с тем что есть в `tests/` (если появятся), и выдаст приоритезированный список.

---

## Что _не_ имеет смысла гонять через ruflo в этом проекте

| Не нужно | Почему |
|---|---|
| Однострочные правки в `package.json` или конфигах | Tier-1 router и без swarm справится; хуки только замедлят |
| Изменения в `electron-knowledge-base/` | KB read-only, не редактируется при работе над приложением |
| Бэкенд-логика | Бэкенд в другом репо `Juli374/ads-tracker`, ruflo не поможет отсюда |
| Auto-update / signing настройки | Слишком specific, нужны ручные решения |

---

## Полезные команды для этого проекта

```bash
# Состояние ruflo
npx ruflo status
npx ruflo doctor

# Память
npx ruflo memory stats
npx ruflo memory search -q "electron"
npx ruflo memory list

# Swarm
npx ruflo swarm status
npx ruflo swarm shutdown   # если нужно остановить

# Анализ диффа перед коммитом
npx ruflo analyze diff-risk
npx ruflo analyze diff-classify

# Список MCP-инструментов
npx ruflo mcp tools | less
```

---

## Если надо отключить ruflo на время

```bash
# Временно (хуки выключены, MCP-сервер не стартует)
mv .claude/settings.json .claude/settings.json.off
mv .mcp.json .mcp.json.off

# Включить обратно
mv .claude/settings.json.off .claude/settings.json
mv .mcp.json.off .mcp.json
```

## Полностью снести ruflo

```bash
npx ruflo cleanup
# или вручную:
rm -rf .claude .claude-flow .swarm .mcp.json ruvector.db _install.log
git checkout .gitignore   # вернуть исходный
```

---

## Куда смотреть когда что-то непонятно

- Полный список MCP-тулов: `npx ruflo mcp tools` (246 штук, 22 группы)
- Все CLI-команды: `npx ruflo --help`
- Хелп по конкретной: `npx ruflo <cmd> --help`
- Логи: `tail -f .claude-flow/logs/*`
- Health: `npx ruflo doctor`
