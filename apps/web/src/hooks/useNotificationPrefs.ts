import { useState, useCallback } from "react";
import type { NotifyMode } from "../types";

type HubNotifyMode = Record<string, NotifyMode>;
type ChannelNotifyMode = Record<string, Record<string, NotifyMode>>;

const STORAGE_KEY_HUB = "wavvon.notifyMode.hub";
const STORAGE_KEY_CHANNEL = "wavvon.notifyMode.channel";
const STORAGE_KEY_PINNED = "wavvon.pinnedChannels";
const STORAGE_KEY_COLLAPSED = "wavvon.collapsedCategories";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
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

  function effectiveNotifyMode(hubId: string, channelId: string): NotifyMode {
    return channelNotifyMode[hubId]?.[channelId] ?? hubNotifyMode[hubId] ?? "all";
  }

  return {
    hubNotifyMode,
    channelNotifyMode,
    pinnedChannels,
    collapsedCategories,
    setHubNotifyMode,
    setChannelNotifyMode,
    setPinnedChannels,
    setCollapsedCategories,
    effectiveNotifyMode,
  };
}
