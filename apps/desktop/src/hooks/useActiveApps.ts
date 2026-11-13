import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { noteAppJoin, takeAppJoin } from "@wavvon/core";
import type { AppLaunchEvent, AppOpenEvent, AppCloseEvent } from "../types";

/** Bot mini-app launch cards for the selected channel, and the join/open/close
 *  handlers the websocket layer calls. */
export function useActiveApps(activeHubId: string | null) {
  const [activeApps, setActiveApps] = useState<Map<string, AppLaunchEvent>>(new Map());

  function sendAppJoin(appId: string, channelId: string) {
    if (!activeHubId) return;
    noteAppJoin(appId);
    invoke("send_hub_ws_raw", {
      payload: JSON.stringify({ type: "app_join", app_id: appId, channel_id: channelId }),
    }).catch(() => {});
  }

  const onBotAppLaunch = (ev: AppLaunchEvent) => {
    setActiveApps((prev) => {
      const next = new Map(prev);
      next.set(ev.app_id, ev);
      return next;
    });
  };

  const onBotAppOpen = (ev: AppOpenEvent, hubUrl: string) => {
    if (!takeAppJoin(ev.app_id)) return;
    const label = `mini-app-${ev.app_id}`;
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
      next.delete(ev.app_id);
      return next;
    });
    invoke("close_mini_app", { label: `mini-app-${ev.app_id}` }).catch(() => {});
  };

  return { activeApps, sendAppJoin, onBotAppLaunch, onBotAppOpen, onBotAppClose };
}
