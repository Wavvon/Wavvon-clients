import { buildPackage, loadPackage, THEME_EXTENSIONS, type LoadedPackage, type PackageFiles } from "./packageFormat";
import { ALL_TOKEN_NAMES, tokenType, validateTokenMap } from "./themeTokens";

export type Scheme = "dark" | "light";
export type SchemeMode = Scheme | "system";

export const THEME_MANIFEST_FILE = "theme.json";

export interface ThemeManifest {
  format: "wavvon.theme";
  version: 1;
  name: string;
  author_pubkey?: string;
  description?: string;
  colors: { dark?: Record<string, string>; light?: Record<string, string> };
}

export type ThemePackage = LoadedPackage<ThemeManifest>;

export function validateThemeManifest(raw: unknown): ThemeManifest {
  if (typeof raw !== "object" || raw === null) throw new Error("theme.json is not an object");
  const s = raw as Record<string, unknown>;
  if (s.format !== "wavvon.theme") throw new Error("Invalid format field");
  if (s.version !== 1) throw new Error("Unsupported version");
  if (typeof s.name !== "string" || s.name.trim() === "" || s.name.length > 48) {
    throw new Error("Invalid name (must be 1-48 characters)");
  }
  const c = s.colors;
  if (typeof c !== "object" || c === null || Array.isArray(c)) throw new Error("Missing colors block");
  const colors: ThemeManifest["colors"] = {};
  const raw2 = c as Record<string, unknown>;
  if (raw2.dark !== undefined) colors.dark = validateTokenMap(raw2.dark, "dark");
  if (raw2.light !== undefined) colors.light = validateTokenMap(raw2.light, "light");
  if (!colors.dark && !colors.light) throw new Error("colors needs a dark or a light map");
  return {
    format: "wavvon.theme",
    version: 1,
    name: s.name.trim(),
    ...(typeof s.author_pubkey === "string" ? { author_pubkey: s.author_pubkey } : {}),
    ...(typeof s.description === "string" ? { description: s.description.slice(0, 500) } : {}),
    colors,
  };
}

export function loadTheme(bytes: Uint8Array): ThemePackage {
  return loadPackage(bytes, {
    manifestFile: THEME_MANIFEST_FILE,
    allowedExtensions: THEME_EXTENSIONS,
    validateManifest: validateThemeManifest,
  });
}

export function exportTheme(pkg: ThemePackage): Uint8Array {
  return buildPackage(THEME_MANIFEST_FILE, pkg.manifest, pkg.files as PackageFiles);
}

export function newTheme(name: string, scheme: Scheme): ThemePackage {
  return {
    manifest: { format: "wavvon.theme", version: 1, name, colors: { [scheme]: {} } },
    files: {},
  };
}

/** Which scheme a theme shows: with both maps the user's mode decides
 *  (system follows the OS); with one, that one. */
export function resolveScheme(manifest: ThemeManifest | null, mode: SchemeMode, systemDark: boolean): Scheme {
  const pinned: Scheme = mode === "system" ? (systemDark ? "dark" : "light") : mode;
  if (!manifest) return pinned;
  const { dark, light } = manifest.colors;
  if (dark && light) return pinned;
  return dark ? "dark" : "light";
}

export interface ApplyOptions {
  reduceTransparency: boolean;
}

export function clearThemeTokens(): void {
  const el = document.documentElement;
  ALL_TOKEN_NAMES.forEach((k) => el.style.removeProperty(k));
}

export function applyThemeTokens(tokens: Record<string, string> | undefined, opts: ApplyOptions): void {
  clearThemeTokens();
  const el = document.documentElement;
  for (const [k, v] of Object.entries(tokens ?? {})) {
    // The user asked the system for less transparency: the theme's
    // translucent tokens give way to the built-in ones.
    if (opts.reduceTransparency && tokenType(k) === "color-alpha") continue;
    el.style.setProperty(k, v);
  }
}

export function readBaseToken(token: string, scheme: Scheme): string {
  const el = document.documentElement;
  const prev = el.dataset.theme;
  const inline = el.style.getPropertyValue(token);
  el.style.removeProperty(token);
  el.dataset.theme = scheme;
  const v = getComputedStyle(el).getPropertyValue(token).trim();
  if (prev !== undefined) el.dataset.theme = prev;
  if (inline) el.style.setProperty(token, inline);
  return v;
}

export function downloadTheme(pkg: ThemePackage): void {
  const blob = new Blob([exportTheme(pkg) as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${pkg.manifest.name.replace(/[^a-zA-Z0-9\-_]/g, "_")}.wavvontheme`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
