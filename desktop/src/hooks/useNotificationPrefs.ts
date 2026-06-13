import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { NotifyMode } from "../types";

export interface NotificationPrefs {
  hubNotifyMode: Record<string, NotifyMode>;
  channelNotifyMode: Record<string, Record<string, NotifyMode>>;
  setHubMode: (hubId: string, mode: NotifyMode) => void;
  setChannelMode: (hubId: string, channelId: string, mode: NotifyMode) => void;
}

export function useNotificationPrefs(): NotificationPrefs {
  const [hubNotifyMode, setHubNotifyMode] = useState<Record<string, NotifyMode>>({});
  const [channelNotifyMode, setChannelNotifyMode] = useState<
    Record<string, Record<string, NotifyMode>>
  >({});

  useEffect(() => {
    function normalizeMode(v: unknown): NotifyMode | undefined {
      if (v === true) return "silent";
      if (v === "silent" || v === "mentions" || v === "all") return v;
      return undefined;
    }
    invoke<{
      hubs?: Record<string, unknown>;
      channels?: Record<string, Record<string, unknown>>;
    }>("load_notification_mutes")
      .then((s) => {
        const hubMap: Record<string, NotifyMode> = {};
        for (const [k, v] of Object.entries(s?.hubs ?? {})) {
          const m = normalizeMode(v);
          if (m && m !== "all") hubMap[k] = m;
        }
        const chanMap: Record<string, Record<string, NotifyMode>> = {};
        for (const [hubId, inner] of Object.entries(s?.channels ?? {})) {
          const sub: Record<string, NotifyMode> = {};
          for (const [chId, v] of Object.entries(inner ?? {})) {
            const m = normalizeMode(v);
            if (m && m !== "all") sub[chId] = m;
          }
          if (Object.keys(sub).length > 0) chanMap[hubId] = sub;
        }
        setHubNotifyMode(hubMap);
        setChannelNotifyMode(chanMap);
      })
      .catch(console.error);
  }, []);

  function persist(
    hubs: Record<string, NotifyMode>,
    channels: Record<string, Record<string, NotifyMode>>,
  ) {
    invoke("save_notification_mutes", { state: { hubs, channels } }).catch(() => {});
  }

  function setHubMode(hubId: string, mode: NotifyMode) {
    setHubNotifyMode((prev) => {
      const next = { ...prev };
      if (mode === "all") delete next[hubId];
      else next[hubId] = mode;
      persist(next, channelNotifyMode);
      return next;
    });
  }

  function setChannelMode(hubId: string, channelId: string, mode: NotifyMode) {
    setChannelNotifyMode((prev) => {
      const hubMap = { ...(prev[hubId] ?? {}) };
      if (mode === "all") delete hubMap[channelId];
      else hubMap[channelId] = mode;
      const next = { ...prev, [hubId]: hubMap };
      persist(hubNotifyMode, next);
      return next;
    });
  }

  return { hubNotifyMode, channelNotifyMode, setHubMode, setChannelMode };
}
