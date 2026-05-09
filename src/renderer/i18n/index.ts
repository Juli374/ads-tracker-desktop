import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import ICU from 'i18next-icu';

import enCommon from './resources/en/common.json';
import enNav from './resources/en/nav.json';

void i18next
  .use(ICU)
  .use(initReactI18next)
  .init({
    lng: 'en',
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common', 'nav'],
    resources: {
      en: { common: enCommon, nav: enNav },
    },
    interpolation: { escapeValue: false },
    returnNull: false,
  });

export default i18next;
