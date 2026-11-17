import { exportTheme, loadTheme, type ThemeManifest } from "./theme";
import { base64ToBytes, bytesToBase64, createIdbPackageStore, newPackageId, type PackageStore } from "./packageStore";

export type ThemeStore = PackageStore<ThemeManifest>;

export const deviceThemeStore: ThemeStore = createIdbPackageStore<ThemeManifest>("wavvon-themes");

/** One installed theme inside a full backup: the package itself, base64. */
export interface ArchiveTheme {
  name: string;
  package_b64: string;
}

export interface RestoredTheme extends ArchiveTheme {
  id: string;
}

export async function themesForArchive(store: ThemeStore): Promise<ArchiveTheme[]> {
  return (await store.list()).map((t) => ({
    name: t.manifest.name,
    package_b64: bytesToBase64(exportTheme(t)),
  }));
}

/** Entries that no longer validate are skipped: a backup must still restore
 *  everything else. Returns how many were written. */
export async function restoreThemes(store: ThemeStore, themes: RestoredTheme[]): Promise<number> {
  let written = 0;
  for (const t of themes) {
    try {
      const pkg = loadTheme(base64ToBytes(t.package_b64));
      await store.put({ id: t.id || newPackageId(), ...pkg });
      written++;
    } catch {
      // skipped
    }
  }
  return written;
}
