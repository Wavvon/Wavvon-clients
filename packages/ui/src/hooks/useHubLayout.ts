import { useCallback, useEffect, useState } from "react";
import { type HubLayout, parseLayout, pruneLayout } from "../utils/hubLayout";

/** The member's tab layout, read once, saved on every change, and pruned of
 *  hubs they no longer have. Storage is the app's: it decides where and
 *  whether the value follows the account. */
export function useHubLayout(load: () => string | null, save: (raw: string) => void, hubIds: string[]) {
  const [layout, setLayout] = useState<HubLayout>(() => {
    try { return parseLayout(load()); } catch { return parseLayout(null); }
  });

  const update = useCallback((next: HubLayout) => {
    setLayout(next);
    try { save(JSON.stringify(next)); } catch { /* not remembered */ }
  }, [save]);

  const key = hubIds.join(",");
  useEffect(() => {
    // An empty list is a hub list not loaded yet, not a member with no hubs.
    if (hubIds.length === 0) return;
    const pruned = pruneLayout(layout, hubIds);
    if (pruned !== layout) update(pruned);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [layout, update] as const;
}
