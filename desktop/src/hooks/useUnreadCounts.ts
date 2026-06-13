import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface UnreadCounts {
  unreadByChannel: Record<string, Record<string, boolean>>;
  unreadByHub: Record<string, number>;
  bumpUnread: (hubId: string, channelId: string) => void;
  clearUnread: (hubId: string, channelId: string) => void;
  clearHubUnread: (hubId: string) => void;
}

export function useUnreadCounts(): UnreadCounts {
  const [unreadByChannel, setUnreadByChannel] = useState<
    Record<string, Record<string, boolean>>
  >({});

  useEffect(() => {
    invoke<Record<string, Record<string, boolean>>>("load_unread_state")
      .then((s) => setUnreadByChannel(s ?? {}))
      .catch(console.error);
  }, []);

  const unreadByHub: Record<string, number> = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [hub, m] of Object.entries(unreadByChannel)) {
      out[hub] = Object.keys(m).length;
    }
    return out;
  }, [unreadByChannel]);

  useEffect(() => {
    const total = Object.values(unreadByHub).reduce((n, v) => n + v, 0);
    invoke("set_tray_unread", { count: total }).catch(() => {});
    document.title = total > 0 ? `(${total > 99 ? "99+" : total}) Voxply` : "Voxply";
  }, [unreadByHub]);

  function bumpUnread(hubId: string, channelId: string) {
    setUnreadByChannel((prev) => {
      const hubMap = prev[hubId] ?? {};
      if (hubMap[channelId]) return prev;
      const next = {
        ...prev,
        [hubId]: { ...hubMap, [channelId]: true as boolean },
      };
      invoke("save_unread_state", { state: next }).catch(() => {});
      return next;
    });
  }

  function clearUnread(hubId: string, channelId: string) {
    setUnreadByChannel((prev) => {
      const hubMap = prev[hubId];
      if (!hubMap || !hubMap[channelId]) return prev;
      const { [channelId]: _, ...rest } = hubMap;
      const next = { ...prev, [hubId]: rest };
      invoke("save_unread_state", { state: next }).catch(() => {});
      return next;
    });
  }

  function clearHubUnread(hubId: string) {
    setUnreadByChannel((prev) => {
      if (!prev[hubId] || Object.keys(prev[hubId]).length === 0) return prev;
      const next = { ...prev, [hubId]: {} };
      invoke("save_unread_state", { state: next }).catch(() => {});
      return next;
    });
  }

  return { unreadByChannel, unreadByHub, bumpUnread, clearUnread, clearHubUnread };
}
