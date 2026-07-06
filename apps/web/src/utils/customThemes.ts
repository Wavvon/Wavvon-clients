import type { WavvonSkin } from "../skinValidation";

// Multi-theme is a client-only, personal-axis feature, mirroring the
// profileStore pattern in utils/profiles.ts: a named array + a
// currently-applied id, persisted locally.

const CUSTOM_THEMES_KEY = "wavvon.customThemes";
const LEGACY_APPEARANCE_KEY = "wavvon:appearance";

export interface NamedCustomTheme {
  id: string;
  name: string;
  skin: WavvonSkin;
}

export interface CustomThemeStore {
  themes: NamedCustomTheme[];
  activeId: string | null;
}

function migrateLegacySingleSkin(): CustomThemeStore | null {
  try {
    const raw = localStorage.getItem(LEGACY_APPEARANCE_KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as { slot?: string; skin?: WavvonSkin | null };
    if (a.slot !== "custom" || !a.skin) return null;
    const id = newCustomThemeId();
    return {
      themes: [{ id, name: "My theme", skin: { ...a.skin, name: "My theme" } }],
      activeId: id,
    };
  } catch {
    return null;
  }
}

export function loadCustomThemeStore(): CustomThemeStore {
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_KEY);
    if (raw) return JSON.parse(raw) as CustomThemeStore;
  } catch { /* fall through */ }

  const migrated = migrateLegacySingleSkin();
  if (migrated) {
    saveCustomThemeStore(migrated);
    return migrated;
  }

  return { themes: [], activeId: null };
}

export function saveCustomThemeStore(store: CustomThemeStore): void {
  try {
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(store));
  } catch { /* ignore */ }
}

export function newCustomThemeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `theme-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  }
}
