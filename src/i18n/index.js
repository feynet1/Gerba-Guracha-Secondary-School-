import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enTranslation from './locales/en/translation.json';
import omTranslation from './locales/om/translation.json';

const resources = {
  en: {
    translation: enTranslation,
  },
  om: {
    translation: omTranslation,
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
});

export default i18n;
