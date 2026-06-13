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
if (failed) process.exit(1);
console.log('All locales have complete coverage.');
