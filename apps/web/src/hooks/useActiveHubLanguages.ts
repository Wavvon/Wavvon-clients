import { useEffect } from "react";
import { applyHubLanguages } from "@wavvon/ui";
import { fetchWithTimeout, getSession } from "@platform";
import { MULTI_HUB } from "../constants";

/** Offer the open hub's language packs (`hub.languages`) in the language
 *  list; the hub build also follows the hub's default while the user has not
 *  chosen a language. */
export function useActiveHubLanguages(activeHubId: string | null): void {
  const session = activeHubId ? getSession(activeHubId) : undefined;
  const hubUrl = session?.hub_url ?? null;
  const languages = session?.capabilities?.includes("hub.languages") ? session.languages ?? null : null;
  const key = JSON.stringify(languages);
  useEffect(() => {
    // No session yet: keep what was primed before mount.
    if (activeHubId && !hubUrl) return;
    void applyHubLanguages(hubUrl, JSON.parse(key), (url) => fetchWithTimeout(url), !MULTI_HUB);
  }, [activeHubId, hubUrl, key]);
}
