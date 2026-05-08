import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

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
