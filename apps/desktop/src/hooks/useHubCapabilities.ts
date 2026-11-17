import { useEffect, useState } from "react";
import type { HubLanding } from "@wavvon/core";
import type { HubThemeRef } from "@wavvon/ui";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

interface HubInfo {
  capabilities: string[];
  /** Undefined until read, and on a hub too old to send it. */
  landing?: HubLanding;
  /** The hub's default theme (`hub.theme`), while one is set. */
  theme?: HubThemeRef;
}

/** The active hub's `/info`. Empty until read, and on failure: every caller
 *  treats an unknown capability as absent, the safe reading. */
export function useHubInfo(hubUrl: string | null): HubInfo {
  const [info, setInfo] = useState<HubInfo>({ capabilities: [] });
  useEffect(() => {
    setInfo({ capabilities: [] });
    if (!hubUrl) return;
    let cancelled = false;
    void fetchWithTimeout(`${hubUrl.replace(/\/+$/, "")}/info`)
      .then((r) => r.json() as Promise<{ capabilities?: string[]; landing?: HubLanding; theme?: HubThemeRef }>)
      .then((i) => { if (!cancelled) setInfo({ capabilities: i.capabilities ?? [], landing: i.landing, theme: i.theme }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [hubUrl]);
  return info;
}

export function useHubCapabilities(hubUrl: string | null): string[] {
  return useHubInfo(hubUrl).capabilities;
}
