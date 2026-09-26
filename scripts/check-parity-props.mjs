// Optional props on shared components that only one app passes.
//
// packages/ui components are prop-only: a platform-bound feature arrives as an
// optional prop an app may omit. That is the sharing model working — and it is
// also how a feature goes missing on one client without anything failing.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Props that are platform-bound on purpose: the capability exists on one side
// only, so the shared component hiding its control is the design working.
// Everything else that lands in this report is a feature one client lost.
const PLATFORM_BOUND = new Set([
  // Windows/macOS picture-in-picture is an OS surface the browser has no
  // equivalent for.
  "onOpenOsPipWindow", "onCloseOsPipWindow", "onListenOsPipClose",
  "onOsPipChunk", "onOsPipStop",
  // The user build is a web artefact: adding a hub, its invite field and the
  // passkey path all exist on the page a hub serves, not in the Tauri shell.
  "onAddWithPasskey", "onInviteCodeChange",
  // Desktop types a hub address before it has one; the web build is served by
  // the hub it is about to talk to.
  "onCheckHubUrl",
  // Mobile shell only; no desktop or web caller.
  "onBack",
  // The unread total drives the OS tray badge (set_tray_unread). A browser
  // tab has no tray; putting the count in the title would be its own feature.
  "onTotalChange",
]);
const walk = (d, out = []) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist") continue;
    const p = join(d, e.name).replaceAll("\\", "/");
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
};

const uiFiles = walk(join(ROOT, "packages/ui/src"));
const webFiles = walk(join(ROOT, "apps/web/src"));
const deskFiles = walk(join(ROOT, "apps/desktop/src"));

const read = (fs_) => fs_.map((f) => readFileSync(f, "utf8")).join("\n");
const webText = read(webFiles);
const deskText = read(deskFiles);

// Optional props declared on shared components, callback-shaped or render-shaped
// (those are the ones that carry a *feature*, not a style flag).
const optional = new Map();
for (const f of uiFiles) {
  for (const m of readFileSync(f, "utf8").matchAll(/^\s{2}(on[A-Z]\w+|render[A-Z]\w+)\?:/gm)) {
    if (!optional.has(m[1])) optional.set(m[1], f.slice(ROOT.length + 1));
  }
}

const supplies = (text, name) =>
  new RegExp(`\\b${name}=\\{`).test(text) || new RegExp(`\\b${name}=["']`).test(text) || new RegExp(`\\b${name}:\\s*(async\\s*)?\\(`).test(text);
// An empty arrow is a prop passed and deliberately doing nothing.
const stubbed = (text, name) =>
  new RegExp(`\\b${name}=\\{\\s*\\(\\s*[^)]*\\)\\s*=>\\s*\\{\\s*\\}\\s*\\}`).test(text);

const rows = [];
for (const [name, where] of optional) {
  const w = supplies(webText, name);
  const d = supplies(deskText, name);
  const ws = stubbed(webText, name);
  const ds = stubbed(deskText, name);
  if (w && d && !ws && !ds) continue;
  if (!w && !d) continue; // nobody uses it; dead prop, different problem
  if (PLATFORM_BOUND.has(name)) continue;
  rows.push({ name, where, web: ws ? "stub" : w ? "yes" : "NO", desktop: ds ? "stub" : d ? "yes" : "NO" });
}

rows.sort((a, b) => a.name.localeCompare(b.name));

// Known gaps, same idiom as packages/i18n's hardcoded baseline: this file is
// the to-do list, and CI fails on anything that is not already on it. Porting
// a feature means deleting its line here.
const BASELINE_PATH = join(ROOT, "scripts/parity-baseline.json");
const baseline = new Set(
  existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, "utf8")).known : [],
);
const fresh = rows.filter((r) => !baseline.has(r.name));
const known = rows.filter((r) => baseline.has(r.name));

if (known.length > 0) {
  console.log(`${known.length} known parity gaps (scripts/parity-baseline.json):`);
  for (const r of known) {
    console.log("  " + r.name.padEnd(28) + "missing on " + (r.web === "NO" ? "web" : "desktop"));
  }
  console.log("");
}

if (fresh.length === 0) {
  console.log("parity OK: no new shared feature prop reaches only one client.");
  process.exit(0);
}
rows.length = 0;
rows.push(...fresh);
console.log(`${rows.length} optional feature props are not supplied by both apps\n`);
console.error("prop".padEnd(30) + "web".padEnd(6) + "desktop".padEnd(9) + "declared in");
for (const r of rows) {
  console.error(r.name.padEnd(30) + r.web.padEnd(6) + r.desktop.padEnd(9) + r.where);
}

console.error(
  "\nA missing prop is a hidden control, not an error - that is what makes it quiet."
    + "\nSupply it, or add it to PLATFORM_BOUND with the reason.",
);
process.exit(1);
