import {
  hubThemeWanted,
  loadHubTheme,
  primeHubTheme,
  registerHubLanguages,
  type HubLanguagesInfo,
  type HubThemeRef,
} from "@wavvon/ui";
import { fetchWithTimeout } from "@platform";
import { MULTI_HUB } from "../constants";

interface ServedInfo {
  capabilities?: string[];
  theme?: HubThemeRef;
  languages?: HubLanguagesInfo;
}

// The hub build reads its own hub's /info once before mount, for both primes.
let served: Promise<ServedInfo | null> | null = null;
function servedInfo(): Promise<ServedInfo | null> {
  served ??= fetchWithTimeout(`${window.location.origin}/info`, undefined, 2000)
    .then((r) => r.json() as Promise<ServedInfo>)
    .catch(() => null);
  return served;
}

/** The hub build, before the app mounts: fetch the serving hub's theme and
 *  put it on the page, so the first paint is already themed. Bounded by short
 *  timeouts; on any failure the app mounts with the built-in theme and
 *  useActiveHubTheme tries again once the session is up. */
export async function primeServedHubTheme(): Promise<void> {
  if (MULTI_HUB || !hubThemeWanted(true)) return;
  try {
    const info = await servedInfo();
    if (!info?.capabilities?.includes("hub.theme") || !info.theme) return;
    primeHubTheme(await loadHubTheme(window.location.origin, info.theme.sha256, (url) => fetchWithTimeout(url, undefined, 3000)));
  } catch {
    // fall through to the built-in theme
  }
}

/** The hub build, before initI18n: register the serving hub's language packs
 *  and return its default language's id, so the first paint is already in it
 *  when the user has not chosen one. */
export async function primeServedHubLanguages(): Promise<string | null> {
  if (MULTI_HUB) return null;
  const info = await servedInfo();
  if (!info?.capabilities?.includes("hub.languages") || !info.languages) return null;
  return registerHubLanguages(window.location.origin, info.languages, (url) => fetchWithTimeout(url, undefined, 3000)).catch(() => null);
}
