import 'i18next';
import type enCommon from './resources/en/common.json';
import type enNav from './resources/en/nav.json';
import type enDashboard from './resources/en/dashboard.json';
import type enCampaigns from './resources/en/campaigns.json';
import type enBooks from './resources/en/books.json';
import type enSearchTerms from './resources/en/searchTerms.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof enCommon;
      nav: typeof enNav;
      dashboard: typeof enDashboard;
      campaigns: typeof enCampaigns;
      books: typeof enBooks;
      searchTerms: typeof enSearchTerms;
    };
    returnNull: false;
  }
}
