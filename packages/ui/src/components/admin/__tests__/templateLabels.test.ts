import { readFileSync } from "node:fs";
import { LAYOUT_OPTIONS } from "../../../themes/layout";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS } from "../RolesSection";
import { CHANNEL_ICONS } from "../../Icons";

// These labels are looked up as `<prefix>.${id}`, built from the id at render
// time. check-i18n compares catalog against catalog and find-hardcoded scans
// literals, so neither can see a template key with no entry behind it — the UI
// would just print the key.
const catalogs = join(dirname(fileURLToPath(import.meta.url)), "../../../../../i18n");
const LANGS = ["en", "it", "es", "de"];

const SHORTCUT_IDS = [
  "palette", "close", "send", "newline", "channel_prev_next", "hub_prev_next",
  "settings", "mute", "deafen", "voice", "cheatsheet", "search", "emoji",
  "composer", "messages", "lists", "collapse", "expand", "home_end",
];

const LAYOUT_OPTIONS_IDS = Object.entries(LAYOUT_OPTIONS).flatMap(([k, vs]) => vs.map((v) => `${k}.${v}`));
const SCHEMES = ["dark", "light"];

const FAMILIES: { name: string; prefix: string; ids: string[] }[] = [
  { name: "role permissions", prefix: "hub.admin.roles.perm", ids: ALL_PERMISSIONS },
  { name: "channel icons", prefix: "channel.icon", ids: CHANNEL_ICONS.map((d) => d.id) },
  { name: "keyboard shortcuts", prefix: "shortcuts.action", ids: SHORTCUT_IDS },
  { name: "theme tab", prefix: "settings.theme.tab", ids: ["colors", "icons", "background", "layout", "sounds", "preview"] },
  { name: "theme sound name", prefix: "settings.theme.sounds.name", ids: ["message", "mention", "voice_join", "voice_leave", "mute", "unmute", "deafen", "undeafen"] },
  { name: "theme background fit", prefix: "settings.theme.background.fit", ids: ["cover", "contain", "tile", "center"] },
  { name: "theme layout key", prefix: "settings.theme.layout", ids: Object.keys(LAYOUT_OPTIONS) },
  { name: "theme layout value", prefix: "settings.theme.layout", ids: LAYOUT_OPTIONS_IDS },
  { name: "theme mode", prefix: "settings.theme.mode", ids: ["system", ...SCHEMES] },
  { name: "theme scheme", prefix: "settings.theme.scheme", ids: SCHEMES },
  { name: "theme add scheme", prefix: "settings.theme.add_scheme", ids: SCHEMES },
];

describe("template-built labels", () => {
  for (const lang of LANGS) {
    const cat = JSON.parse(readFileSync(join(catalogs, `${lang}.json`), "utf8")) as Record<string, string>;
    for (const family of FAMILIES) {
      it(`${lang} has a label for every ${family.name}`, () => {
        const missing = family.ids.filter((id) => !cat[`${family.prefix}.${id}`]);
        expect(missing).toEqual([]);
      });
    }
  }
});
