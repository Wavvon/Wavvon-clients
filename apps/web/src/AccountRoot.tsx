import { useEffect, useState } from "react";
import App from "./App";
import { getActiveAccountId, setInPlaceSwitchHandler } from "@identity/index";
import { resetHubSessions } from "@platform";

// Account switching is a key-remount, not a page reload: changing App's
// `key` unmounts the outgoing account's whole tree (App's own unmount effect
// tears down its per-instance resources — voice/video/screen-share sessions)
// and mounts a fresh one, which resets every piece of React state by
// construction. Module-level singletons outside React (the hub WebSocket
// sessions in platform/session.ts) don't get that for free, so the handler
// below closes them out explicitly before the remount.
export default function AccountRoot() {
  const [activeAccountId, setActiveAccountIdState] = useState<string | null>(() => getActiveAccountId());
  const [pendingInitialView, setPendingInitialView] = useState<"settings-account" | undefined>(undefined);

  useEffect(() => {
    setInPlaceSwitchHandler(({ id, returnTo }) => {
      resetHubSessions();
      setPendingInitialView(returnTo);
      setActiveAccountIdState(id);
    });
    return () => setInPlaceSwitchHandler(null);
  }, []);

  return <App key={activeAccountId ?? "no-account"} initialView={pendingInitialView} />;
}
