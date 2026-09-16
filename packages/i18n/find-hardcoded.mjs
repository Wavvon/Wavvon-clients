// Find user-visible strings that never became translation keys.
//
// `check-coverage.ts` guarantees that every key in en.json exists in the other
// three catalogs. It cannot see the string that was never a key at all, and
// that blind spot is how ~1100 hardcoded English strings accumulated in an app
// advertising four locales — every locale "complete", most of the UI English.
//
// This walks the tracked .tsx files instead and reports what is still literal.
// Run with --baseline to rewrite hardcoded-baseline.json after a batch of
// files has been translated. CI fails when the count for a file goes *up*, or
// when a file absent from the baseline gains a literal: the number ratchets
// down and never back.
//
//   node find-hardcoded.mjs            # check against the baseline
//   node find-hardcoded.mjs --list     # every finding, file:line
//   node find-hardcoded.mjs --baseline # accept the current state

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASELINE = join(dirname(fileURLToPath(import.meta.url)), "hardcoded-baseline.json");
const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();

const files = execSync('git ls-files "*.tsx"', { encoding: "utf8", cwd: repoRoot })
  // existsSync: a file deleted in the working tree is still tracked, and a
  // deletion is the direction this check wants — don't crash on it.
  .split("\n").filter(f => f && !f.includes("__tests__") && existsSync(join(repoRoot, f)));

/** Does this look like something a person reads, rather than code? */
function looksHuman(s) {
  const t = s.trim();
  if (t.length < 2) return false;
  if (!/[A-Za-z]{2}/.test(t)) return false;
  if (/^[a-z0-9_.-]+$/.test(t)) return false;                // identifiers, class names
  if (/^[A-Z0-9_]+$/.test(t) && !/ /.test(t)) return false;   // SCREAMING_CASE
  if (/^https?:\/\//.test(t)) return false;
  if (/var\(--/.test(t)) return false;                        // CSS value, e.g. "0 var(--space-1)"
  if (/^[a-z]+(?:[A-Z][a-zA-Z]*)*$/.test(t)) return false;    // camelCase identifier
  // Type syntax a text-node regex can still catch a fragment of.
  if (/^(Promise|Array|Record|Map|Set|ReactNode|void|string|number|boolean)\b/.test(t)) return false;
  if (/[;=]/.test(t)) return false;
  // Noise that survived long enough to be worth naming, because a count made
  // mostly of it stops meaning anything: CSS shorthand and functions, request
  // paths, keyboard bindings, and the fragments a text-node regex tears out of
  // JSX it cannot parse. Each of these was a "remaining string" nobody could
  // ever translate.
  if (/^-?[\d.]+(px|rem|em|%|s|ms|vh|vw|fr|deg)?( -?[\d.]+(px|rem|em|%|s|ms|vh|vw|fr|deg)?){0,3}$/.test(t)) return false;
  if (/^(repeat|minmax|calc|translate|translateX|translateY|scale|scaleX|scaleY|rotate|linear-gradient|auto-fill)\(/.test(t)) return false;
  if (/^#[0-9a-fA-F]{3,8}$/.test(t)) return false;            // a colour
  if (/^-?[\d.]+(px|rem|em|%)? +(auto|center|top|bottom|left|right)$/.test(t)) return false;
  if (/^\//.test(t)) return false;                            // an API path, not a sentence
  if (/^(Cmd|Ctrl|Alt|Shift|Meta|Esc|Enter|Tab|Space|Home|End)\b[\s+/↑↓←→A-Za-z,]*$/.test(t)) return false;
  if (/^[)}]\s|&&|\|\||=>|\?\s*\($/.test(t)) return false;    // torn-out JSX, not text
  return true;
}

// Comments are not UI, and this scan is regexes over raw source with no parser
// to tell them apart. The ternary rule below (`cond ? "Saving…" : "Save"`)
// fires on any colon followed by a quoted phrase, which ordinary prose in a
// doc comment produces all the time — `develop` sat red for two days over
// `the question being asked: "what does this alliance carry"`.
//
// Blanked rather than removed: every finding's line number comes from a slice
// offset into this same string, so the length has to survive.
//
// `(?<!:)` keeps the `//` in an `https://` URL from blanking the rest of its
// line. A `//` inside some other string literal still would, which costs a
// missed finding rather than a false one — the safe direction for a check
// whose baseline only ratchets down.
const blankComments = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(?<!:)\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));

const findings = [];
for (const f of files) {
  const src = blankComments(
    readFileSync(join(repoRoot, f), "utf8").replace(/\r\n/g, "\n"),
  );
  const lineOf = (i) => src.slice(0, i).split("\n").length;
  const add = (i, what, text) => findings.push({ f, line: lineOf(i), what, text });

  // A JSX text node, across lines. Text nodes cannot contain <, >, { or }, so
  // the character class is the whole guard. Matching line by line — the first
  // version of this — missed every multi-line label (`>\n  Remove\n<`) and so
  // reported files as clean that were not.
  // The lookbehind drops `=> Promise<void>`, `Array<Foo<Bar>>` and the
  // `invoke<Foo[]>(…)` calls that fill the desktop app, whose closing `]>`
  // otherwise pairs with the next call's `<` and reports the code between
  // them as a label.
  for (const m of src.matchAll(/(?<![=)\]])>([^<>{}]+)</g)) {
    const text = m[1].replace(/\s+/g, " ").trim();
    if (looksHuman(text)) add(m.index, "jsx-text", text);
  }
  for (const m of src.matchAll(/\b(placeholder|title|aria-label|alt|label|buttonLabel|confirmLabel)=(?:"([^"]+)"|\{"([^"]+)"\})/g)) {
    const v = m[2] ?? m[3];
    if (looksHuman(v)) add(m.index, m[1], v);
  }
  for (const m of src.matchAll(/window\.(?:confirm|alert)\(\s*"([^"]+)"/g)) {
    add(m.index, "confirm", m[1]);
  }
  // `{busy ? "Saving…" : "Save"}` and `err ?? "Something went wrong"`.
  for (const m of src.matchAll(/(?:\?\?|[?:])\s*"([^"]{3,})"/g)) {
    if (looksHuman(m[1])) add(m.index, "expr", m[1]);
  }
}

const counts = {};
for (const x of findings) counts[x.f] = (counts[x.f] ?? 0) + 1;

if (process.argv.includes("--list")) {
  for (const x of findings) console.log(`${x.f}:${x.line}\t${x.what}\t${x.text}`);
  console.log(`---- ${findings.length} literals in ${Object.keys(counts).length} files`);
  process.exit(0);
}

if (process.argv.includes("--baseline")) {
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE, JSON.stringify({ total: findings.length, files: sorted }, null, 2) + "\n");
  console.log(`baseline written: ${findings.length} literals in ${Object.keys(sorted).length} files`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
const regressions = [];
for (const [f, n] of Object.entries(counts)) {
  const allowed = baseline.files[f] ?? 0;
  if (n > allowed) regressions.push(`${f}: ${n} hardcoded literals, baseline allows ${allowed}`);
}

if (regressions.length) {
  console.error("New hardcoded UI strings — every user-visible string goes through i18n:\n");
  console.error(regressions.map(r => "  " + r).join("\n"));
  console.error(`\nRun \`node packages/i18n/find-hardcoded.mjs --list\` to see them.`);
  console.error(`If you deliberately translated a batch, re-run with --baseline to lower the bar.`);
  process.exit(1);
}

const improved = baseline.total - findings.length;
console.log(`No new hardcoded strings. ${findings.length} left to translate` +
  (improved > 0 ? ` (${improved} fewer than the baseline — run --baseline to bank it).` : "."));
