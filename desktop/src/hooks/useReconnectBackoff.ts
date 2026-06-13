import { useState, useRef } from "react";

export interface ReconnectBackoff {
  reconnectingHubs: Record<string, boolean>;
  scheduleReconnect(hubId: string): void;
  clearReconnectTimer(hubId: string): void;
  /** Directly flip the reconnecting flag — used by manual reconnect logic. */
  setReconnecting(hubId: string, value: boolean): void;
  /** Reset the attempt counter to 0 — call before a manual connect attempt. */
  resetAttempts(hubId: string): void;
  /** Call when a hub's WS connection is confirmed up: cancels the timer,
   *  resets the attempt counter, and clears the reconnecting flag. */
  onReconnected(hubId: string): void;
  /** Call when the user leaves a hub: cancels the timer and deletes the
   *  attempt entry so it doesn't linger in the refs. */
  onHubRemoved(hubId: string): void;
  /** Cancel all pending timers — call in the effect cleanup on unmount. */
  cancelAll(): void;
}

/**
 * Exponential-backoff reconnect mechanism (1s, 2s, 4s, …, capped at 30s).
 * `onAttempt` is called on each timer tick; it should invoke the reconnect
 * command. On failure the hook schedules the next retry automatically.
 */
export function useReconnectBackoff(
  onAttempt: (hubId: string) => Promise<void>,
): ReconnectBackoff {
  const timers = useRef<Record<string, number>>({});
  const attempts = useRef<Record<string, number>>({});
  const [reconnectingHubs, setReconnectingHubs] = useState<Record<string, boolean>>({});

  // Keep onAttempt stable across renders so timer callbacks always see the
  // latest version without needing to be re-registered.
  const onAttemptRef = useRef(onAttempt);
  onAttemptRef.current = onAttempt;

  function clearReconnectTimer(hubId: string) {
    const id = timers.current[hubId];
    if (id !== undefined) {
      clearTimeout(id);
      delete timers.current[hubId];
    }
  }

  function scheduleReconnect(hubId: string) {
    clearReconnectTimer(hubId);
    const attempt = attempts.current[hubId] ?? 0;
    const delayMs = Math.min(1000 * 2 ** attempt, 30_000);
    setReconnectingHubs((prev) => ({ ...prev, [hubId]: true }));
    timers.current[hubId] = window.setTimeout(async () => {
      delete timers.current[hubId];
      attempts.current[hubId] = attempt + 1;
      try {
        await onAttemptRef.current(hubId);
        // Success: hub-ws-status event will call onReconnected.
      } catch {
        scheduleReconnect(hubId);
      }
    }, delayMs);
  }

  function setReconnecting(hubId: string, value: boolean) {
    setReconnectingHubs((prev) => {
      if (value) return { ...prev, [hubId]: true };
      if (!prev[hubId]) return prev;
      const { [hubId]: _, ...rest } = prev;
      return rest;
    });
  }

  function resetAttempts(hubId: string) {
    attempts.current[hubId] = 0;
  }

  function onReconnected(hubId: string) {
    clearReconnectTimer(hubId);
    attempts.current[hubId] = 0;
    setReconnectingHubs((prev) => {
      if (!prev[hubId]) return prev;
      const { [hubId]: _, ...rest } = prev;
      return rest;
    });
  }

  function onHubRemoved(hubId: string) {
    clearReconnectTimer(hubId);
    delete attempts.current[hubId];
  }

  function cancelAll() {
    Object.values(timers.current).forEach(clearTimeout);
    timers.current = {};
  }

  return {
    reconnectingHubs,
    scheduleReconnect,
    clearReconnectTimer,
    setReconnecting,
    resetAttempts,
    onReconnected,
    onHubRemoved,
    cancelAll,
  };
}
