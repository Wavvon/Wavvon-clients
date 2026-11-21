import { contrastWarnings } from "./contrast";
import { MAX_ZIP_BYTES } from "./packageFormat";
import type { StoredPackage } from "./packageStore";
import { readBaseToken, type Scheme, type ThemeManifest } from "./theme";

// The contract this client builds against (themes.md section 5), served by
// GET {discovery}/api/themes?q=&page= as { themes: ThemeListing[], total }.
// The directory lists packages and never hosts them.
export interface ThemeListing {
  id: string;
  author_pubkey: string;
  name: string;
  description?: string;
  /** The theme.json metadata; the gallery reads `colors` from it. */
  metadata: { colors?: { dark?: Record<string, string>; light?: Record<string, string> } };
  preview_url?: string;
  download_url: string;
  sha256: string;
  listed_at: number;
}

export type InstalledTheme = StoredPackage<ThemeManifest>;

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Download a listing's package and check it against the listed hash. */
export async function downloadListing(
  listing: ThemeListing,
  fetchWithTimeout: (url: string) => Promise<Response>,
): Promise<Uint8Array> {
  const res = await fetchWithTimeout(listing.download_url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_ZIP_BYTES) throw new Error("Package is larger than 8 MB");
  if ((await sha256Hex(bytes)).toLowerCase() !== listing.sha256.toLowerCase()) {
    throw new Error("The download does not match the hash in the listing");
  }
  return bytes;
}

/** The installed theme this listing is a newer publication of: same author key
 *  and name, different package. */
export function findInstalled(listing: ThemeListing, installed: InstalledTheme[]): InstalledTheme | undefined {
  return installed.find((t) => t.manifest.author_pubkey === listing.author_pubkey && t.manifest.name === listing.name);
}

export function isUpdate(listing: ThemeListing, installed: InstalledTheme[]): boolean {
  const have = findInstalled(listing, installed);
  return !!have && have.sha256?.toLowerCase() !== listing.sha256.toLowerCase();
}

/** True when every scheme the listing ships passes WCAG AA text contrast. */
export function listingPassesContrast(
  listing: ThemeListing,
  base: (token: string, scheme: Scheme) => string = readBaseToken,
): boolean {
  const schemes = (["dark", "light"] as Scheme[]).filter((s) => listing.metadata.colors?.[s]);
  if (schemes.length === 0) return false;
  return schemes.every(
    (s) => contrastWarnings((tok) => listing.metadata.colors?.[s]?.[tok] ?? base(tok, s)).length === 0,
  );
}
