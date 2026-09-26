import { useCallback, useEffect, useRef, useState } from "react";

export interface TypingEntry {
  name: string;
  ts: number;
}

export type TypingMap = Record<string, TypingEntry>;

export interface TypingDeps {
  /** The channel and conversation a keystroke belongs to, read at send time
   *  rather than captured: the debounce fires up to 4s later, by which point
   *  the selection may have moved. */
  getChannelId: () => string | undefined;
  getConversationId: () => string | undefined;
  sendTyping: (channelId: string, typing: boolean) => void;
  sendDmTyping: (conversationId: string, typing: boolean) => void;
}

/** Entries are keyed by scope, not by person: one user typing in two channels
 *  is two entries, and switching channels cannot leave a stale one behind.
 *  Desktop keyed by bare pubkey and filtered by channel in its event handler,
 *  which showed whoever was typing when you left as typing where you arrived,
 *  until the sweep caught it. */
export function typingKey(scopeId: string, pubkey: string): string {
  return `${scopeId}:${pubkey}`;
}

/** The entries for one scope, with the scope prefix still on the key — which
 *  is what the row components already expect. */
export function typingForScope(map: TypingMap, scopeId: string | undefined): TypingMap {
  if (!scopeId) return {};
  const prefix = `${scopeId}:`;
  const out: TypingMap = {};
  for (const [k, v] of Object.entries(map)) {
    if (k.startsWith(prefix)) out[k] = v;
  }
  return out;
}

const STALE_AFTER_MS = 5000;
const SWEEP_EVERY_MS = 1000;
const RESEND_AFTER_MS = 3000;
const STOP_AFTER_MS = 4000;

function dropStale(prev: TypingMap, cutoff: number): TypingMap {
  let changed = false;
  const next: TypingMap = {};
  for (const [k, v] of Object.entries(prev)) {
    if (v.ts >= cutoff) next[k] = v;
    else changed = true;
  }
  return changed ? next : prev;
}

// Typing indicators for channels and DMs: who is typing where, and the
// debounced "still typing" / "stopped" pings we send. Converged from the two
// app copies, which had diverged in behaviour rather than only in transport —
// see typingKey above, and the sweep below.
export function useTypingIndicators({
  getChannelId,
  getConversationId,
  sendTyping,
  sendDmTyping,
}: TypingDeps) {
  const [typingByKey, setTypingByKey] = useState<TypingMap>({});
  const [dmTypingByKey, setDmTypingByKey] = useState<TypingMap>({});

  // One sweep for every entry, rather than web's per-entry setTimeout: a busy
  // channel scheduled a timer per keystroke-burst per person, all of them
  // holding a closure over the map.
  //
  // Only while there is something to sweep, which neither copy got right:
  // desktop ran the interval forever, waking an idle app once a second, and
  // web's per-entry timers meant an idle tab had none. Nobody is typing most
  // of the time.
  const idle =
    Object.keys(typingByKey).length === 0 && Object.keys(dmTypingByKey).length === 0;
  useEffect(() => {
    if (idle) return;
    const handle = setInterval(() => {
      const cutoff = Date.now() - STALE_AFTER_MS;
      setTypingByKey((prev) => dropStale(prev, cutoff));
      setDmTypingByKey((prev) => dropStale(prev, cutoff));
    }, SWEEP_EVERY_MS);
    return () => clearInterval(handle);
  }, [idle]);

  const setTyping = useCallback((scopeId: string, pubkey: string, name: string) => {
    setTypingByKey((prev) => ({ ...prev, [typingKey(scopeId, pubkey)]: { name, ts: Date.now() } }));
  }, []);

  const clearTyping = useCallback((scopeId: string, pubkey: string) => {
    setTypingByKey((prev) => {
      const key = typingKey(scopeId, pubkey);
      if (!prev[key]) return prev;
      const { [key]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const setDmTyping = useCallback((convId: string, pubkey: string, name: string) => {
    setDmTypingByKey((prev) => ({ ...prev, [typingKey(convId, pubkey)]: { name, ts: Date.now() } }));
  }, []);

  const clearDmTyping = useCallback((convId: string, pubkey: string) => {
    setDmTypingByKey((prev) => {
      const key = typingKey(convId, pubkey);
      if (!prev[key]) return prev;
      const { [key]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const clearAllTyping = useCallback(() => setTypingByKey({}), []);
  const clearAllDmTyping = useCallback(() => setDmTypingByKey({}), []);

  // Send-side debounce, one instance per axis. `lastSent` throttles the "still
  // typing" ping; `stop` sends the trailing "stopped" and resets the throttle
  // so the next keystroke pings immediately.
  const chanLastSent = useRef(0);
  const chanStop = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dmLastSent = useRef(0);
  const dmStop = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (chanStop.current) clearTimeout(chanStop.current);
      if (dmStop.current) clearTimeout(dmStop.current);
    },
    [],
  );

  const pingTyping = useCallback(() => {
    const id = getChannelId();
    if (!id) return;
    const now = Date.now();
    if (now - chanLastSent.current > RESEND_AFTER_MS) {
      chanLastSent.current = now;
      sendTyping(id, true);
    }
    if (chanStop.current) clearTimeout(chanStop.current);
    chanStop.current = setTimeout(() => {
      const current = getChannelId();
      if (current) sendTyping(current, false);
      chanStop.current = null;
      chanLastSent.current = 0;
    }, STOP_AFTER_MS);
  }, [getChannelId, sendTyping]);

  const pingDmTyping = useCallback(() => {
    const id = getConversationId();
    if (!id) return;
    const now = Date.now();
    if (now - dmLastSent.current > RESEND_AFTER_MS) {
      dmLastSent.current = now;
      sendDmTyping(id, true);
    }
    if (dmStop.current) clearTimeout(dmStop.current);
    dmStop.current = setTimeout(() => {
      const current = getConversationId();
      if (current) sendDmTyping(current, false);
      dmStop.current = null;
      dmLastSent.current = 0;
    }, STOP_AFTER_MS);
  }, [getConversationId, sendDmTyping]);

  return {
    typingByKey,
    dmTypingByKey,
    setTyping,
    clearTyping,
    setDmTyping,
    clearDmTyping,
    clearAllTyping,
    clearAllDmTyping,
    pingTyping,
    pingDmTyping,
  };
}
