import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ICU from 'i18next-icu';
import { setFormatLocale } from '@wavvon/core';
import en from './en.json';

// The one list of languages. English is bundled as the fallback; every other
// catalogue is a chunk fetched when it is chosen.
export const LANGUAGES: { id: string; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'it', label: 'Italiano' },
  { id: 'es', label: 'Español' },
  { id: 'de', label: 'Deutsch' },
];

const loaders: Record<string, () => Promise<{ default: Record<string, string> }>> = {
  it: () => import('./it.json'),
  es: () => import('./es.json'),
  de: () => import('./de.json'),
};

export function resolveLanguage(stored: string | null, browser: string): string {
  const ids = LANGUAGES.map((l) => l.id);
  return ids.find((id) => id === stored) ?? ids.find((id) => id === browser.slice(0, 2)) ?? 'en';
}

async function loadLanguage(lng: string) {
  if (i18n.hasResourceBundle(lng, 'translation') || !loaders[lng]) return;
  i18n.addResourceBundle(lng, 'translation', (await loaders[lng]()).default);
}

export async function setLanguage(lng: string) {
  await loadLanguage(lng);
  await i18n.changeLanguage(lng);
}

export async function initI18n(lng: string = 'en') {
  if (i18n.isInitialized) return i18n;
  await i18n
    .use(ICU)
    .use(initReactI18next)
    .init({
      lng: 'en',
      fallbackLng: 'en',
      resources: { en: { translation: en } },
      interpolation: { escapeValue: false },
    });
  await setLanguage(lng);
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
