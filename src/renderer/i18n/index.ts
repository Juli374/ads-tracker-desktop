import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import ICU from 'i18next-icu';

import enCommon from './resources/en/common.json';
import enNav from './resources/en/nav.json';
import enDashboard from './resources/en/dashboard.json';
import enCampaigns from './resources/en/campaigns.json';

void i18next
  .use(ICU)
  .use(initReactI18next)
  .init({
    lng: 'en',
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common', 'nav', 'dashboard', 'campaigns'],
    resources: {
      en: {
        common: enCommon,
        nav: enNav,
        dashboard: enDashboard,
        campaigns: enCampaigns,
      },
    },
    interpolation: { escapeValue: false },
    returnNull: false,
  });

export default i18next;
