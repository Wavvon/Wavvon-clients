import { useEffect } from "react";
import { applyHubLanguages } from "@wavvon/ui";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { useHubInfo } from "./useHubCapabilities";

/** Offer the open hub's language packs (`hub.languages`) in the language
 *  list while that hub is open. Desktop is multi-hub: the hub's default does
 *  not override the language. */
export function useActiveHubLanguages(hubUrl: string | null): void {
  const { capabilities, languages } = useHubInfo(hubUrl);
  const key = JSON.stringify(capabilities.includes("hub.languages") ? languages ?? null : null);
  useEffect(() => {
    void applyHubLanguages(hubUrl, JSON.parse(key), (url) => fetchWithTimeout(url), false);
  }, [hubUrl, key]);
}
