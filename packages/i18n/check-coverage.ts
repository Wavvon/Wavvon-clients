import IntlMessageFormat from 'intl-messageformat';
import { argNames as parsedArgs } from './packs';
import en from './en.json';
import it from './it.json';
import es from './es.json';
import de from './de.json';

const locales: Record<string, Record<string, string>> = { it, es, de };
let failed = false;
for (const [locale, catalog] of Object.entries(locales)) {
  for (const key of Object.keys(en)) {
    if (key.startsWith('_')) continue;
    if (!(key in catalog)) {
      console.error(`Missing key "${key}" in ${locale}.json`);
      failed = true;
    }
  }
}

// A key that exists in all four catalogs can still be broken: the app runs
// i18next-icu, so a message is ICU, and `{{name}}` — i18next's own syntax —
// is malformed there and renders as itself. Two keys shipped that way.
// Placeholder parity is the other half: a translation that drops `{count}`
// silently loses the number.
// The parse error above is the finding for an unparseable message.
const argNames = (m: string, l: string) => parsedArgs(m, l) ?? '<unparseable>';

for (const [locale, catalog] of Object.entries({ en, ...locales })) {
  for (const [key, message] of Object.entries(catalog as Record<string, string>)) {
    if (key.startsWith('_')) continue;
    try {
      new IntlMessageFormat(message, locale);
    } catch (e) {
      console.error(`Malformed ICU message "${key}" in ${locale}.json: ${e}`);
      failed = true;
    }
    const expected = argNames((en as Record<string, string>)[key] ?? message, 'en');
    const actual = argNames(message, locale);
    if (actual !== expected && actual !== '<unparseable>') {
      console.error(
        `Placeholders differ for "${key}" in ${locale}.json: en has [${expected}], ${locale} has [${actual}]`,
      );
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log('All locales have complete coverage.');
