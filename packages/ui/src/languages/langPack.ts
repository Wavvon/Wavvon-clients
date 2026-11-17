import { registerLanguagePack, unregisterLanguagePack } from "@wavvon/i18n";
import { buildPackage, loadPackage, type LoadedPackage } from "../themes/packageFormat";
import {
  base64ToBytes,
  bytesToBase64,
  createIdbPackageStore,
  newPackageId,
  type PackageStore,
  type StoredPackage,
} from "../themes/packageStore";

// A `.wavvonlang` package (docs wiki language-packs.md §1): a zip holding
// only lang.json. The envelope is checked here; which strings are taken from
// it (locked keys, ICU, placeholders) is @wavvon/i18n's sanitizePackStrings.

export const LANG_MANIFEST_FILE = "lang.json";
export const MAX_LANG_BYTES = 512 * 1024;

export interface LangManifest {
  format: "wavvon.lang";
  version: 1;
  /** BCP-47 tag, canonicalized. */
  code: string;
  name: string;
  author_pubkey?: string;
  description?: string;
  client_version?: string;
  /** Flat, like the client catalogues: key to ICU message. */
  strings: Record<string, string>;
}

export type LangPackage = LoadedPackage<LangManifest>;
export type StoredLangPack = StoredPackage<LangManifest>;

export function validateLangManifest(raw: unknown): LangManifest {
  if (typeof raw !== "object" || raw === null) throw new Error("lang.json is not an object");
  const s = raw as Record<string, unknown>;
  if (s.format !== "wavvon.lang") throw new Error("Invalid format field");
  if (s.version !== 1) throw new Error("Unsupported version");
  let code: string;
  try {
    if (typeof s.code !== "string" || s.code.length > 35) throw new Error();
    code = Intl.getCanonicalLocales(s.code)[0];
  } catch {
    throw new Error("Invalid code (must be a BCP-47 language tag)");
  }
  if (typeof s.name !== "string" || s.name.trim() === "" || s.name.length > 48) {
    throw new Error("Invalid name (must be 1-48 characters)");
  }
  const st = s.strings;
  if (typeof st !== "object" || st === null || Array.isArray(st)) throw new Error("Missing strings block");
  for (const [key, value] of Object.entries(st)) {
    if (typeof value !== "string") throw new Error(`strings.${key}: expected text`);
  }
  return {
    format: "wavvon.lang",
    version: 1,
    code,
    name: s.name.trim(),
    ...(typeof s.author_pubkey === "string" ? { author_pubkey: s.author_pubkey } : {}),
    ...(typeof s.description === "string" ? { description: s.description.slice(0, 500) } : {}),
    ...(typeof s.client_version === "string" ? { client_version: s.client_version.slice(0, 32) } : {}),
    strings: st as Record<string, string>,
  };
}

/** Throws PackageError naming the broken rule. */
export function loadLangPack(bytes: Uint8Array): LangPackage {
  return loadPackage(bytes, {
    manifestFile: LANG_MANIFEST_FILE,
    allowedExtensions: [],
    maxManifestBytes: MAX_LANG_BYTES,
    validateManifest: validateLangManifest,
  });
}

export function exportLangPack(pkg: LangPackage): Uint8Array {
  return buildPackage(LANG_MANIFEST_FILE, pkg.manifest, {});
}

export type LanguageStore = PackageStore<LangManifest>;

export const deviceLanguageStore: LanguageStore = createIdbPackageStore<LangManifest>("wavvon-languages");

export function registerLangPack(pkg: StoredLangPack, source: "user" | "hub" = "user") {
  return registerLanguagePack(pkg.id, pkg.manifest.code, pkg.manifest.name, pkg.manifest.strings, source);
}

/** Before initI18n, so a stored choice of a pack resolves on the first paint. */
export async function registerInstalledLanguages(store: LanguageStore = deviceLanguageStore): Promise<void> {
  for (const pkg of await store.list().catch(() => [])) registerLangPack(pkg);
}

export async function installLangPack(bytes: Uint8Array, store: LanguageStore = deviceLanguageStore) {
  const stored = { id: newPackageId(), ...loadLangPack(bytes) };
  await store.put(stored);
  return registerLangPack(stored);
}

export async function removeLangPack(id: string, store: LanguageStore = deviceLanguageStore): Promise<void> {
  await store.remove(id);
  unregisterLanguagePack(id);
}

/** One installed language pack inside a full backup: the package itself, base64. */
export interface ArchiveLanguage {
  name: string;
  package_b64: string;
}

export interface RestoredLanguage extends ArchiveLanguage {
  id: string;
}

export async function languagesForArchive(store: LanguageStore = deviceLanguageStore): Promise<ArchiveLanguage[]> {
  return (await store.list()).map((p) => ({ name: p.manifest.name, package_b64: bytesToBase64(exportLangPack(p)) }));
}

/** Entries that no longer validate are skipped: a backup must still restore
 *  everything else. */
export async function restoreLanguages(
  languages: RestoredLanguage[],
  store: LanguageStore = deviceLanguageStore,
): Promise<number> {
  let written = 0;
  for (const l of languages) {
    try {
      const pkg = { id: l.id || newPackageId(), ...loadLangPack(base64ToBytes(l.package_b64)) };
      await store.put(pkg);
      registerLangPack(pkg);
      written++;
    } catch {
      // skipped
    }
  }
  return written;
}
