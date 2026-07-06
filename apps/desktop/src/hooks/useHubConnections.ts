import { useState, type Dispatch, type SetStateAction } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useReconnectBackoff } from "@wavvon/core";

export interface HubConnections {
  hubConnected: Record<string, boolean>;
  reconnectingHubs: Record<string, boolean>;
  setHubConnected: Dispatch<SetStateAction<Record<string, boolean>>>;
  scheduleReconnect: (hubId: string) => void;
  clearReconnectTimer: (hubId: string) => void;
  setReconnecting: (hubId: string, value: boolean) => void;
  resetAttempts: (hubId: string) => void;
  onHubReconnected: (hubId: string) => void;
  onHubRemoved: (hubId: string) => void;
  cancelAllReconnectTimers: () => void;
}

export function useHubConnections(): HubConnections {
  const [hubConnected, setHubConnected] = useState<Record<string, boolean>>({});

  const {
    reconnectingHubs,
    scheduleReconnect,
    clearReconnectTimer,
    setReconnecting,
    resetAttempts,
    onReconnected: onHubReconnected,
    onHubRemoved,
    cancelAll: cancelAllReconnectTimers,
  } = useReconnectBackoff(async (hubId) => {
    await invoke("reconnect_hub", { hubId });
  });

  return {
    hubConnected,
    reconnectingHubs,
    setHubConnected,
    scheduleReconnect,
    clearReconnectTimer,
    setReconnecting,
    resetAttempts,
    onHubReconnected,
    onHubRemoved,
    cancelAllReconnectTimers,
  };
}
