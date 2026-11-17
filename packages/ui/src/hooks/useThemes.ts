import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyThemeTokens,
  loadTheme,
  newTheme,
  resolveScheme,
  type SchemeMode,
  type ThemeManifest,
} from "../themes/theme";
import { newPackageId, type StoredPackage } from "../themes/packageStore";
import { useActiveThemeIcons } from "../themes/themeIcons";
import type { ThemeStore } from "../themes/themeStore";

// Shared by web and desktop. Device-wide: installed packages in IndexedDB,
// the choice (`themeId`, `mode`) in localStorage under the synced
// "wavvon:appearance" key.
const APPEARANCE_KEY = "wavvon:appearance";

interface Appearance {
  mode: SchemeMode;
  themeId: string | null;
}

function readAppearance(): Appearance {
  try {
    const a = JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? "{}") as Partial<Appearance>;
    return {
      mode: a.mode === "light" || a.mode === "system" ? a.mode : "dark",
      themeId: typeof a.themeId === "string" ? a.themeId : null,
    };
  } catch {
    return { mode: "dark", themeId: null };
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

export function useThemes(store: ThemeStore) {
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
  useActiveThemeIcons(active?.manifest.icons, active?.files);

  useEffect(() => {
    const manifest = active?.manifest ?? null;
    if (!loaded && appearance.themeId) {
      document.documentElement.dataset.theme = resolveScheme(null, appearance.mode, systemDark);
      return;
    }
    const scheme = resolveScheme(manifest, appearance.mode, systemDark);
    document.documentElement.dataset.theme = scheme;
    applyThemeTokens(manifest?.colors[scheme], { reduceTransparency });
  }, [active, loaded, appearance, systemDark, reduceTransparency]);

  const persist = useCallback((next: Appearance) => {
    setAppearance(next);
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(next));
  }, []);

  const select = useCallback((themeId: string | null) => persist({ ...appearance, themeId }), [appearance, persist]);
  const setMode = useCallback((mode: SchemeMode) => persist({ ...appearance, mode }), [appearance, persist]);

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

  return { themes, active, mode: appearance.mode, systemDark, select, setMode, edit, install, create, remove };
}

export type ThemesController = ReturnType<typeof useThemes>;
