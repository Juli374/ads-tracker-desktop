import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
    // RAM guard: jsdom + React-lazy суммарно тяжёлые. По умолчанию forks-пул
    // плодит до (ядра) воркеров, и параллельные полные прогоны убивали 16ГБ
    // машину (OOM). Жёстко ограничиваем число форков — память переиспользуется,
    // прогон чуть дольше, но не валит систему.
    pool: 'forks',
    poolOptions: {
      forks: { minForks: 1, maxForks: 2 },
    },
    // Дольший таймаут на тест — React.lazy+Suspense иногда требует 2-3с
    // на первый mount lazy-чанка в jsdom.
    testTimeout: 15000,
    // Pin timezone for deterministic date-range tests
    env: {
      TZ: 'UTC',
    },
  },
});
