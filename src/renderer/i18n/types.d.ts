import 'i18next';
import type enCommon from './resources/en/common.json';
import type enNav from './resources/en/nav.json';
import type enDashboard from './resources/en/dashboard.json';
import type enCampaigns from './resources/en/campaigns.json';
import type enBooks from './resources/en/books.json';
import type enSearchTerms from './resources/en/searchTerms.json';
import type enKeywords from './resources/en/keywords.json';
import type enNegatives from './resources/en/negatives.json';
import type enReports from './resources/en/reports.json';
import type enComparison from './resources/en/comparison.json';
import type enAlerts from './resources/en/alerts.json';

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
      keywords: typeof enKeywords;
      negatives: typeof enNegatives;
      reports: typeof enReports;
      comparison: typeof enComparison;
      alerts: typeof enAlerts;
    };
    returnNull: false;
  }
}
