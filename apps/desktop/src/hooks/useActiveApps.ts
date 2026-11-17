import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { appSessionKey, noteAppJoin, takeAppJoin } from "@wavvon/core";
import type { AppLaunchEvent, AppOpenEvent, AppCloseEvent } from "../types";

/** Bot mini-app launch cards for the selected channel, and the join/open/close
 *  handlers the websocket layer calls. */
export function useActiveApps(activeHubId: string | null) {
  const [activeApps, setActiveApps] = useState<Map<string, AppLaunchEvent>>(new Map());

  function sendAppJoin(appId: string, channelId: string) {
    if (!activeHubId) return;
    noteAppJoin(appId, channelId);
    invoke("send_hub_ws_raw", {
      payload: JSON.stringify({ type: "app_join", app_id: appId, channel_id: channelId }),
    }).catch(() => {});
  }

  const onBotAppLaunch = (ev: AppLaunchEvent) => {
    setActiveApps((prev) => new Map(prev).set(appSessionKey(ev.app_id, ev.channel_id), ev));
  };

  const onBotAppOpen = (ev: AppOpenEvent, hubUrl: string) => {
    if (!takeAppJoin(ev.app_id, ev.channel_id)) return;
    const label = `mini-app-${appSessionKey(ev.app_id, ev.channel_id)}`;
    invoke("open_mini_app", {
      label,
      url: ev.mini_app_url,
      hubUrl,
      token: ev.session_token,
      channelId: ev.channel_id,
      appId: ev.app_id,
      requiresCamera: ev.requires_camera,
    }).catch(() => {});
  };

  const onBotAppClose = (ev: AppCloseEvent) => {
    setActiveApps((prev) => {
      const next = new Map(prev);
      next.delete(appSessionKey(ev.app_id, ev.channel_id));
      return next;
    });
    invoke("close_mini_app", { label: `mini-app-${appSessionKey(ev.app_id, ev.channel_id)}` }).catch(() => {});
  };

  return { activeApps, sendAppJoin, onBotAppLaunch, onBotAppOpen, onBotAppClose };
}
