import React from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Cpu, KeyRound, Server, Sparkles, Users } from 'lucide-react';

export type SettingsTabId =
  | 'application'
  | 'credentials'
  | 'profiles'
  | 'token'
  | 'ai'
  | 'stream';

interface TabSpec {
  id: SettingsTabId;
  icon: React.ElementType;
}

const TABS: TabSpec[] = [
  { id: 'application', icon: Cpu },
  { id: 'credentials', icon: Server },
  { id: 'profiles', icon: Users },
  { id: 'token', icon: KeyRound },
  { id: 'ai', icon: Sparkles },
  { id: 'stream', icon: Activity },
];

interface Props {
  activeTab: SettingsTabId;
  onChange: (id: SettingsTabId) => void;
  profilesCount?: number;
}

export const SettingsTabs: React.FC<Props> = ({ activeTab, onChange, profilesCount }) => {
  const { t } = useTranslation('settings');
  return (
    <div
      role="tablist"
      className="flex items-center gap-1 border-b border-zinc-200 overflow-x-auto"
      data-testid="settings-tabs"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        const label =
          tab.id === 'profiles' && profilesCount != null && profilesCount > 0
            ? t('tabs.profilesWithCount', { count: profilesCount })
            : t(`tabs.${tab.id}` as 'tabs.application');
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={t('tabs.ariaLabel', { label })}
            data-testid={`settings-tab-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={`
              inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium
              border-b-2 -mb-px transition-colors whitespace-nowrap
              ${active
                ? 'border-zinc-900 text-zinc-900'
                : 'border-transparent text-zinc-500 hover:text-zinc-900'}
            `}
          >
            <Icon size={13} />
            {label}
          </button>
        );
      })}
    </div>
  );
};
