import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
    // Дольший таймаут на тест — React.lazy+Suspense иногда требует 2-3с
    // на первый mount lazy-чанка в jsdom.
    testTimeout: 15000,
    // Pin timezone for deterministic date-range tests
    env: {
      TZ: 'UTC',
    },
  },
});
