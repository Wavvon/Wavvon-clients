import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ICU from 'i18next-icu';
import { setFormatLocale } from '@wavvon/core';
import en from './en.json';
import { packCoverage, sanitizePackStrings } from './packs';

// The one list of shipped languages. English is bundled as the fallback;
// every other catalogue is a chunk fetched when it is chosen.
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

/** A language pack the client has taken in (installed by the user, or
 *  offered by the open hub), its strings already filtered by the §2 rules. */
export interface RegisteredPack {
  id: string;
  code: string;
  label: string;
  strings: Record<string, string>;
  /** 0 to 1 of the translatable keys. */
  coverage: number;
  source: 'user' | 'hub';
}

export interface LanguageOption {
  id: string;
  label: string;
  /** Set for a pack; a shipped language is complete. */
  coverage?: number;
  source?: 'user' | 'hub';
}

const packs = new Map<string, RegisteredPack>();
let currentId = 'en';

/** Register a pack under `id` (its package id). Values for locked or unknown
 *  keys, and values whose ICU or placeholders differ from English, are dropped. */
export function registerLanguagePack(
  id: string,
  code: string,
  label: string,
  strings: Record<string, string>,
  source: 'user' | 'hub' = 'user',
): RegisteredPack {
  const clean = sanitizePackStrings(strings, code);
  const pack = { id, code, label, strings: clean, coverage: packCoverage(clean), source };
  packs.set(id, pack);
  return pack;
}

export function unregisterLanguagePack(id: string): void {
  packs.delete(id);
}

export function languageOptions(): LanguageOption[] {
  return [
    ...LANGUAGES,
    ...[...packs.values()].map((p) => ({ id: p.id, label: p.label, coverage: p.coverage, source: p.source })),
  ];
}

/** The chosen language's id: a shipped code or a pack id. */
export function currentLanguageId(): string {
  return currentId;
}

export function resolveLanguage(stored: string | null, browser: string, hubDefault?: string | null): string {
  const ids = languageOptions().map((l) => l.id);
  return (
    ids.find((id) => id === stored) ??
    ids.find((id) => id === hubDefault) ??
    ids.find((id) => id === browser.slice(0, 2)) ??
    'en'
  );
}

async function officialCatalogue(code: string): Promise<Record<string, string>> {
  const primary = code.split('-')[0].toLowerCase();
  if (primary === 'en') return en as Record<string, string>;
  const load = loaders[primary];
  return load ? (await load()).default : {};
}

// A pack is laid over the official catalogue of its language, so the keys it
// lacks (and every locked key) come from there, then from English. The bundle
// is rebuilt on every switch: a pack for `it` and the shipped Italian share
// one i18next language.
export async function setLanguage(id: string) {
  const pack = packs.get(id);
  const code = pack?.code ?? (LANGUAGES.some((l) => l.id === id) ? id : 'en');
  const bundle = { ...(await officialCatalogue(code)), ...(pack?.strings ?? {}) };
  // English is everyone's fallback: reset it, in case a pack for `en` was laid over it.
  i18n.addResourceBundle('en', 'translation', code === 'en' ? bundle : en, false, true);
  if (code !== 'en') {
    i18n.removeResourceBundle(code, 'translation');
    i18n.addResourceBundle(code, 'translation', bundle);
  }
  currentId = pack ? id : code;
  // changeLanguage to the same code does not re-render; emitting it does.
  if (i18n.language === code) i18n.emit('languageChanged', code);
  else await i18n.changeLanguage(code);
}

export async function initI18n(lng: string = 'en') {
  if (i18n.isInitialized) return i18n;
  await i18n
    .use(ICU)
    .use(initReactI18next)
    .init({
      lng: 'en',
      fallbackLng: 'en',
      resources: { en: { translation: { ...en } } },
      interpolation: { escapeValue: false },
    });
  await setLanguage(lng);
  // Dates and durations are formatted by Intl in @wavvon/core, which has no
  // reason to depend on i18next — but the chosen language is a setting, not
  // the browser's, so something has to tell it. Doing it here covers both the
  // initial language and the switcher in Settings, for every app, instead of
  // four call sites that each have to remember.
  setFormatLocale(i18n.language);
  i18n.on('languageChanged', (next) => setFormatLocale(next));
  return i18n;
}

export default i18n;
