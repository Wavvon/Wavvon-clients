import { useEffect, useRef, useState } from "react";
import { resolveStoredPresence, storedPresenceFor, storedCustomStatus, type PresenceStatus } from "../utils/presenceExpiry";

export type { PresenceStatus };

export interface PresenceStatusDeps {
  // Raw JSON string from wherever the app persists presence (scoped
  // localStorage on web, plain localStorage on desktop). May throw.
  loadRaw: () => string | null;
  persist: (p: { status: PresenceStatus; until?: number; custom?: string }) => void;
  // Push the status to every connected hub session (fire-and-forget; the
  // app owns the transport and its error handling).
  broadcast: (status: PresenceStatus, custom: string | null) => void;
  // Optimistic self-row update in the member roster: the hubs' member_status
  // broadcasts will confirm. Invisible shows the user offline (to everyone,
  // incl. their own roster view); the footer picker still reflects it.
  applyToRoster: (status: PresenceStatus, custom: string | null) => void;
}

// Own presence — shared across every hub this account is on, not per-hub;
// the client is the source of truth and broadcasts it to every session,
// re-applying on (re)connect. Distinct from hub mute (notify modes).
// Includes the "clear after" TTL: while connected, reverts to Online when
// it fires (presence is online-only anyway, so disconnecting also resets it).
export function usePresenceStatus({ loadRaw, persist, broadcast, applyToRoster }: PresenceStatusDeps) {
  // Restored with its deadline applied: an expired "away for an hour" comes
  // back online rather than staying away, and one with time left comes back
  // away with the remainder still counting.
  const restored = (() => {
    try {
      const raw = loadRaw();
      return { ...resolveStoredPresence(raw), custom: storedCustomStatus(raw) };
    } catch {
      return { status: "online" as PresenceStatus, revertAfterMs: null, custom: null };
    }
  })();
  const [myPresence, setMyPresence] = useState<{ status: PresenceStatus; custom: string | null }>({
    status: restored.status,
    custom: restored.custom,
  });
  // Mirrored for frozen WS handlers (reconnect re-push, notification gating).
  const myPresenceRef = useRef(myPresence);
  myPresenceRef.current = myPresence;
  const presenceTtlRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSetStatus(status: PresenceStatus, ttlMinutes: number | null) {
    if (presenceTtlRef.current) {
      clearTimeout(presenceTtlRef.current);
      presenceTtlRef.current = null;
    }
    const custom = myPresenceRef.current.custom;
    const record = { ...storedPresenceFor(status, ttlMinutes), ...(custom ? { custom } : {}) };
    setMyPresence({ status, custom });
    try { persist(record); } catch { /* storage unavailable */ }
    broadcast(status, custom);
    applyToRoster(status, custom);
    if (record.until) armRevert(record.until - Date.now());
  }

  /** Sets or clears (empty text) the custom status, keeping the presence. */
  function handleSetCustomStatus(text: string) {
    const custom = text.trim().slice(0, 128) || null;
    const { status } = myPresenceRef.current;
    setMyPresence({ status, custom });
    let stored: { status: PresenceStatus; until?: number } = { status };
    try { stored = JSON.parse(loadRaw() ?? "null") ?? stored; } catch { /* keep the status alone */ }
    try { persist({ status: stored.status, ...(stored.until ? { until: stored.until } : {}), ...(custom ? { custom } : {}) }); } catch { /* storage unavailable */ }
    broadcast(status, custom);
    applyToRoster(status, custom);
  }

  /** The in-memory half of the deadline: it makes the revert happen *while*
   *  the page is open. The stored `until` is what makes it happen at all —
   *  a timer is lost to a reload, and this used to be only the timer. */
  function armRevert(afterMs: number) {
    if (presenceTtlRef.current) clearTimeout(presenceTtlRef.current);
    presenceTtlRef.current = setTimeout(() => {
      presenceTtlRef.current = null;
      const custom = myPresenceRef.current.custom;
      setMyPresence({ status: "online", custom });
      try { persist({ status: "online", ...(custom ? { custom } : {}) }); } catch { /* storage unavailable */ }
      broadcast("online", custom);
      applyToRoster("online", custom);
    }, afterMs);
  }

  // Re-arm on mount for a deadline that outlived the last page. Nothing is
  // broadcast here: the restored status is already in `myPresenceRef`, and the
  // reconnect re-push that reads it is how hubs learn presence anyway — a send
  // from here would only race the socket coming up.
  const armed = useRef(false);
  useEffect(() => {
    if (armed.current) return;
    armed.current = true;
    if (restored.revertAfterMs !== null) armRevert(restored.revertAfterMs);
    return () => {
      if (presenceTtlRef.current) clearTimeout(presenceTtlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { myPresence, myPresenceRef, handleSetStatus, handleSetCustomStatus };
}
