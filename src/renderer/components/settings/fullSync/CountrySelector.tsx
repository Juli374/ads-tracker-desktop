import React from 'react';
import { useTranslation } from 'react-i18next';
import { flagFor } from '../../../lib/marketplaceFlags';

const COUNTRIES = ['US', 'CA', 'GB', 'DE', 'FR', 'ES', 'IT', 'JP', 'AU', 'MX', 'IN'] as const;

interface Props {
  selected: string[];
  onChange: (next: string[]) => void;
}

export const CountrySelector: React.FC<Props> = ({ selected, onChange }) => {
  const { t } = useTranslation('settings');

  const toggle = (code: string) => {
    if (selected.includes(code)) {
      onChange(selected.filter((c) => c !== code));
    } else {
      onChange([...selected, code]);
    }
  };

  return (
    <div className="space-y-2" data-testid="country-selector">
      <p className="text-xs font-medium text-zinc-700">{t('fullSync.country')}</p>
      <div className="flex flex-wrap gap-1.5">
        {COUNTRIES.map((code) => {
          const active = selected.includes(code);
          const flag = flagFor(code);
          return (
            <button
              key={code}
              type="button"
              data-testid={`country-chip-${code}`}
              onClick={() => toggle(code)}
              aria-pressed={active}
              className={`
                inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium
                border transition-colors
                ${active
                  ? 'bg-zinc-900 text-white border-zinc-900'
                  : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400'}
              `}
            >
              {flag && <span>{flag}</span>}
              {code}
            </button>
          );
        })}
      </div>
    </div>
  );
};
