import { useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useHubLayout, parseLayout, type HubLayout } from "@wavvon/ui";

// The settings-map key web syncs the layout under (apps/web syncedSettings.ts).
const SYNCED_KEY = "wavvon.hubLayout";

/** The top bar's tab layout: per account in local storage, and synced through
 *  the prefs blob under the same key web uses, last writer wins. */
export function useSyncedHubLayout(accountId: string | null, hubIds: string[]) {
  const localKey = `${SYNCED_KEY}:${accountId ?? ""}`;
  const [layout, setLocal] = useHubLayout(
    () => localStorage.getItem(localKey),
    useCallback((raw: string) => localStorage.setItem(localKey, raw), [localKey]),
    hubIds,
  );

  useEffect(() => {
    let cancelled = false;
    invoke<string | null>("synced_setting_get", { key: SYNCED_KEY })
      .then((raw) => { if (!cancelled && raw !== null) setLocal(parseLayout(raw)); })
      .catch(() => { /* home hub unreachable: keep the local layout */ });
    return () => { cancelled = true; };
  }, [setLocal]);

  // Dropped, not flushed, on unmount: App remounts on an account switch, and
  // the shell would sign the push as the account switched to.
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (pushTimerRef.current) clearTimeout(pushTimerRef.current); }, []);

  // ponytail: only the member's own edits are pushed, never a prune, but an
  // edit still pushes a layout without the hubs this device lacks, so their
  // pins and folder places on the other client are lost. Merge with the
  // pulled layout if that bites.
  const setLayout = useCallback((next: HubLayout) => {
    setLocal(next);
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => {
      pushTimerRef.current = null;
      invoke("synced_setting_set", { key: SYNCED_KEY, value: JSON.stringify(next) })
        .catch(() => { /* kept locally; the next edit tries again */ });
    }, 1000);
  }, [setLocal]);

  return [layout, setLayout] as const;
}
