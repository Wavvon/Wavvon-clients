// Find class selectors in styles.css that nothing in the repo uses.
//
// `styles.css` is the single canonical stylesheet for both apps, so a class
// whose component was deleted leaves its rules behind with nothing to notice.
// The redesign swept components and custom properties clean and left ~190
// lines of class blocks (Wavvon-clients#62).
//
//   node find-unused-css.mjs            # check against the baseline
//   node find-unused-css.mjs --list     # every unused class, with its lines
//   node find-unused-css.mjs --baseline # accept the current state
//
// Ratchets down like the other checkers: CI fails when the count goes up.
//
// Deliberately conservative. A class counts as used on a bare mention anywhere
// in any source file, which over-reports usage — the cost is a missed
// deletion, where the other direction would delete live styling.
//
// The prefix inference below has the same bias and the same blind spot, and
// `.mini-app-overlay` is the worked example: it is dead, but `mini-app-${id}`
// appears in the desktop app as a **Tauri window label**, so the prefix reads
// as live and the class is never reported. Nothing distinguishes the two at
// this level. Treat a clean run as "no new dead classes", not as "no dead
// classes".

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const BASELINE = join(here, "unused-css-baseline.json");
const CSS = join(here, "src/styles.css");
const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();

const css = readFileSync(CSS, "utf8").replace(/\r\n/g, "\n");

// Every class name the stylesheet defines, with the first line it appears on.
//
// Selectors are taken as the run of text before each `{`, back to the previous
// brace — not line by line. A selector list wrapped across lines
// (`.mini-app-overlay,\n.mini-app-header {`) puts every name but the last on a
// line with no brace on it, and a line-by-line scan reports those as used
// because it never saw them defined.
const defined = new Map();
const noComments = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
const lineAt = (i) => noComments.slice(0, i).split("\n").length;
let cursor = 0;
for (const m of noComments.matchAll(/[{}]/g)) {
  if (m[0] === "{") {
    const selector = noComments.slice(cursor, m.index);
    // `@media (...)` and the like open a block whose "selector" is an at-rule.
    if (!/^\s*@/.test(selector)) {
      for (const c of selector.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) {
        if (!defined.has(c[1])) defined.set(c[1], lineAt(cursor + c.index));
      }
    }
  }
  cursor = m.index + 1;
}

const files = execSync('git ls-files "*.ts" "*.tsx" "*.rs" "*.html" "*.md"', {
  encoding: "utf8",
  cwd: repoRoot,
})
  .split("\n")
  .filter((f) => f && existsSync(join(repoRoot, f)));
const haystack = files.map((f) => readFileSync(join(repoRoot, f), "utf8")).join("\n");

// Classes assembled at runtime — `status-${s}`, `component-btn--${v}` — never
// appear whole in the source. Collect the prefixes from the source itself so
// there is no hand-maintained list to go stale.
//
// The prefix is rarely at the start of its template literal: it is usually
// `` `chip status-${s}` ``, with a space before it. Anchoring on the opening
// quote missed exactly the families this check is most likely to get wrong —
// `status-*`, `ping-*`, `hover-submenu-*` are all live and all looked dead.
const dynamicPrefixes = [...new Set(
  [...haystack.matchAll(/(?<![\w-])([A-Za-z][\w-]*[-_])\$\{/g)].map((m) => m[1]),
)];

const unused = [...defined.entries()]
  .filter(([name]) => !haystack.includes(name) && !dynamicPrefixes.some((p) => name.startsWith(p)))
  .map(([name, line]) => ({ name, line }))
  .sort((a, b) => a.line - b.line);

if (process.argv.includes("--list")) {
  for (const u of unused) console.log(`styles.css:${u.line}\t.${u.name}`);
  console.log(`---- ${unused.length} unused of ${defined.size} classes`);
  console.log(`---- dynamic prefixes honoured: ${dynamicPrefixes.length}`);
  process.exit(0);
}

if (process.argv.includes("--baseline")) {
  writeFileSync(
    BASELINE,
    JSON.stringify({ total: unused.length, classes: unused.map((u) => u.name).sort() }, null, 2) + "\n",
  );
  console.log(`baseline written: ${unused.length} unused classes`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
const allowed = new Set(baseline.classes);
const added = unused.filter((u) => !allowed.has(u.name));
if (added.length) {
  console.error("Unused CSS classes that are not in the baseline:\n");
  console.error(added.map((u) => `  .${u.name} (styles.css:${u.line})`).join("\n"));
  console.error(`\nDeleting a component means deleting its styles.`);
  console.error(`If you deliberately removed a batch, re-run with --baseline to lower the bar.`);
  process.exit(1);
}

console.log(
  `No new unused CSS classes. ${unused.length} of ${defined.size} unused` +
    (unused.length < baseline.total ? ` (${baseline.total - unused.length} fewer than the baseline — run --baseline to bank it).` : "."),
);
