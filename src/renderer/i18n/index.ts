import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import ICU from 'i18next-icu';

import enCommon from './resources/en/common.json';
import enNav from './resources/en/nav.json';
import enDashboard from './resources/en/dashboard.json';
import enCampaigns from './resources/en/campaigns.json';
import enBooks from './resources/en/books.json';
import enSearchTerms from './resources/en/searchTerms.json';
import enKeywords from './resources/en/keywords.json';
import enNegatives from './resources/en/negatives.json';

void i18next
  .use(ICU)
  .use(initReactI18next)
  .init({
    lng: 'en',
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common', 'nav', 'dashboard', 'campaigns', 'books', 'searchTerms', 'keywords', 'negatives'],
    resources: {
      en: {
        common: enCommon,
        nav: enNav,
        dashboard: enDashboard,
        campaigns: enCampaigns,
        books: enBooks,
        searchTerms: enSearchTerms,
        keywords: enKeywords,
        negatives: enNegatives,
      },
    },
    interpolation: { escapeValue: false },
    returnNull: false,
  });

export default i18next;
