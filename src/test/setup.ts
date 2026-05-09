import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, vi } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// react-i18next mock — t() возвращает ключ, чтобы тесты ассертили на стабильных ключах
// (data-testid + ключ), а не на переводимом тексте. Trans/I18nextProvider — passthrough.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: '3rdParty', init: () => undefined },
}));

// React.lazy + Suspense fallback на страницах увеличил время до появления
// heading'а до >1s в jsdom (default RTL timeout). Поднимаем asyncUtilTimeout
// до 5s чтобы findByRole/findByText корректно ждали загрузки lazy-чанка.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
});

// Suppress «not wrapped in act(...)» warnings — это шум от async state
// updates в useEffect-loaders после успешного assertion (data fetched
// после того как тест уже всё проверил). Тесты остаются valid: упавшие
// тесты по-прежнему показывают error stacks.
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const first = args[0];
  if (typeof first === 'string' && first.includes('not wrapped in act')) {
    return;
  }
  originalConsoleError(...args);
};

// jsdom не предоставляет clipboard / matchMedia / URL.createObjectURL по умолчанию
if (!('clipboard' in navigator)) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
}

if (!('createObjectURL' in URL)) {
  // @ts-expect-error jsdom polyfill
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  // @ts-expect-error jsdom polyfill
  URL.revokeObjectURL = vi.fn();
}
