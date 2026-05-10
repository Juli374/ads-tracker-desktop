import React from 'react';
import { useTranslation } from 'react-i18next';
import type { AmazonAdsProfile } from '../../../api/amazonAds';

interface Props {
  profiles: AmazonAdsProfile[];
  selected: string[];
  onChange: (next: string[]) => void;
}

function groupByAccount(profiles: AmazonAdsProfile[]): Map<string, AmazonAdsProfile[]> {
  const map = new Map<string, AmazonAdsProfile[]>();
  for (const p of profiles) {
    const name = p.account_name ?? p.profile_id;
    if (!map.has(name)) map.set(name, []);
    const bucket = map.get(name);
    if (bucket) bucket.push(p);
  }
  return map;
}

export const AccountSelector: React.FC<Props> = ({ profiles, selected, onChange }) => {
  const { t } = useTranslation('settings');
  const groups = groupByAccount(profiles);

  const toggle = (profileId: string) => {
    if (selected.includes(profileId)) {
      onChange(selected.filter((id) => id !== profileId));
    } else {
      onChange([...selected, profileId]);
    }
  };

  if (profiles.length === 0) {
    return (
      <p className="text-xs text-zinc-400 italic" data-testid="account-selector-empty">
        {t('amazonAds.emptyHint')}
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="account-selector">
      <p className="text-xs font-medium text-zinc-700">{t('fullSync.account')}</p>
      <div className="space-y-2">
        {Array.from(groups.entries()).map(([accountName, group]) => (
          <div key={accountName}>
            <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">
              {accountName}
            </p>
            <div className="space-y-1">
              {group.map((p) => {
                const checked = selected.includes(p.profile_id);
                return (
                  <label
                    key={p.profile_id}
                    className="flex items-center gap-2 cursor-pointer select-none"
                    data-testid={`account-selector-profile-${p.profile_id}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(p.profile_id)}
                      className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
                    />
                    <span className="text-xs text-zinc-700">{p.profile_id}</span>
                    {p.country_code && (
                      <span className="text-[10px] text-zinc-400">{p.country_code}</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
