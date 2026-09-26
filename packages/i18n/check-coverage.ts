import IntlMessageFormat from 'intl-messageformat';
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
// From the parsed message, not a regex: inside `{count, plural, one {# reply}}`
// the branch bodies are messages, and a regex reads their first word as an
// argument name.
type IcuElement = { type: number; value?: unknown; options?: Record<string, { value: IcuElement[] }> };
function collectArgs(elements: IcuElement[], into: Set<string>) {
  for (const el of elements) {
    if (el.type === 0 || el.type === 7) continue; // literal, `#`
    if (typeof el.value === 'string') into.add(el.value);
    for (const option of Object.values(el.options ?? {})) collectArgs(option.value, into);
    if (Array.isArray(el.value)) collectArgs(el.value as IcuElement[], into); // tag children
  }
}
function argNames(message: string, locale: string): string {
  const found = new Set<string>();
  try {
    collectArgs(new IntlMessageFormat(message, locale).getAst() as IcuElement[], found);
  } catch {
    return '<unparseable>'; // the parse error above is the finding
  }
  return [...found].sort().join(',');
}

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
