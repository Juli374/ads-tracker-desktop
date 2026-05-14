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

// jsdom не реализует Element.prototype.scrollIntoView — компоненты типа
// AIAdvisorPanel (Phase J.7) дёргают его на каждое новое сообщение через
// `messagesEndRef.current?.scrollIntoView(...)`. Без stub'а — TypeError на
// первом render'е, тест валится.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

if (!('createObjectURL' in URL)) {
  // @ts-expect-error jsdom polyfill
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  // @ts-expect-error jsdom polyfill
  URL.revokeObjectURL = vi.fn();
}

// Phase J.5 Lane E: @tanstack/react-virtual reads `offsetWidth`/`offsetHeight`
// off the scroll element, but jsdom returns 0 for both — which makes the
// virtualizer render zero rows. Stub them with realistic viewport sizes so
// virtualization tests observe actual row elements.
//
// We override the prototype getters to a non-zero default; if a test needs
// a different size, it can set `Object.defineProperty(el, 'offsetHeight', ...)`
// directly. Existing non-virtualized tests are unaffected because they don't
// look at offsetHeight/offsetWidth.
if (typeof window !== 'undefined') {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: function () {
      // 640 matches the keywords table max-h. Other elements get whatever
      // they happen to need from this default — that's fine: the
      // virtualizer is the only consumer that cares.
      return this.__offsetHeight ?? 640;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: function () {
      return this.__offsetWidth ?? 1024;
    },
  });

  // ResizeObserver: jsdom doesn't ship one. Provide a no-op stub — the
  // virtualizer falls back to `getRect` synchronously when the observer
  // returns no entries, which is sufficient for our static tests.
  if (!('ResizeObserver' in window)) {
    // @ts-expect-error jsdom polyfill
    window.ResizeObserver = class {
      observe() {
        // no-op
      }
      unobserve() {
        // no-op
      }
      disconnect() {
        // no-op
      }
    };
  }
}
