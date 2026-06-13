import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ICU from 'i18next-icu';
import en from './en.json';
import it from './it.json';
import es from './es.json';
import de from './de.json';

export function initI18n(lng: string = 'en') {
  if (i18n.isInitialized) return i18n;
  i18n
    .use(ICU)
    .use(initReactI18next)
    .init({
      lng,
      fallbackLng: 'en',
      resources: { en: { translation: en }, it: { translation: it }, es: { translation: es }, de: { translation: de } },
      interpolation: { escapeValue: false },
    });
  return i18n;
}

export default i18n;
