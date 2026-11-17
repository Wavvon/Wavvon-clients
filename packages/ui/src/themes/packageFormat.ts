import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

// The zip container shared by every Wavvon package type (themes today,
// language packs): one manifest file at the root plus the files it
// names. Type-specific rules plug in through PackageSpec.

export class PackageError extends Error {}

export const MAX_ZIP_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_SOUND_BYTES = 256 * 1024;
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_ENTRIES = 200;

const IMAGE_EXT = ["png", "webp", "jpg", "jpeg", "svg"];
const SOUND_EXT = ["ogg", "mp3", "wav"];

export const THEME_EXTENSIONS = [...IMAGE_EXT, ...SOUND_EXT];

export type PackageFiles = Record<string, Uint8Array>;

export interface LoadedPackage<M> {
  manifest: M;
  files: PackageFiles;
}

export interface PackageSpec<M> {
  /** Root file holding the manifest, e.g. "theme.json". */
  manifestFile: string;
  /** Extensions allowed for every other file; anything else rejects the package. */
  allowedExtensions: string[];
  /** Cap on the unzipped manifest; defaults to 256 KB. */
  maxManifestBytes?: number;
  validateManifest: (raw: unknown) => M;
  /** Checks the files the manifest names; throw PackageError to reject. */
  validateFiles?: (manifest: M, files: PackageFiles) => void;
}

export function extensionOf(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot < 0 ? "" : path.slice(dot + 1).toLowerCase();
}

export function isImagePath(path: string): boolean {
  return IMAGE_EXT.includes(extensionOf(path));
}

export function isSoundPath(path: string): boolean {
  return SOUND_EXT.includes(extensionOf(path));
}

export function checkRelativePath(path: string): void {
  if (
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes(":") ||
    path.split("/").some((seg) => seg === ".." || seg === "")
  ) {
    throw new PackageError(`Path "${path}" must be relative, with no "..", no absolute path`);
  }
}

export function loadPackage<M>(bytes: Uint8Array, spec: PackageSpec<M>): LoadedPackage<M> {
  if (bytes.byteLength > MAX_ZIP_BYTES) throw new PackageError("Package is larger than 8 MB");
  let violation: string | null = null;
  let entries = 0;
  let raw: PackageFiles;
  try {
    raw = unzipSync(bytes, {
      // Runs before inflation, so an oversized entry is never expanded.
      filter: (f) => {
        if (violation) return false;
        if (f.name.endsWith("/")) return false;
        if (++entries > MAX_ENTRIES) {
          violation = `Package has more than ${MAX_ENTRIES} files`;
          return false;
        }
        try {
          checkRelativePath(f.name);
        } catch (e) {
          violation = (e as Error).message;
          return false;
        }
        const isManifest = f.name === spec.manifestFile;
        if (!isManifest && !spec.allowedExtensions.includes(extensionOf(f.name))) {
          violation = `File "${f.name}" has a type that is not allowed in a package`;
          return false;
        }
        const limit = isManifest ? (spec.maxManifestBytes ?? MAX_MANIFEST_BYTES) : isSoundPath(f.name) ? MAX_SOUND_BYTES : MAX_IMAGE_BYTES;
        if (f.originalSize > limit) {
          violation = `File "${f.name}" is larger than ${Math.round(limit / 1024)} KB`;
          return false;
        }
        return true;
      },
    });
  } catch {
    throw new PackageError("Not a valid zip file");
  }
  if (violation) throw new PackageError(violation);

  const manifestBytes = raw[spec.manifestFile];
  if (!manifestBytes) throw new PackageError(`Missing ${spec.manifestFile}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(manifestBytes));
  } catch {
    throw new PackageError(`${spec.manifestFile} is not valid JSON`);
  }
  let manifest: M;
  try {
    manifest = spec.validateManifest(parsed);
  } catch (e) {
    throw e instanceof PackageError ? e : new PackageError((e as Error).message);
  }
  const files: PackageFiles = { ...raw };
  delete files[spec.manifestFile];
  spec.validateFiles?.(manifest, files);
  return { manifest, files };
}

export function buildPackage(manifestFile: string, manifest: unknown, files: PackageFiles): Uint8Array {
  return zipSync({ ...files, [manifestFile]: strToU8(JSON.stringify(manifest, null, 2)) });
}
