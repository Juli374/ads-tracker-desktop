import React from 'react';
import { useTranslation } from 'react-i18next';
import type { SyncOption } from '../../../api/syncApi';

const ALL_OPTIONS: SyncOption[] = [
  'campaigns',
  'ad_groups',
  'keywords',
  'product_targets',
  'negatives',
  'sb',
];

interface Props {
  selected: SyncOption[];
  onChange: (next: SyncOption[]) => void;
}

export const SyncOptionsGrid: React.FC<Props> = ({ selected, onChange }) => {
  const { t } = useTranslation('settings');

  const toggle = (opt: SyncOption) => {
    if (selected.includes(opt)) {
      onChange(selected.filter((o) => o !== opt));
    } else {
      onChange([...selected, opt]);
    }
  };

  return (
    <div className="space-y-2" data-testid="sync-options-grid">
      <p className="text-xs font-medium text-zinc-700">{t('fullSync.optionsLabel')}</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        {ALL_OPTIONS.map((opt) => {
          const checked = selected.includes(opt);
          return (
            <label
              key={opt}
              className="flex items-center gap-2 cursor-pointer select-none"
              data-testid={`sync-option-${opt}`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(opt)}
                className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
              />
              <span className="text-xs text-zinc-700">
                {t(`fullSync.options.${opt}` as 'fullSync.options.campaigns')}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
};
