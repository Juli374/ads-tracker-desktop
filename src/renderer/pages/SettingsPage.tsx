import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/ui';
import {
  SettingsTabs,
  type SettingsTabId,
} from '../components/settings/SettingsTabs';
import { ApplicationTab } from '../components/settings/ApplicationTab';
import { CredentialsTab } from '../components/settings/CredentialsTab';
import { ProfilesTab } from '../components/settings/ProfilesTab';
import { TokenTab } from '../components/settings/TokenTab';
import { AITab } from '../components/settings/AITab';
import { StreamTab } from '../components/settings/StreamTab';
import { FullSyncTab } from '../components/settings/fullSync';
import { useSessionState } from '../lib/useSessionState';

const VALID_TABS: SettingsTabId[] = [
  'application',
  'credentials',
  'profiles',
  'token',
  'ai',
  'fullSync',
  'stream',
];

function readHashTab(): SettingsTabId | null {
  const hash = window.location.hash || '';
  const match = hash.match(/^#settings\/(\w+)/);
  if (!match) return null;
  const id = match[1] as SettingsTabId;
  return VALID_TABS.includes(id) ? id : null;
}

function writeHashTab(tab: SettingsTabId): void {
  const next = `#settings/${tab}`;
  if (window.location.hash !== next) {
    history.replaceState(null, '', next);
  }
}

export const SettingsPage: React.FC = () => {
  const { t } = useTranslation('settings');
  const [persistedTab, setPersistedTab] = useSessionState<SettingsTabId>(
    'settings:lastTab',
    'application',
  );
  const [activeTab, setActiveTabState] = useState<SettingsTabId>(
    () => readHashTab() ?? persistedTab,
  );
  const [profilesCount, setProfilesCount] = useState<number | undefined>(undefined);

  useEffect(() => {
    writeHashTab(activeTab);
    setPersistedTab(activeTab);
  }, [activeTab, setPersistedTab]);

  useEffect(() => {
    const onHashChange = () => {
      const next = readHashTab();
      if (next) setActiveTabState(next);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <div className="space-y-6" data-testid="settings-page">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <SettingsTabs
        activeTab={activeTab}
        onChange={setActiveTabState}
        profilesCount={profilesCount}
      />

      {activeTab === 'application' && <ApplicationTab />}
      {activeTab === 'credentials' && <CredentialsTab />}
      {activeTab === 'profiles' && <ProfilesTab onCount={setProfilesCount} />}
      {activeTab === 'token' && <TokenTab />}
      {activeTab === 'ai' && <AITab />}
      {activeTab === 'fullSync' && <FullSyncTab />}
      {activeTab === 'stream' && <StreamTab />}
    </div>
  );
};
