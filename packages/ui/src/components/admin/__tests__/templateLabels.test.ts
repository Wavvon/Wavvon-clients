import { readFileSync } from "node:fs";
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

const THEME_IDS = ["calm", "classic", "linear", "light", "custom"];

const FAMILIES: { name: string; prefix: string; ids: string[] }[] = [
  { name: "role permissions", prefix: "hub.admin.roles.perm", ids: ALL_PERMISSIONS },
  { name: "channel icons", prefix: "channel.icon", ids: CHANNEL_ICONS.map((d) => d.id) },
  { name: "keyboard shortcuts", prefix: "shortcuts.action", ids: SHORTCUT_IDS },
  { name: "theme tagline", prefix: "settings.theme.tagline", ids: THEME_IDS },
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
