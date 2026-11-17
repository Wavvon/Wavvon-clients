import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useMuteExpiry, withoutDeadlines, type MuteDeadlines } from "@wavvon/ui";
import type { NotifyMode } from "../types";

export interface NotificationPrefs {
  hubNotifyMode: Record<string, NotifyMode>;
  channelNotifyMode: Record<string, Record<string, NotifyMode>>;
  muteDeadlines: MuteDeadlines;
  /** Picking a mode ends any timed mute at that level; muting for a time is
   *  `silent` plus `until`. */
  setHubMode: (hubId: string, mode: NotifyMode, until?: number) => void;
  setChannelMode: (hubId: string, channelId: string, mode: NotifyMode, until?: number) => void;
}

export function useNotificationPrefs(): NotificationPrefs {
  const [hubNotifyMode, setHubNotifyMode] = useState<Record<string, NotifyMode>>({});
  const [channelNotifyMode, setChannelNotifyMode] = useState<
    Record<string, Record<string, NotifyMode>>
  >({});
  const [muteDeadlines, setMuteDeadlines] = useState<MuteDeadlines>({ hubs: {}, channels: {} });
  // Nothing is written back until the file has been read, or the empty
  // initial state would overwrite it.
  const loaded = useRef(false);

  useEffect(() => {
    function normalizeMode(v: unknown): NotifyMode | undefined {
      if (v === true) return "silent";
      if (v === "silent" || v === "mentions" || v === "all") return v;
      return undefined;
    }
    invoke<{
      hubs?: Record<string, unknown>;
      channels?: Record<string, Record<string, unknown>>;
      mute_until?: MuteDeadlines;
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
        setMuteDeadlines({ hubs: s?.mute_until?.hubs ?? {}, channels: s?.mute_until?.channels ?? {} });
        loaded.current = true;
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    invoke("save_notification_mutes", {
      state: { hubs: hubNotifyMode, channels: channelNotifyMode, mute_until: muteDeadlines },
    }).catch(() => {});
  }, [hubNotifyMode, channelNotifyMode, muteDeadlines]);

  function setHubMode(hubId: string, mode: NotifyMode, until?: number) {
    setHubNotifyMode((prev) => {
      const next = { ...prev };
      if (mode === "all") delete next[hubId];
      else next[hubId] = mode;
      return next;
    });
    setMuteDeadlines((prev) => {
      const next = withoutDeadlines(prev, { hubs: [hubId], channels: [] });
      if (until !== undefined) next.hubs[hubId] = until;
      return next;
    });
  }

  function setChannelMode(hubId: string, channelId: string, mode: NotifyMode, until?: number) {
    setChannelNotifyMode((prev) => {
      const hubMap = { ...(prev[hubId] ?? {}) };
      if (mode === "all") delete hubMap[channelId];
      else hubMap[channelId] = mode;
      return { ...prev, [hubId]: hubMap };
    });
    setMuteDeadlines((prev) => {
      const next = withoutDeadlines(prev, { hubs: [], channels: [[hubId, channelId]] });
      if (until !== undefined) next.channels[hubId] = { ...(next.channels[hubId] ?? {}), [channelId]: until };
      return next;
    });
  }

  // A timed mute that ended goes back to the default mode.
  useMuteExpiry(muteDeadlines, (expired) => {
    for (const h of expired.hubs) setHubMode(h, "all");
    for (const [h, c] of expired.channels) setChannelMode(h, c, "all");
  });

  return { hubNotifyMode, channelNotifyMode, muteDeadlines, setHubMode, setChannelMode };
}
