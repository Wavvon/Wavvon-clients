import { useEffect, useRef, useState } from "react";
import { restorePersistedHubs, listHubs, getActiveHubId, loadSavedHubs, publishDhKey } from "@platform";
import { startPrefsSync } from "../utils/prefsSync";

type WsHandlers = Parameters<typeof restorePersistedHubs>[0];

// One reload per page load is enough to let pulled boot-time settings
// (language, theme) take hold; the flag lives in sessionStorage so a
// reload loop is impossible even if a pull somehow keeps reporting changes.
const PREFS_RELOAD_FLAG = "wavvon.prefsReloaded";

/** Hub restore on startup, once the identity is ready. Returns `hubsRestored`
 *  so the path-invite effect can tell "restored, and this is what we've got"
 *  apart from "not yet run". */
export function useHubRestore({
  ready, stableHandlers, setHubs, setActiveHubIdState, loadHubData, offerReinstalledHubs, setHomeHubUrl,
}: {
  ready: "checking" | "setup" | "ok";
  stableHandlers: WsHandlers;
  setHubs: (hubs: ReturnType<typeof listHubs>) => void;
  setActiveHubIdState: (id: string | null) => void;
  loadHubData: () => Promise<void>;
  offerReinstalledHubs: () => Promise<void>;
  setHomeHubUrl: (url: string) => void;
}) {
  const [hubsRestored, setHubsRestored] = useState(false);
  const prefsSyncRef = useRef<Awaited<ReturnType<typeof startPrefsSync>>>(null);

  useEffect(() => {
    if (ready !== "ok") return;
    let cancelled = false;
    async function restore() {
      const list = await restorePersistedHubs(stableHandlers);
      setHubs(list);
      void offerReinstalledHubs();
      const id = getActiveHubId();
      if (id) {
        setActiveHubIdState(id);
        await loadHubData();
        publishDhKey().catch(() => {});
      }
      // The path-invite effect needs "restored, and this is what we've
      // got" — hubs.length alone cannot tell that apart from "not yet run".
      setHubsRestored(true);
      const globalHomeHub = window.__WAVVON_HOME_HUB__;
      if (typeof globalHomeHub === "string" && globalHomeHub.trim() && loadSavedHubs().length === 0) {
        setHomeHubUrl(globalHomeHub.trim());
      }
      // Cross-device settings (docs/docs/home-hub.md "Prefs blob"). Started
      // here because it needs a hub to read and write through. Language and
      // theme are read once at boot, so a pull that actually changed
      // something only takes effect after a reload — done once per load, and
      // the steady state reports no change, so it cannot loop.
      // ponytail: a browser with no saved hub has nothing to sync through, so
      // this returns null and the first hub added in that session syncs
      // nothing — including the hub list it would have pulled back. It heals
      // on the next page load. Restart the sync on the 0->1 hub transition if
      // that first-run reload ever proves confusing.
      startPrefsSync(() => {
        if (!sessionStorage.getItem(PREFS_RELOAD_FLAG)) {
          sessionStorage.setItem(PREFS_RELOAD_FLAG, "1");
          window.location.reload();
        }
      })
        .then((handle) => {
          // An account switch can unmount before the pull resolves; without
          // this the poll would outlive the App that started it.
          if (cancelled) handle?.stop();
          else prefsSyncRef.current = handle;
        })
        .catch(() => { /* offline, or nothing published yet */ });
    }
    void restore();
    return () => {
      cancelled = true;
      prefsSyncRef.current?.stop();
      prefsSyncRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return hubsRestored;
}
