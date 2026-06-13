import { useState, useCallback } from "react";

export function useHubConnection() {
  const [hubConnected, setHubConnected] = useState<Record<string, boolean>>({});
  const [reconnectingHubs, setReconnectingHubs] = useState<Record<string, boolean>>({});

  const handleStatusChange = useCallback(
    (hubId: string, hubName: string, connected: boolean, setAssertive: (msg: string) => void) => {
      setHubConnected((prev) => {
        const was = prev[hubId];
        if (connected && was === false) {
          setAssertive(`Reconnected to ${hubName}.`);
        } else if (!connected && was !== false) {
          setAssertive(`Disconnected from ${hubName}. Reconnecting…`);
          setReconnectingHubs((r) => ({ ...r, [hubId]: true }));
        }
        if (connected) {
          setReconnectingHubs((r) => { const n = { ...r }; delete n[hubId]; return n; });
        }
        return { ...prev, [hubId]: connected };
      });
    },
    [],
  );

  return {
    hubConnected,
    reconnectingHubs,
    handleStatusChange,
  };
}
