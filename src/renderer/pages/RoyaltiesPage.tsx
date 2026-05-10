import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import { ExportMenu, PageHeader } from '../components/ui';
import { RoyaltiesTab } from '../components/settings/RoyaltiesTab';
import { royaltiesApi } from '../api/royalties';
import { localRoyaltyApi } from '../api/localRoyalty';
import { downloadExcel, type ExportColumn } from '../lib/export';
import { useToast } from '../contexts/ToastContext';

type Source = 'cloud' | 'local';

const STORAGE_KEY = 'royalties:source';

interface RoyaltyExportRow {
  id: number;
  account_name?: string;
  marketplace: string;
  target_month: string;
  uploaded_at: string;
  total_units?: number;
  total_royalty?: number;
  total_revenue?: number;
}

/**
 * Standalone page wrapper for the Royalties feature.
 * The body lives in RoyaltiesTab (shared with Settings → Royalties tab).
 * Export button reads the same source (cloud / local) the user picked
 * inside RoyaltiesTab and downloads an XLSX of uploads.
 */
export const RoyaltiesPage: React.FC = () => {
  const { t } = useTranslation('royalties');
  const toast = useToast();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const stored =
        typeof window !== 'undefined' ? window.localStorage?.getItem(STORAGE_KEY) : null;
      const source: Source = stored === 'local' ? 'local' : 'cloud';
      let uploads: RoyaltyExportRow[] = [];
      if (source === 'cloud') {
        const list = await royaltiesApi.listUploads();
        uploads = list as RoyaltyExportRow[];
      } else if (localRoyaltyApi.isAvailable()) {
        const list = await localRoyaltyApi.listUploads();
        uploads = list as RoyaltyExportRow[];
      }

      if (uploads.length === 0) {
        toast.info(t('export.empty'));
        return;
      }

      const columns: ExportColumn[] = [
        { key: 'account_name', label: 'Account', width: 24 },
        { key: 'marketplace', label: 'MP', width: 14 },
        { key: 'target_month', label: 'Month', width: 16 },
        { key: 'uploaded_at', label: 'Uploaded', width: 24 },
        { key: 'total_units', label: 'Units', align: 'right', width: 14 },
        { key: 'total_royalty', label: 'Royalty', align: 'right', width: 18 },
        { key: 'total_revenue', label: 'Revenue', align: 'right', width: 18 },
      ];
      const exportRows = uploads.map((u) => ({
        account_name: u.account_name ?? '',
        marketplace: u.marketplace ?? '',
        target_month: u.target_month ?? '',
        uploaded_at: u.uploaded_at ?? '',
        total_units: u.total_units ?? '',
        total_royalty: u.total_royalty != null ? Number(u.total_royalty).toFixed(2) : '',
        total_revenue: u.total_revenue != null ? Number(u.total_revenue).toFixed(2) : '',
      }));
      downloadExcel(
        `ads-tracker-royalties-${source}-${new Date().toISOString().slice(0, 10)}.xlsx`,
        exportRows,
        columns,
        `Royalties (${source})`,
      );
      toast.success(t('export.success', { count: exportRows.length }));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('export.failed'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="royalties-page">
      <PageHeader
        title={t('title')}
        rightSlot={
          <ExportMenu
            testId="royalties-export"
            buttonLabel={t('export.label')}
            disabled={exporting}
            items={[{ id: 'xlsx', label: 'XLSX', onClick: handleExport }]}
          />
        }
      />
      <RoyaltiesTab />
    </div>
  );
};
