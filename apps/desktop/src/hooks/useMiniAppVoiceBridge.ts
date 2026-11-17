import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  checkSetVoicePosition,
  isSetVoicePosition,
  voiceRefusedMessage,
  voiceStateMessage,
  type VoiceBridgeState,
} from "@wavvon/core";
import { listenerScope } from "../utils/listenerScope";

interface Opts {
  voiceChannelId: string | null;
  roomZone: { zoneId: string } | null;
  titleFor: (appId: string, channelId: string) => string;
  moveInRoomForApp: (appTitle: string, zoneId: string, position: number[]) => void;
  clearRoomMover: () => void;
}

interface Win {
  channelId: string;
  appId: string;
}

/** The main-window half of the mini-app voice bridge (mini-app-bridge.md §5):
 *  the Rust shell vouches for which window asked, this judges the request
 *  against the user's voice state and sends it down the room map's path. */
export function useMiniAppVoiceBridge(opts: Opts) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const windows = useRef(new Map<string, Win>());
  const mover = useRef<string | null>(null);

  const stateFor = (channelId: string): VoiceBridgeState => {
    const { voiceChannelId, roomZone } = optsRef.current;
    return {
      inVoice: voiceChannelId === channelId,
      zones: roomZone ? [{ zone_id: roomZone.zoneId, coordinate_system: "2d" }] : [],
    };
  };
  const post = (label: string, message: object) =>
    invoke("mini_app_post", { label, message }).catch(() => {});

  useEffect(() => {
    const scope = listenerScope();
    scope.add(listen<{ label: string; channelId: string; appId: string }>("mini-app-loaded", (e) => {
      const { label, channelId, appId } = e.payload;
      windows.current.set(label, { channelId, appId });
      post(label, voiceStateMessage(stateFor(channelId)));
    }));
    scope.add(listen<string>("mini-app-closed", (e) => {
      windows.current.delete(e.payload);
      if (mover.current === e.payload) {
        mover.current = null;
        optsRef.current.clearRoomMover();
      }
    }));
    scope.add(listen<{ label: string; channelId: string; appId: string; message: unknown }>(
      "mini-app-voice-position",
      (e) => {
        const { label, channelId, appId, message } = e.payload;
        if (!isSetVoicePosition(message)) return;
        const r = checkSetVoicePosition(message, stateFor(channelId));
        if (!r.ok) {
          post(label, voiceRefusedMessage(r.reason));
          return;
        }
        mover.current = label;
        optsRef.current.moveInRoomForApp(optsRef.current.titleFor(appId, channelId), r.zoneId, r.position);
      },
    ));
    return () => scope.close();
  }, []);

  const zoneId = opts.roomZone?.zoneId ?? null;
  useEffect(() => {
    for (const [label, w] of windows.current) post(label, voiceStateMessage(stateFor(w.channelId)));
    if (!opts.voiceChannelId) mover.current = null;
  }, [opts.voiceChannelId, zoneId]);
}
