import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ICU from 'i18next-icu';
import { setFormatLocale } from '@wavvon/core';
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
      initImmediate: false,
    });
  // Dates and durations are formatted by Intl in @wavvon/core, which has no
  // reason to depend on i18next — but the chosen language is a setting, not
  // the browser's, so something has to tell it. Doing it here covers both the
  // initial language and the switcher in Settings, for every app, instead of
  // four call sites that each have to remember.
  setFormatLocale(lng);
  i18n.on('languageChanged', (next) => setFormatLocale(next));
  return i18n;
}

export default i18n;
