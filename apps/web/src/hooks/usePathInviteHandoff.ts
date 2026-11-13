import { useEffect, useRef } from "react";
import { inviteCodeFromPath } from "@wavvon/core";
import { getActiveHubId, redeemInvite } from "@platform";
import { MULTI_HUB } from "../constants";
import { handoffTargetUrl } from "../utils/handoffTarget";

/** An invite link is `https://hub.example/join/<code>`, and the hub serves
 *  this client there. Pick the code out of our own address and open the
 *  add-hub flow prefilled, so clicking the link a friend sent lands on the
 *  hub preview instead of an empty app. Deliberately not an automatic join:
 *  a link should not silently change someone's hub list.
 *
 *  Runs once the identity exists — a first-time visitor has onboarding to do
 *  first, and the code is held until then. The path is cleared only when the
 *  invite is actually applied, so reloading mid-onboarding still honours the
 *  link rather than losing it. */
export function usePathInviteHandoff({
  publicKey, hubsRestored, handleHubUrlInput, setShowAddHub, loadHubData, showHubError, setHomeHubUrl,
}: {
  publicKey: string | null;
  hubsRestored: boolean;
  handleHubUrlInput: (url: string) => void;
  setShowAddHub: (show: boolean) => void;
  loadHubData: () => Promise<void>;
  showHubError: (msg: string) => void;
  setHomeHubUrl: (url: string) => void;
}) {
  const pathInviteRef = useRef<string | null>(null);
  const pathInviteHandledRef = useRef(false);
  if (pathInviteRef.current === null) {
    pathInviteRef.current = inviteCodeFromPath(window.location.pathname) ?? "";
  }

  // `?hub=&code=` — a hub build sending someone here to join it with their
  // real identity (USER_CLIENT_URL). Only ever a hub URL and an invite code:
  // both are public, both are visible in the address bar, and the add-hub
  // modal is where the user confirms. A seed never arrives this way.
  const handoffRef = useRef<{ hub: string; code: string } | null | undefined>(undefined);
  if (handoffRef.current === undefined) {
    const params = new URLSearchParams(window.location.search);
    const hub = params.get("hub")?.trim() ?? "";
    handoffRef.current = hub ? { hub, code: params.get("code")?.trim() ?? "" } : null;
  }
  useEffect(() => {
    const code = pathInviteRef.current;
    const handoff = handoffRef.current;
    if ((!code && !handoff) || pathInviteHandledRef.current || !publicKey) return;
    if (!MULTI_HUB) {
      // Hub build: no add-hub modal to open, and which path is right depends
      // on whether we already have a session here — so wait for the restore
      // to answer rather than racing it.
      if (!hubsRestored) return;
      // A `?hub=` handoff is meaningless here — the hub build sends those, it
      // cannot receive one, because it has no second hub to add.
      if (!code) return;
      pathInviteHandledRef.current = true;
      window.history.replaceState({}, "", "/");
      if (getActiveHubId()) {
        // Already a member: re-authenticating is the registration path and
        // would not apply the invite's role grant. This route is the one
        // that does.
        void redeemInvite(code)
          .then(() => loadHubData())
          .catch((e: unknown) => showHubError(e instanceof Error ? e.message : String(e)));
      } else {
        // No session: the welcome screen joins the hub serving this page, and
        // parseHubInput lifts the code out of whatever URL it is handed — so
        // handing it the invite link is the whole flow.
        setHomeHubUrl(`${window.location.origin}/join/${code}`);
      }
      return;
    }
    pathInviteHandledRef.current = true;
    window.history.replaceState({}, "", "/");
    // Both sources end up as an invite URL because parseHubInput already
    // knows how to take a code out of one — one shape to handle, not two.
    const target = handoff
      ? handoffTargetUrl(handoff.hub, handoff.code)
      : `${window.location.origin}/join/${code}`;
    handleHubUrlInput(target);
    setShowAddHub(true);
  }, [publicKey, hubsRestored]);
}
