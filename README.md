# Ads Tracker Desktop

Кросс-платформенный desktop-клиент для Ads Tracker. Electron 41 + React 18 + TypeScript + Tailwind. Подключается по HTTPS к Railway-бэкенду (`https://ads-tracker-production.up.railway.app`) и отдаёт юзеру нативный UI на macOS и Windows.

Бэкенд (Flask + Neon PostgreSQL) живёт в отдельном репозитории `Juli374/ads-tracker` и в этом репо **не дублируется** — мы только клиент.

## Стек

| Слой | Что |
|---|---|
| Electron | 41.x (Chromium 146, Node 24) |
| Bundler | Electron Forge + Webpack |
| UI | React 18 + TypeScript + Tailwind 3 + lucide-react |
| IPC | typed `contextBridge` (preload + main handlers + shared types) |
| Auth | Bearer-токен из `safeStorage` (OS Keychain / DPAPI) |
| HTTP | `net.fetch` (proxy-aware) |
| Packaging (план) | electron-builder → DMG/ZIP (mac), NSIS .exe (win) |
| Auto-update (план) | electron-updater + GitHub Releases (private) |

## Запуск (dev)

```bash
npm install
npm start
```

Или двойной клик на `Запустить Ads Tracker (dev).command` в корне.

## Что где

```
ads-tracker-desktop/
├── src/
│   ├── index.ts                # Electron main entry
│   ├── preload.ts              # contextBridge bootstrap
│   ├── renderer.tsx            # renderer entry
│   ├── main/
│   │   ├── api-client.ts       # net.fetch → Railway API
│   │   ├── auth-store.ts       # safeStorage для токена
│   │   └── ipc-handlers.ts     # IPC регистрация
│   ├── shared/
│   │   └── ipc.ts              # типы IPC-контракта
│   └── renderer/
│       ├── App.tsx
│       ├── components/         # MainLayout, TokenPasteScreen, …
│       ├── contexts/           # AuthContext
│       ├── api/                # client/auth/metrics
│       └── pages/              # Dashboard / Books / Campaigns / SearchTerms / Reports / Settings
├── docs/electron-migration/    # план миграции (актуальный трек: personal-use first)
├── electron-knowledge-base/    # KB по Electron — атлас, build-kit, шаблоны, кейсы
├── forge.config.ts
└── webpack.{main,renderer,plugins,rules}.config.ts
```

## Документация

- **План** → [docs/electron-migration/README.md](docs/electron-migration/README.md)
- **Code signing** → [docs/electron-migration/certificates.md](docs/electron-migration/certificates.md)
- **Открытые вопросы** → [docs/electron-migration/open-questions.md](docs/electron-migration/open-questions.md)
- **База знаний по Electron** → [electron-knowledge-base/atlas/00-INDEX.md](electron-knowledge-base/atlas/00-INDEX.md)
  - Build-kit чеклист (88 пунктов): [electron-knowledge-base/build-kit/checklist.md](electron-knowledge-base/build-kit/checklist.md)
  - Railway-шаблон auth: [electron-knowledge-base/build-kit/templates/05-railway-backend-client.md](electron-knowledge-base/build-kit/templates/05-railway-backend-client.md)

## Связь с другими репо

| Репо | Зачем |
|---|---|
| `Juli374/ads-tracker` | Flask backend + веб-фронт + PPC-агенты. Единственная точка контакта — HTTPS API |

Никакого shared-кода нет. Изменения в backend — в том репо. Изменения в desktop — здесь.
