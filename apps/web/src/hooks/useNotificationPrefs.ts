import { useState, useCallback } from "react";
import type { NotifyMode } from "../types";
import { getScoped, setScoped } from "../utils/accountScope";

type HubNotifyMode = Record<string, NotifyMode>;
type ChannelNotifyMode = Record<string, Record<string, NotifyMode>>;

// Keyed by hub/channel id, which only mean anything within the active
// account's own hub list — per-account.
const STORAGE_KEY_HUB = "wavvon.notifyMode.hub";
const STORAGE_KEY_CHANNEL = "wavvon.notifyMode.channel";
const STORAGE_KEY_PINNED = "wavvon.pinnedChannels";
const STORAGE_KEY_COLLAPSED = "wavvon.collapsedCategories";
const STORAGE_KEY_HIDE_SILENCED = "wavvon.hideSilenced";

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
  const [pinnedChannels, setPinnedChannelsState] = useState<Record<string, Record<string, boolean>>>(
    () => readJson(STORAGE_KEY_PINNED, {}),
  );
  const [collapsedCategories, setCollapsedCategoriesState] = useState<Record<string, Record<string, boolean>>>(
    () => readJson(STORAGE_KEY_COLLAPSED, {}),
  );
  const [hideSilenced, setHideSilencedState] = useState<boolean>(
    () => readJson(STORAGE_KEY_HIDE_SILENCED, false),
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

  function effectiveNotifyMode(hubId: string, channelId: string): NotifyMode {
    return channelNotifyMode[hubId]?.[channelId] ?? hubNotifyMode[hubId] ?? "all";
  }

  return {
    hubNotifyMode,
    channelNotifyMode,
    pinnedChannels,
    collapsedCategories,
    hideSilenced,
    setHubNotifyMode,
    setChannelNotifyMode,
    setPinnedChannels,
    setCollapsedCategories,
    toggleHideSilenced,
    effectiveNotifyMode,
  };
}
