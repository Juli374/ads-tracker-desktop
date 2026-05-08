import { apiClient } from './client';

// /api/marketplaces — массив маркетплейсов с code/name/currency/etc.
export interface MarketplaceInfo {
  code: string;
  name: string;
  domain?: string;
  currency: string;
}

export const campaignsApi = {
  marketplaces(): Promise<Record<string, MarketplaceInfo> | MarketplaceInfo[]> {
    return apiClient.get<Record<string, MarketplaceInfo> | MarketplaceInfo[]>(
      '/api/marketplaces',
    );
  },
};
