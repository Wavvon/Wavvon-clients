import { setSoundVolume, setThemeSounds, isSoundName, type SoundName } from "@wavvon/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { applyBackground, clearBackground } from "../themes/background";
import { applyLayout, normalizeLayout, resolveLayout, type LayoutChoice, type LayoutKey } from "../themes/layout";
import {
  applyThemeTokens,
  loadTheme,
  newTheme,
  readBaseToken,
  resolveScheme,
  type SchemeMode,
  type ThemeManifest,
} from "../themes/theme";
import { newPackageId, type StoredPackage } from "../themes/packageStore";
import { useActiveThemeIcons } from "../themes/themeIcons";
import { useBlobUrl } from "../themes/useBlobUrl";
import type { ThemeStore } from "../themes/themeStore";
import type { HubTheme } from "../themes/hubTheme";

// Shared by web and desktop. Device-wide: installed packages in IndexedDB,
// the choice (`themeId`, `mode`) in localStorage under the synced
// "wavvon:appearance" key.
const APPEARANCE_KEY = "wavvon:appearance";

interface Appearance {
  mode: SchemeMode;
  themeId: string | null;
  /** User switches: the theme's background off entirely, or just its blur. */
  bgOff: boolean;
  blurOff: boolean;
  /** The user's own layout choices; a key left out follows the theme. */
  layout: LayoutChoice;
  /** 0 to 1, scales every sound. */
  soundVolume: number;
  /** Apply the open hub's theme when the user has none of their own;
   *  undefined follows the build's default. */
  hubThemes?: boolean;
}

function readAppearance(): Appearance {
  try {
    const a = JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? "{}") as Partial<Appearance>;
    return {
      mode: a.mode === "light" || a.mode === "system" ? a.mode : "dark",
      themeId: typeof a.themeId === "string" ? a.themeId : null,
      bgOff: a.bgOff === true,
      blurOff: a.blurOff === true,
      layout: normalizeLayout(a.layout),
      soundVolume: typeof a.soundVolume === "number" ? Math.min(1, Math.max(0, a.soundVolume)) : 1,
      ...(typeof a.hubThemes === "boolean" ? { hubThemes: a.hubThemes } : {}),
    };
  } catch {
    return { mode: "dark", themeId: null, bgOff: false, blurOff: false, layout: {}, soundVolume: 1 };
  }
}

function query(q: string): MediaQueryList | null {
  return typeof matchMedia === "function" ? matchMedia(q) : null;
}

function useMedia(q: string): boolean {
  const [on, setOn] = useState(() => query(q)?.matches ?? false);
  useEffect(() => {
    const mq = query(q);
    if (!mq) return;
    const h = () => setOn(mq.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [q]);
  return on;
}

// A hub theme fetched before the app mounted (the hub build), so the first
// render starts from it instead of flashing the built-in theme.
let primed: HubTheme | null = null;

/** Whether a hub theme would show right now: the user's own theme wins, and
 *  the user can turn hub themes off. */
export function hubThemeWanted(hubThemesDefault: boolean): boolean {
  const a = readAppearance();
  return !a.themeId && (a.hubThemes ?? hubThemesDefault);
}

/** Before the first paint: remember the hub theme and put its colours and
 *  layout on the page. The background waits for the hook (it needs a blob URL). */
export function primeHubTheme(pkg: HubTheme): void {
  primed = pkg;
  const a = readAppearance();
  const systemDark = query("(prefers-color-scheme: dark)")?.matches ?? false;
  const reduceTransparency = query("(prefers-reduced-transparency: reduce)")?.matches ?? false;
  const scheme = resolveScheme(pkg.manifest, a.mode, systemDark);
  document.documentElement.dataset.theme = scheme;
  applyLayout(resolveLayout(pkg.manifest.layout, a.layout));
  applyThemeTokens(pkg.manifest.colors[scheme], { reduceTransparency });
}

export interface UseThemesOptions {
  /** Hub themes on unless the user turns them off: the hub build. The
   *  multi-hub clients leave them off until the user opts in. */
  hubThemesDefault?: boolean;
}

export function useThemes(store: ThemeStore, opts: UseThemesOptions = {}) {
  const hubThemesDefault = opts.hubThemesDefault ?? false;
  const [hubTheme, setHubTheme] = useState<HubTheme | null>(primed);
  const [themes, setThemes] = useState<StoredPackage<ThemeManifest>[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [appearance, setAppearance] = useState<Appearance>(readAppearance);
  const systemDark = useMedia("(prefers-color-scheme: dark)");
  const reduceTransparency = useMedia("(prefers-reduced-transparency: reduce)");

  const refresh = useCallback(async () => {
    setThemes(await store.list().catch(() => []));
    setLoaded(true);
  }, [store]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const active = themes.find((t) => t.id === appearance.themeId) ?? null;
  // A gallery theme is worn before it is kept; `replaces` is the installed
  // theme an update would overwrite.
  const [preview, setPreview] = useState<{ pkg: StoredPackage<ThemeManifest>; replaces?: string } | null>(null);
  const hubThemesOn = appearance.hubThemes ?? hubThemesDefault;
  // The user's own choice always wins over the hub's default.
  const shown = preview?.pkg ?? active ?? (hubThemesOn ? hubTheme : null);
  useActiveThemeIcons(shown?.manifest.icons, shown?.files);
  const soundMap = shown?.manifest.sounds;
  const soundFiles = shown?.files;
  useEffect(() => {
    const map: Partial<Record<SoundName, Uint8Array>> = {};
    for (const [name, path] of Object.entries(soundMap ?? {})) {
      const bytes = soundFiles?.[path];
      if (bytes && isSoundName(name)) map[name] = bytes;
    }
    setThemeSounds(map);
    return () => setThemeSounds({});
  }, [soundMap, soundFiles]);
  useEffect(() => setSoundVolume(appearance.soundVolume), [appearance.soundVolume]);
  const bgPath = shown?.manifest.background?.image;
  const bgUrl = useBlobUrl(bgPath ? shown?.files[bgPath] : undefined, bgPath);

  useEffect(() => {
    const manifest = shown?.manifest ?? null;
    if (!loaded && appearance.themeId) {
      document.documentElement.dataset.theme = resolveScheme(null, appearance.mode, systemDark);
      return;
    }
    const scheme = resolveScheme(manifest, appearance.mode, systemDark);
    applyLayout(resolveLayout(manifest?.layout, appearance.layout));
    document.documentElement.dataset.theme = scheme;
    applyThemeTokens(manifest?.colors[scheme], { reduceTransparency });
    const bg = manifest?.background;
    if (manifest && bg && bgUrl && !appearance.bgOff) {
      applyBackground(bg, {
        url: bgUrl,
        reduceTransparency,
        blurOff: appearance.blurOff,
        resolve: (t) => manifest.colors[scheme]?.[t] ?? readBaseToken(t, scheme),
      });
    } else {
      clearBackground();
    }
  }, [shown, loaded, appearance, systemDark, reduceTransparency, bgUrl]);

  const persist = useCallback((next: Appearance) => {
    setAppearance(next);
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(next));
  }, []);

  const select = useCallback((themeId: string | null) => persist({ ...appearance, themeId }), [appearance, persist]);
  const setBackgroundOff = useCallback((bgOff: boolean) => persist({ ...appearance, bgOff }), [appearance, persist]);
  const setBlurOff = useCallback((blurOff: boolean) => persist({ ...appearance, blurOff }), [appearance, persist]);
  const setUserLayout = useCallback(
    (key: LayoutKey, value: string | null) => {
      const layout = { ...appearance.layout };
      if (value === null) delete layout[key];
      else layout[key] = value;
      persist({ ...appearance, layout });
    },
    [appearance, persist],
  );
  const setSoundVolumeChoice = useCallback((soundVolume: number) => persist({ ...appearance, soundVolume }), [appearance, persist]);
  const setMode = useCallback((mode: SchemeMode) => persist({ ...appearance, mode }), [appearance, persist]);
  const setHubThemesOn = useCallback((hubThemes: boolean) => persist({ ...appearance, hubThemes }), [appearance, persist]);

  const save = useCallback(
    async (pkg: StoredPackage<ThemeManifest>) => {
      await store.put(pkg);
      setThemes((cur) => (cur.some((t) => t.id === pkg.id) ? cur.map((t) => (t.id === pkg.id ? pkg : t)) : [...cur, pkg]));
    },
    [store],
  );

  // Editor changes arrive per drag tick; the package may hold megabytes.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const edit = useCallback(
    (pkg: StoredPackage<ThemeManifest>) => {
      setThemes((cur) => cur.map((t) => (t.id === pkg.id ? pkg : t)));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void store.put(pkg), 400);
    },
    [store],
  );

  const startPreview = useCallback(
    (bytes: Uint8Array, sha256: string, replaces?: string) => {
      const pkg = { id: replaces ?? newPackageId(), sha256, ...loadTheme(bytes) };
      setPreview({ pkg, replaces });
    },
    [],
  );
  const discardPreview = useCallback(() => setPreview(null), []);
  const keepPreview = useCallback(async () => {
    if (!preview) return;
    await save(preview.pkg);
    select(preview.pkg.id);
    setPreview(null);
  }, [preview, save, select]);

  /** Throws PackageError naming the broken rule; nothing is installed then. */
  const install = useCallback(
    async (bytes: Uint8Array) => {
      const pkg = loadTheme(bytes);
      const stored = { id: newPackageId(), ...pkg };
      await save(stored);
      select(stored.id);
      return stored;
    },
    [save, select],
  );

  const create = useCallback(
    async (name: string) => {
      const scheme = resolveScheme(null, appearance.mode, systemDark);
      const stored = { id: newPackageId(), ...newTheme(name, scheme) };
      await save(stored);
      select(stored.id);
    },
    [save, select, appearance.mode, systemDark],
  );

  const remove = useCallback(
    async (id: string) => {
      await store.remove(id);
      setThemes((cur) => cur.filter((t) => t.id !== id));
      if (appearance.themeId === id) persist({ ...appearance, themeId: null });
    },
    [store, appearance, persist],
  );

  return { themes, active, preview: preview?.pkg ?? null, startPreview, discardPreview, keepPreview, mode: appearance.mode, bgOff: appearance.bgOff, blurOff: appearance.blurOff, userLayout: appearance.layout, soundVolume: appearance.soundVolume, setSoundVolume: setSoundVolumeChoice, systemDark, select, setMode, hubTheme, setHubTheme, hubThemesOn, setHubThemesOn, setBackgroundOff, setBlurOff, setUserLayout, edit, install, create, remove };
}

export type ThemesController = ReturnType<typeof useThemes>;
