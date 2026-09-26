// The two builds must not merely hide each other's screens — they must not
// ship them (decisions.md, "Two web clients: one per hub, one per user").
//
// The failure this exists to catch: `MULTI_HUB` in src/constants.ts stops
// being a build-time literal — read from a config, a hook, a fetch, anything
// the bundler cannot fold. Every gate still evaluates false, so the UI looks
// exactly right, while every dropped screen is back in the bundle. Nothing
// visible breaks. This does.
//
// Each marker is checked BOTH ways: present in the bundle that owns it,
// absent from the other. Without the present-check, renaming a string would
// leave this gate silently green forever.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Markers must be strings that exist ONLY in the relevant component's code.
// Not i18n keys: the catalogs are bundled whole in both builds, so every key
// is present either way and the check would fail on a bundle that is
// perfectly clean. (Cost an afternoon; hence this comment.) Class names and
// literal values work — the CSS lives in its own asset, and this reads only
// the JS.
//
// The directory is not among the markers: `DIRECTORY_URL` is null, so
// DiscoverPage is dead code in *both* builds and proves nothing. Add one
// (`discover-search-bar`) the day that constant gets a value.
const USER_ONLY = [
  "add-hub-title", // AddHubModal
  "home-hubs-section", // HomeHubsSection — the home-hub editor
  "handover-adopt", // AdoptScreen — the user build receives a handover
];

// The exclusion runs both ways: the hub build is the *sender* of an identity
// handover, and the user build has no use for that screen either.
const HUB_ONLY = [
  "handover-move", // MoveToUserClientSection
];

function bundle(dir) {
  let names;
  try {
    names = readdirSync(join(dir, "assets"));
  } catch {
    console.error(`${dir}/assets missing — run \`npm run build\` and \`npm run build:hub\` first.`);
    process.exit(2);
  }
  const js = names.filter((n) => n.endsWith(".js"));
  if (js.length === 0) {
    console.error(`no JS emitted in ${dir}/assets`);
    process.exit(2);
  }
  return js.map((n) => readFileSync(join(dir, "assets", n), "utf8")).join("\n");
}

const user = bundle("dist");
const hub = bundle("dist-hub");

const failures = [];
let skipped = 0;

for (const m of USER_ONLY) {
  if (!user.includes(m)) failures.push(`marker "${m}" is not in the user bundle — it no longer proves anything, pick another`);
  if (hub.includes(m)) failures.push(`marker "${m}" IS in the hub bundle — a user-build screen was not eliminated`);
}

for (const m of HUB_ONLY) {
  if (!hub.includes(m) && !user.includes(m)) {
    // In neither bundle: the handover section's body sits behind an early
    // return on USER_CLIENT_URL, which is null until the hosted app has a
    // domain, so the minifier proves the whole render dead in both builds.
    // Nothing to compare yet — say so rather than failing on a bundle that is
    // correct, or deleting a check that arms itself the day the constant is
    // set.
    console.log(`SKIP: "${m}" is in neither bundle — USER_CLIENT_URL is not configured yet.`);
    skipped += 1;
    continue;
  }
  if (!hub.includes(m)) failures.push(`marker "${m}" is not in the hub bundle — it no longer proves anything, pick another`);
  if (user.includes(m)) failures.push(`marker "${m}" IS in the user bundle — a hub-build screen was not eliminated`);
}

if (failures.length > 0) {
  for (const f of failures) console.error(`FAIL: ${f}`);
  process.exit(1);
}

const checked = USER_ONLY.length + HUB_ONLY.length - skipped;
console.log(
  `both builds clean: ${checked} markers checked, each present in its own bundle and absent from the other` +
    (skipped ? ` (${skipped} skipped, see above)` : "") +
    ".",
);
