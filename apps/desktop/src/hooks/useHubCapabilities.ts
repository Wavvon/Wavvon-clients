import { useEffect, useState } from "react";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

/** The active hub's `/info` capabilities. Empty until read, and on failure:
 *  every caller treats an unknown capability as absent, the safe reading. */
export function useHubCapabilities(hubUrl: string | null): string[] {
  const [caps, setCaps] = useState<string[]>([]);
  useEffect(() => {
    setCaps([]);
    if (!hubUrl) return;
    let cancelled = false;
    void fetchWithTimeout(`${hubUrl.replace(/\/+$/, "")}/info`)
      .then((r) => r.json() as Promise<{ capabilities?: string[] }>)
      .then((info) => { if (!cancelled) setCaps(info.capabilities ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [hubUrl]);
  return caps;
}
