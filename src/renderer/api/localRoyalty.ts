// Тонкий wrapper над window.api.localRoyalty для consistency с другими api/*.
// Используется из RoyaltiesPage когда юзер выбирает источник = 'local'.

import type {
  LocalRoyaltyUpload,
  LocalRoyaltyRecord,
  LocalRoyaltyMonthSummary,
  LocalRoyaltyImportPayload,
  LocalRoyaltyParseResult,
} from '../../shared/ipc';

export type {
  LocalRoyaltyUpload,
  LocalRoyaltyRecord,
  LocalRoyaltyMonthSummary,
  LocalRoyaltyImportPayload,
  LocalRoyaltyParseResult,
};

const winApi = (): NonNullable<Window['api']>['localRoyalty'] | null => {
  return window.api?.localRoyalty ?? null;
};

export const localRoyaltyApi = {
  isAvailable(): boolean {
    return winApi() !== null;
  },

  async listUploads(): Promise<LocalRoyaltyUpload[]> {
    const api = winApi();
    if (!api) return [];
    return api.listUploads();
  },

  async listRecords(uploadId: number): Promise<LocalRoyaltyRecord[]> {
    const api = winApi();
    if (!api) return [];
    return api.listRecords(uploadId);
  },

  async getSummary(targetMonth: string): Promise<LocalRoyaltyMonthSummary | null> {
    const api = winApi();
    if (!api) return null;
    return api.getSummary(targetMonth);
  },

  async import(
    payload: LocalRoyaltyImportPayload,
  ): Promise<{ upload_id: number; records_added: number }> {
    const api = winApi();
    if (!api) throw new Error('localRoyalty IPC unavailable');
    return api.import(payload);
  },

  async delete(uploadId: number): Promise<{ deleted: number }> {
    const api = winApi();
    if (!api) throw new Error('localRoyalty IPC unavailable');
    return api.delete(uploadId);
  },

  async filePath(): Promise<string> {
    const api = winApi();
    if (!api) return '';
    return api.filePath();
  },

  async parseFile(absPath: string): Promise<LocalRoyaltyParseResult> {
    const api = winApi();
    if (!api?.parseFile) throw new Error('localRoyalty.parseFile IPC unavailable');
    return api.parseFile(absPath);
  },
};
