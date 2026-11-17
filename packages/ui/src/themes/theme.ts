import { normalizeBackground, type BackgroundFit } from "./background";
import { isIconName } from "./iconRegistry";
import { normalizeLayout, type LayoutChoice } from "./layout";
import {
  buildPackage,
  checkRelativePath,
  isImagePath,
  loadPackage,
  PackageError,
  THEME_EXTENSIONS,
  type LoadedPackage,
  type PackageFiles,
} from "./packageFormat";
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
  /** Icon name (iconRegistry) to a path inside the package. */
  icons?: Record<string, string>;
  background?: ThemeBackground;
  /** Defaults for the layout options; the user's own choices win. */
  layout?: LayoutChoice;
  /** Path of a captured preview image, for the gallery. */
  preview?: string;
}

export interface ThemeBackground {
  image: string;
  fit: BackgroundFit;
  /** 0 to 0.9: a dark veil over the image. */
  dim: number;
  /** 0.6 to 1: how opaque the panels stay. */
  panel_opacity: number;
  /** 0 to 20 px. */
  blur: number;
}

export const MAX_ICON_BYTES = 64 * 1024;
export const MAX_BACKGROUND_BYTES = 2 * 1024 * 1024;

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
  const icons = validateIcons(s.icons);
  const background = validateBackground(s.background);
  const layout = normalizeLayout(s.layout);
  let preview: string | undefined;
  if (typeof s.preview === "string") {
    checkRelativePath(s.preview);
    preview = s.preview;
  }
  return {
    format: "wavvon.theme",
    version: 1,
    name: s.name.trim(),
    ...(typeof s.author_pubkey === "string" ? { author_pubkey: s.author_pubkey } : {}),
    ...(typeof s.description === "string" ? { description: s.description.slice(0, 500) } : {}),
    colors,
    ...(icons ? { icons } : {}),
    ...(background ? { background } : {}),
    ...(Object.keys(layout).length ? { layout } : {}),
    ...(preview ? { preview } : {}),
  };
}

function validateIcons(raw: unknown): Record<string, string> | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("icons must be an object");
  const out: Record<string, string> = {};
  for (const [name, path] of Object.entries(raw)) {
    if (!isIconName(name)) continue;
    if (typeof path !== "string") throw new Error(`icons.${name}: expected a path`);
    checkRelativePath(path);
    out[name] = path;
  }
  return out;
}

function validateBackground(raw: unknown): ThemeBackground | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("background must be an object");
  const b = raw as Record<string, unknown>;
  if (typeof b.image !== "string") throw new Error("background.image: expected a path");
  checkRelativePath(b.image);
  return normalizeBackground(b, b.image);
}

function validateThemeFiles(manifest: ThemeManifest, files: PackageFiles): void {
  if (manifest.preview) {
    const file = files[manifest.preview];
    if (!file) throw new PackageError(`preview: ${manifest.preview} is not in the package`);
    if (!isImagePath(manifest.preview)) throw new PackageError(`preview: ${manifest.preview} is not an image`);
    if (file.byteLength > MAX_BACKGROUND_BYTES) throw new PackageError(`preview: ${manifest.preview} is larger than 2 MB`);
  }
  const bg = manifest.background;
  if (bg) {
    const file = files[bg.image];
    if (!file) throw new PackageError(`background: ${bg.image} is not in the package`);
    if (!isImagePath(bg.image)) throw new PackageError(`background: ${bg.image} is not an image`);
    if (file.byteLength > MAX_BACKGROUND_BYTES) throw new PackageError(`background: ${bg.image} is larger than 2 MB`);
  }
  for (const [name, path] of Object.entries(manifest.icons ?? {})) {
    const file = files[path];
    if (!file) throw new PackageError(`icons.${name}: ${path} is not in the package`);
    if (!isImagePath(path)) throw new PackageError(`icons.${name}: ${path} is not an image`);
    if (file.byteLength > MAX_ICON_BYTES) throw new PackageError(`icons.${name}: ${path} is larger than 64 KB`);
  }
}

export function loadTheme(bytes: Uint8Array): ThemePackage {
  return loadPackage(bytes, {
    manifestFile: THEME_MANIFEST_FILE,
    allowedExtensions: THEME_EXTENSIONS,
    validateManifest: validateThemeManifest,
    validateFiles: validateThemeFiles,
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
