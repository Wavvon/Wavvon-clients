// Find translation keys that nothing reads.
//
// The two existing guards look the other way. `check-coverage.ts` proves that
// it/es/de match en, so a key nobody reads stays "complete" in all four
// forever. `find-hardcoded.mjs` hunts the opposite problem — a string that
// never became a key. Neither asks whether a key is read, which is how the
// redesign left ~137 behind (Wavvon-clients#62).
//
//   node find-unused-keys.mjs            # check against the baseline
//   node find-unused-keys.mjs --list     # every unused key
//   node find-unused-keys.mjs --baseline # accept the current state
//
// Like `find-hardcoded`, the baseline only ratchets down: CI fails when the
// count goes up, which is what stops a removed feature leaving its catalog
// entries behind again.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const BASELINE = join(here, "unused-keys-baseline.json");
const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();

function flatten(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix + k;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...flatten(v, key + "."));
    else out.push(key);
  }
  return out;
}

const keys = flatten(JSON.parse(readFileSync(join(here, "en.json"), "utf8")));

// Every source file that could name a key, catalogs excluded.
const files = execSync('git ls-files "*.ts" "*.tsx" "*.html"', { encoding: "utf8", cwd: repoRoot })
  .split("\n")
  .filter((f) => f && !f.startsWith("packages/i18n/") && existsSync(join(repoRoot, f)));

const sources = files.map((f) => readFileSync(join(repoRoot, f), "utf8"));
const haystack = sources.join("\n");

// A key built at runtime — `t(`channel.icon.${id}`)` — never appears whole in
// the source, so every key under a prefix like that counts as read. Collected
// from the source rather than hand-listed, because a hand-list is a second
// thing to maintain and goes stale the moment a prefix changes.
const dynamicPrefixes = [...new Set(
  [...haystack.matchAll(/[`"']([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*\.)\$\{/g)].map((m) => m[1]),
)];

// A literal mention anywhere counts, whatever the surrounding syntax: `t("x")`,
// an `i18nKey` prop, a key held in a lookup table, a key passed through a
// variable. Being generous here costs a missed deletion; being strict would
// cost a wrong one.
const mentioned = new Set();
for (const key of keys) {
  if (haystack.includes(key)) mentioned.add(key);
}

const unused = keys.filter(
  (k) => !mentioned.has(k) && !dynamicPrefixes.some((p) => k.startsWith(p)),
);

const byTop = {};
for (const k of unused) {
  const top = k.split(".").slice(0, 2).join(".");
  byTop[top] = (byTop[top] ?? 0) + 1;
}

if (process.argv.includes("--list")) {
  for (const k of unused) console.log(k);
  console.log(`---- ${unused.length} unused of ${keys.length}`);
  console.log(`---- dynamic prefixes honoured: ${dynamicPrefixes.length}`);
  process.exit(0);
}

if (process.argv.includes("--baseline")) {
  writeFileSync(
    BASELINE,
    JSON.stringify({ total: unused.length, groups: Object.fromEntries(Object.entries(byTop).sort()) }, null, 2) + "\n",
  );
  console.log(`baseline written: ${unused.length} unused keys`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
if (unused.length > baseline.total) {
  const added = Object.entries(byTop).filter(([g, n]) => n > (baseline.groups[g] ?? 0));
  console.error(`Unused translation keys went up: ${unused.length}, baseline allows ${baseline.total}.\n`);
  console.error(added.map(([g, n]) => `  ${g}: ${n}, baseline allows ${baseline.groups[g] ?? 0}`).join("\n"));
  console.error(`\nRemoving a feature means removing its keys. Run --list to see them.`);
  console.error(`If you deliberately deleted a batch, re-run with --baseline to lower the bar.`);
  process.exit(1);
}

console.log(
  `No new unused translation keys. ${unused.length} of ${keys.length} unread` +
    (unused.length < baseline.total ? ` (${baseline.total - unused.length} fewer than the baseline — run --baseline to bank it).` : "."),
);
