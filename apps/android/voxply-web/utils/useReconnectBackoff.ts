import { useState, useRef } from "react";

export interface ReconnectBackoff {
  reconnectingHubs: Record<string, boolean>;
  scheduleReconnect(hubId: string): void;
  clearReconnectTimer(hubId: string): void;
  setReconnecting(hubId: string, value: boolean): void;
  resetAttempts(hubId: string): void;
  onReconnected(hubId: string): void;
  onHubRemoved(hubId: string): void;
  cancelAll(): void;
}

export function useReconnectBackoff(
  onAttempt: (hubId: string) => Promise<void>,
): ReconnectBackoff {
  const timers = useRef<Record<string, number>>({});
  const attempts = useRef<Record<string, number>>({});
  const [reconnectingHubs, setReconnectingHubs] = useState<Record<string, boolean>>({});

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
