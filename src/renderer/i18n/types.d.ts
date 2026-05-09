import 'i18next';
import type enCommon from './resources/en/common.json';
import type enNav from './resources/en/nav.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof enCommon;
      nav: typeof enNav;
    };
    returnNull: false;
  }
}
