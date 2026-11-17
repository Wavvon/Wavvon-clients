import { useEffect } from "react";
import { loadHubTheme, type HubTheme } from "@wavvon/ui";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { useHubInfo } from "./useHubCapabilities";

/** Fetch the open hub's default theme (`hub.theme`) and hand it to the theme
 *  controller, which shows it only when the user opted into hub themes and
 *  has no theme of their own. Null when the hub has none or it fails to load. */
export function useActiveHubTheme(hubUrl: string | null, setHubTheme: (pkg: HubTheme | null) => void): void {
  const { capabilities, theme } = useHubInfo(hubUrl);
  const sha = capabilities.includes("hub.theme") ? theme?.sha256 : undefined;
  useEffect(() => {
    if (!hubUrl || !sha) {
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
