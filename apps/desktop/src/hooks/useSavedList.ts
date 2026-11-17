import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSavedMessages } from "@wavvon/ui";

// The settings-map key web syncs the list under (apps/web syncedSettings.ts).
const SYNCED_KEY = "wavvon.savedMessages";

/** The personal Saved list: per account in local storage, and synced through
 *  the prefs blob under the key web uses, last writer wins. */
export function useSavedList(accountId: string | null) {
  const localKey = `${SYNCED_KEY}:${accountId ?? ""}`;
  const [raw, setRawState] = useState<string | null>(() => localStorage.getItem(localKey));
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    invoke<string | null>("synced_setting_get", { key: SYNCED_KEY })
      .then((remote) => {
        if (cancelled || remote === null) return;
        localStorage.setItem(localKey, remote);
        setRawState(remote);
      })
      .catch(() => { /* home hub unreachable: keep the local list */ });
    return () => { cancelled = true; };
  }, [localKey]);

  // Dropped, not flushed, on unmount: App remounts on an account switch.
  useEffect(() => () => { if (pushTimerRef.current) clearTimeout(pushTimerRef.current); }, []);

  const setRaw = useCallback((next: string) => {
    localStorage.setItem(localKey, next);
    setRawState(next);
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => {
      pushTimerRef.current = null;
      invoke("synced_setting_set", { key: SYNCED_KEY, value: next })
        .catch(() => { /* kept locally; the next edit tries again */ });
    }, 1000);
  }, [localKey]);

  const saved = useSavedMessages(raw, setRaw);

  // Any hub's delete, active or not, marks a saved copy as deleted.
  const markDeleted = saved.markDeleted;
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    listen<{ hub_id: string; message_id: string }>("chat-message-deleted", (e) =>
      markDeleted(e.payload.hub_id, e.payload.message_id),
    ).then((fn) => { if (cancelled) fn(); else unlisten = fn; });
    return () => { cancelled = true; unlisten?.(); };
  }, [markDeleted]);

  return saved;
}
