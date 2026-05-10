import React from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/ui';
import { RoyaltiesTab } from '../components/settings/RoyaltiesTab';

/**
 * Standalone page wrapper for the Royalties feature.
 * The body lives in RoyaltiesTab (shared with Settings → Royalties tab).
 */
export const RoyaltiesPage: React.FC = () => {
  const { t } = useTranslation('royalties');
  return (
    <div className="space-y-6" data-testid="royalties-page">
      <PageHeader title={t('title')} />
      <RoyaltiesTab />
    </div>
  );
};
