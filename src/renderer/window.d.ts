import type { DesktopApi } from '../shared/ipc';

declare global {
  interface Window {
    // В renderer'е preload exposes window.api всегда. В тестах mockApi.ts тоже
    // устанавливает его в beforeEach. Optional-marker не нужен (упрощает код
    // и убирает 4 defensive cast'а — code-analyzer finding #9).
    api: DesktopApi;
  }
}

export {};
