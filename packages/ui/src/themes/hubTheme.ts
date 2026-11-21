import { sha256Hex } from "./gallery";
import type { StoredPackage } from "./packageStore";
import { loadTheme, type ThemeManifest } from "./theme";

/** `theme` on a hub's `/info` (capability `hub.theme`), present while one is set. */
export interface HubThemeRef {
  sha256: string;
  has_preview: boolean;
}

export type HubTheme = StoredPackage<ThemeManifest>;

export function hubThemeUrl(hubUrl: string, sha256: string): string {
  return `${hubUrl.replace(/\/+$/, "")}/hub/theme/${sha256}`;
}

// One download per hash for the life of the page: switching back to a hub
// reuses it, and the URL is immutable so the browser cache covers reloads.
const loaded = new Map<string, Promise<HubTheme>>();

/** Fetch a hub's theme by its hash URL, check the hash and validate it like
 *  any other package. Rejects on any failure; the caller shows no theme then. */
export function loadHubTheme(
  hubUrl: string,
  sha256: string,
  fetchFn: (url: string) => Promise<Response>,
): Promise<HubTheme> {
  const url = hubThemeUrl(hubUrl, sha256);
  let p = loaded.get(url);
  if (!p) {
    p = (async () => {
      const res = await fetchFn(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if ((await sha256Hex(bytes)).toLowerCase() !== sha256.toLowerCase()) {
        throw new Error("The hub theme does not match its hash");
      }
      return { id: `hub:${sha256}`, sha256, ...loadTheme(bytes) };
    })();
    p.catch(() => loaded.delete(url));
    loaded.set(url, p);
  }
  return p;
}
