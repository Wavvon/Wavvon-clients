import { hubThemeWanted, loadHubTheme, primeHubTheme, type HubThemeRef } from "@wavvon/ui";
import { fetchWithTimeout } from "@platform";
import { MULTI_HUB } from "../constants";

/** The hub build, before the app mounts: fetch the serving hub's theme and
 *  put it on the page, so the first paint is already themed. Bounded by short
 *  timeouts; on any failure the app mounts with the built-in theme and
 *  useActiveHubTheme tries again once the session is up. */
export async function primeServedHubTheme(): Promise<void> {
  if (MULTI_HUB || !hubThemeWanted(true)) return;
  try {
    const origin = window.location.origin;
    const info = (await (await fetchWithTimeout(`${origin}/info`, undefined, 2000)).json()) as {
      capabilities?: string[];
      theme?: HubThemeRef;
    };
    if (!info.capabilities?.includes("hub.theme") || !info.theme) return;
    primeHubTheme(await loadHubTheme(origin, info.theme.sha256, (url) => fetchWithTimeout(url, undefined, 3000)));
  } catch {
    // fall through to the built-in theme
  }
}
