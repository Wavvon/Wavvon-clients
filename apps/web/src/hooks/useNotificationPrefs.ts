import { useState, useCallback } from "react";
import { useMuteExpiry, withoutDeadlines, type MuteDeadlines } from "@wavvon/ui";
import type { NotifyMode } from "../types";
import { getScoped, setScoped } from "../utils/accountScope";

type HubNotifyMode = Record<string, NotifyMode>;
type ChannelNotifyMode = Record<string, Record<string, NotifyMode>>;

// Keyed by hub/channel id, which only mean anything within the active
// account's own hub list — per-account.
const STORAGE_KEY_HUB = "wavvon.notifyMode.hub";
const STORAGE_KEY_CHANNEL = "wavvon.notifyMode.channel";
const STORAGE_KEY_MUTE_UNTIL = "wavvon.notifyMuteUntil";
const STORAGE_KEY_PINNED = "wavvon.pinnedChannels";
const STORAGE_KEY_COLLAPSED = "wavvon.collapsedCategories";
const STORAGE_KEY_HIDE_SILENCED = "wavvon.hideSilenced";
const STORAGE_KEY_HIDE_BIRTHDAYS = "wavvon.hideBirthdays";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = getScoped(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    setScoped(key, JSON.stringify(value));
  } catch {
    // storage unavailable
  }
}

export function useNotificationPrefs() {
  const [hubNotifyMode, setHubNotifyModeState] = useState<HubNotifyMode>(
    () => readJson<HubNotifyMode>(STORAGE_KEY_HUB, {}),
  );
  const [channelNotifyMode, setChannelNotifyModeState] = useState<ChannelNotifyMode>(
    () => readJson<ChannelNotifyMode>(STORAGE_KEY_CHANNEL, {}),
  );
  const [muteDeadlines, setMuteDeadlinesState] = useState<MuteDeadlines>(
    () => readJson<MuteDeadlines>(STORAGE_KEY_MUTE_UNTIL, { hubs: {}, channels: {} }),
  );
  const [pinnedChannels, setPinnedChannelsState] = useState<Record<string, Record<string, boolean>>>(
    () => readJson(STORAGE_KEY_PINNED, {}),
  );
  const [collapsedCategories, setCollapsedCategoriesState] = useState<Record<string, Record<string, boolean>>>(
    () => readJson(STORAGE_KEY_COLLAPSED, {}),
  );
  const [hideSilenced, setHideSilencedState] = useState<boolean>(
    () => readJson(STORAGE_KEY_HIDE_SILENCED, false),
  );
  // Viewer opt-out from the 🎂 birthday badge — the third of three
  // independent opt-ins (decisions.md). Device-local storage for now: the
  // hub-synced prefs blob (packages/core PrefsBlobContents.hide_birthdays)
  // only has a push/pull round trip on desktop today — see
  // docs/docs/client-parity.md.
  const [hideBirthdays, setHideBirthdaysState] = useState<boolean>(
    () => readJson(STORAGE_KEY_HIDE_BIRTHDAYS, false),
  );

  const setHubNotifyMode = useCallback((updater: (prev: HubNotifyMode) => HubNotifyMode) => {
    setHubNotifyModeState((prev) => {
      const next = updater(prev);
      writeJson(STORAGE_KEY_HUB, next);
      return next;
    });
  }, []);

  const setChannelNotifyMode = useCallback((updater: (prev: ChannelNotifyMode) => ChannelNotifyMode) => {
    setChannelNotifyModeState((prev) => {
      const next = updater(prev);
      writeJson(STORAGE_KEY_CHANNEL, next);
      return next;
    });
  }, []);

  const setMuteDeadlines = useCallback((updater: (prev: MuteDeadlines) => MuteDeadlines) => {
    setMuteDeadlinesState((prev) => {
      const next = updater(prev);
      writeJson(STORAGE_KEY_MUTE_UNTIL, next);
      return next;
    });
  }, []);

  // Picking a mode ends any timed mute at that level; muting for a time is
  // `silent` plus a deadline.
  const setHubMode = useCallback((hubId: string, mode: NotifyMode, until?: number) => {
    setHubNotifyMode((prev) => {
      const n = { ...prev };
      if (mode === "all") delete n[hubId]; else n[hubId] = mode;
      return n;
    });
    setMuteDeadlines((prev) => {
      const next = withoutDeadlines(prev, { hubs: [hubId], channels: [] });
      if (until !== undefined) next.hubs[hubId] = until;
      return next;
    });
  }, [setHubNotifyMode, setMuteDeadlines]);

  const setChannelMode = useCallback((hubId: string, channelId: string, mode: NotifyMode, until?: number) => {
    setChannelNotifyMode((prev) => {
      const hubMap = { ...(prev[hubId] ?? {}) };
      if (mode === "all") delete hubMap[channelId]; else hubMap[channelId] = mode;
      return { ...prev, [hubId]: hubMap };
    });
    setMuteDeadlines((prev) => {
      const next = withoutDeadlines(prev, { hubs: [], channels: [[hubId, channelId]] });
      if (until !== undefined) next.channels[hubId] = { ...(next.channels[hubId] ?? {}), [channelId]: until };
      return next;
    });
  }, [setChannelNotifyMode, setMuteDeadlines]);

  // A timed mute that ended goes back to the default mode.
  useMuteExpiry(muteDeadlines, (expired) => {
    for (const h of expired.hubs) setHubMode(h, "all");
    for (const [h, c] of expired.channels) setChannelMode(h, c, "all");
  });

  const setPinnedChannels = useCallback((updater: (prev: Record<string, Record<string, boolean>>) => Record<string, Record<string, boolean>>) => {
    setPinnedChannelsState((prev) => {
      const next = updater(prev);
      writeJson(STORAGE_KEY_PINNED, next);
      return next;
    });
  }, []);

  const setCollapsedCategories = useCallback((updater: (prev: Record<string, Record<string, boolean>>) => Record<string, Record<string, boolean>>) => {
    setCollapsedCategoriesState((prev) => {
      const next = updater(prev);
      writeJson(STORAGE_KEY_COLLAPSED, next);
      return next;
    });
  }, []);

  const toggleHideSilenced = useCallback(() => {
    setHideSilencedState((prev) => {
      const next = !prev;
      writeJson(STORAGE_KEY_HIDE_SILENCED, next);
      return next;
    });
  }, []);

  const toggleHideBirthdays = useCallback(() => {
    setHideBirthdaysState((prev) => {
      const next = !prev;
      writeJson(STORAGE_KEY_HIDE_BIRTHDAYS, next);
      return next;
    });
  }, []);

  function effectiveNotifyMode(hubId: string, channelId: string): NotifyMode {
    return channelNotifyMode[hubId]?.[channelId] ?? hubNotifyMode[hubId] ?? "all";
  }

  /** Deadline of the timed mute deciding this channel's mode, if any. */
  function muteUntil(hubId: string, channelId: string): number | undefined {
    if (effectiveNotifyMode(hubId, channelId) !== "silent") return undefined;
    return channelNotifyMode[hubId]?.[channelId]
      ? muteDeadlines.channels[hubId]?.[channelId]
      : muteDeadlines.hubs[hubId];
  }

  return {
    hubNotifyMode,
    channelNotifyMode,
    pinnedChannels,
    collapsedCategories,
    hideSilenced,
    hideBirthdays,
    setHubNotifyMode,
    setChannelNotifyMode,
    muteDeadlines,
    setHubMode,
    setChannelMode,
    muteUntil,
    setPinnedChannels,
    setCollapsedCategories,
    toggleHideSilenced,
    toggleHideBirthdays,
    effectiveNotifyMode,
  };
}
