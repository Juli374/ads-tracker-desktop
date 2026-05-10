import React from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '../ui';

export const AITab: React.FC = () => {
  const { t } = useTranslation('settings');
  return (
    <Card title={t('ai.cardTitle')} data-testid="settings-ai-tab">
      <div className="px-5 py-6 flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0">
          <Sparkles size={16} />
        </div>
        <div className="flex-1">
          <p className="text-sm text-zinc-700 leading-relaxed">
            {t('ai.comingSoon')}
          </p>
        </div>
      </div>
    </Card>
  );
};
