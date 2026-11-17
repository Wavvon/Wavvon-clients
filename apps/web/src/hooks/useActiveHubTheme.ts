import { useEffect } from "react";
import { loadHubTheme, type HubTheme } from "@wavvon/ui";
import { fetchWithTimeout, getSession } from "@platform";

/** Fetch the open hub's default theme (`hub.theme`) and hand it to the theme
 *  controller, which shows it only when the user has no theme of their own
 *  and has hub themes on. Null when the hub has none or it fails to load. */
export function useActiveHubTheme(activeHubId: string | null, setHubTheme: (pkg: HubTheme | null) => void): void {
  const session = activeHubId ? getSession(activeHubId) : undefined;
  const hubUrl = session?.hub_url;
  const sha = session?.capabilities?.includes("hub.theme") ? session.theme?.sha256 : undefined;
  useEffect(() => {
    // No session yet: keep what was primed before mount rather than flash.
    if (!hubUrl) return;
    if (!sha) {
      setHubTheme(null);
      return;
    }
    let cancelled = false;
    loadHubTheme(hubUrl, sha, (url) => fetchWithTimeout(url))
      .then((pkg) => { if (!cancelled) setHubTheme(pkg); })
      .catch(() => { if (!cancelled) setHubTheme(null); });
    return () => { cancelled = true; };
  }, [hubUrl, sha, setHubTheme]);
}
