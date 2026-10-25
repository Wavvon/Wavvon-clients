// Keys whose translation is still the English string.
//
// `check-coverage` asks whether every key in en.json exists in it/es/de, and
// whether each parses as ICU with the same placeholders. All three can hold
// while the value is untranslated English — which is how 130 Spanish and 129
// German strings shipped in an app that advertises four locales, with every
// check green.
//
// Some values are identical on purpose: a product name, a unit, a string made
// only of ICU arguments. Those live in the baseline, which may only shrink —
// same contract as find-hardcoded.
//
//   node packages/i18n/find-untranslated.mjs            # check
//   node packages/i18n/find-untranslated.mjs --list     # show them
//   node packages/i18n/find-untranslated.mjs --baseline # bank a batch

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE = join(HERE, "untranslated-baseline.json");
const LOCALES = ["it", "es", "de"];

const en = JSON.parse(readFileSync(join(HERE, "en.json"), "utf8"));

/**
 * A value where matching English proves nothing.
 *
 * Single words are often genuinely identical across these languages — Emoji,
 * Forum, Chat, Info, Standard, Ping, and the product's own name. What cannot
 * be coincidence is a whole sentence: if a phrase of several words survives
 * untouched, nobody translated it. Only those count.
 */
function untranslatable(v) {
  if (typeof v !== "string") return true;
  const prose = v.replace(/\{[^}]*\}/g, " ").replace(/<[^>]*>/g, " ");
  const words = prose.match(/[A-Za-z][A-Za-z']+/g) ?? [];
  return words.length < 4;
}

const found = {};
for (const lang of LOCALES) {
  const cat = JSON.parse(readFileSync(join(HERE, `${lang}.json`), "utf8"));
  found[lang] = Object.keys(en)
    .filter((k) => !untranslatable(en[k]) && cat[k] === en[k])
    .sort();
}

const counts = Object.fromEntries(LOCALES.map((l) => [l, found[l].length]));

if (process.argv.includes("--baseline")) {
  writeFileSync(BASELINE, JSON.stringify(counts, null, 2) + "\n", "utf8");
  console.log("baseline written:", JSON.stringify(counts));
  process.exit(0);
}

if (process.argv.includes("--list")) {
  for (const lang of LOCALES) {
    console.log(`\n${lang} — ${found[lang].length} untranslated`);
    for (const k of found[lang]) console.log(`  ${k} = ${JSON.stringify(en[k]).slice(0, 80)}`);
  }
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
} catch {
  console.error("No baseline. Run with --baseline to record the current state.");
  process.exit(1);
}

const regressions = LOCALES.filter((l) => counts[l] > (baseline[l] ?? 0));
if (regressions.length) {
  console.error("Untranslated strings went up — every user-visible string gets translated:\n");
  for (const l of regressions) {
    console.error(`  ${l}: ${counts[l]}, baseline allows ${baseline[l] ?? 0}`);
  }
  console.error("\nRun with --list to see them, or --baseline if you deliberately translated a batch.");
  process.exit(1);
}

const total = LOCALES.reduce((n, l) => n + counts[l], 0);
console.log(
  total === 0
    ? "Every string is translated in every locale."
    : `No new untranslated strings. ${total} left (${LOCALES.map((l) => `${l}: ${counts[l]}`).join(", ")}).`,
);
