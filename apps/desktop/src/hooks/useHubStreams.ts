import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  ActiveStream,
  HubStreamInfo,
  WsScreenShareChunkOut,
  WsStreamSubscribed,
  WsStreamSubscriptionEnded,
  WsHubStreams,
} from "../types";
import type { ScreenShareViewerRef } from "@wavvon/ui";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

interface WsInfo {
  hub_url: string;
  token: string;
}

/**
 * Every live on the active hub, and the ones this viewer opened. Nothing opens
 * by itself (#259): opening sends `stream_subscribe`, closing
 * `stream_unsubscribe`, in the room we are in as much as anywhere else. On a
 * hub advertising `screenshare.onrequest` the socket asks for exactly that;
 * on an older one the hub pushes every stream and the chunks of a closed live
 * are dropped here.
 */
export function useHubStreams(
  activeHubId: string | null,
  viewerRef: React.RefObject<ScreenShareViewerRef | null>
) {
  const [hubStreams, setHubStreams] = useState<HubStreamInfo[]>([]);
  const [opened, setOpened] = useState<HubStreamInfo[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const sent = useRef<Set<string>>(new Set());

  const send = (msg: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  useEffect(() => {
    setHubStreams([]);
    setOpened([]);
    sent.current.clear();
    if (!activeHubId) return;

    let cancelled = false;
    let ws: WebSocket | null = null;

    (async () => {
      const info = await invoke<WsInfo>("get_hub_ws_info", { hubId: activeHubId });
      const caps = await fetchWithTimeout(`${info.hub_url.replace(/\/+$/, "")}/info`)
        .then((r) => r.json() as Promise<{ capabilities?: string[] }>)
        .then((i) => i.capabilities ?? [])
        .catch(() => [] as string[]);
      if (cancelled) return;
      const onRequest = caps.includes("screenshare.onrequest") ? "&streams=on_request" : "";
      ws = new WebSocket(`${info.hub_url.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(info.token)}${onRequest}`);
      wsRef.current = ws;
      ws.binaryType = "arraybuffer";

      let pendingEnvelope: WsScreenShareChunkOut | null = null;

      ws.onopen = () => {
        ws!.send(JSON.stringify({ type: "stream_list" }));
        // A new socket holds none of the lives we had open.
        sent.current.clear();
        setOpened((prev) => [...prev]);
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          if (pendingEnvelope) {
            viewerRef.current?.appendChunk(pendingEnvelope.stream_id, pendingEnvelope.is_init, event.data);
          }
          pendingEnvelope = null;
          return;
        }

        let msg: { type: string; [k: string]: unknown };
        try {
          msg = JSON.parse(event.data as string);
        } catch {
          return;
        }

        if (msg.type === "hub_streams") {
          setHubStreams((msg as unknown as WsHubStreams).streams);
        } else if (msg.type === "screen_share_started") {
          const ev = msg as unknown as HubStreamInfo;
          setHubStreams((prev) => prev.some((s) => s.stream_id === ev.stream_id) ? prev : [...prev, {
            channel_id: ev.channel_id,
            stream_id: ev.stream_id,
            sharer_pubkey: ev.sharer_pubkey,
            kind: ev.kind === "webcam" ? "webcam" : "screen",
            mime: ev.mime,
            has_audio: ev.has_audio,
          }]);
        } else if (msg.type === "screen_share_stopped" || msg.type === "stream_subscription_ended") {
          const id = (msg as unknown as WsStreamSubscriptionEnded).stream_id;
          if (msg.type === "screen_share_stopped") setHubStreams((prev) => prev.filter((s) => s.stream_id !== id));
          setOpened((prev) => prev.filter((s) => s.stream_id !== id));
          viewerRef.current?.stopStream(id);
        } else if (msg.type === "stream_subscribed") {
          // A live in another channel may not have been announced to us.
          const ev = msg as unknown as WsStreamSubscribed;
          setHubStreams((prev) => prev.some((s) => s.stream_id === ev.stream_id) ? prev : [...prev, {
            channel_id: ev.source_channel_id,
            stream_id: ev.stream_id,
            sharer_pubkey: ev.sharer_pubkey,
            kind: ev.kind === "webcam" ? "webcam" : "screen",
            mime: ev.mime,
            has_audio: ev.has_audio,
          }]);
        } else if (msg.type === "screen_share_chunk") {
          // The viewer ignores a stream it does not render, so a chunk of a
          // closed live goes nowhere.
          pendingEnvelope = msg as unknown as WsScreenShareChunkOut;
        }
      };

      ws.onclose = () => { wsRef.current = null; };
    })().catch(() => {});

    return () => {
      cancelled = true;
      ws?.close();
      wsRef.current = null;
    };
  }, [activeHubId, viewerRef]);

  // Subscribe after the commit that rendered the opened stream, so the viewer
  // already holds a MediaSource when the replayed init segment arrives.
  useEffect(() => {
    for (const s of opened) {
      if (sent.current.has(s.stream_id)) continue;
      sent.current.add(s.stream_id);
      send({ type: "stream_subscribe", source_channel_id: s.channel_id, stream_id: s.stream_id });
    }
    const ids = new Set(opened.map((s) => s.stream_id));
    for (const id of sent.current) if (!ids.has(id)) sent.current.delete(id);
  }, [opened]);

  const openStream = useCallback((channelId: string, streamId: string) => {
    setOpened((prev) => {
      if (prev.some((s) => s.stream_id === streamId)) return prev;
      const info = hubStreams.find((s) => s.stream_id === streamId);
      return info ? [...prev, { ...info, channel_id: channelId }] : prev;
    });
  }, [hubStreams]);

  const closeStream = useCallback((channelId: string, streamId: string) => {
    setOpened((prev) => prev.filter((s) => s.stream_id !== streamId));
    viewerRef.current?.stopStream(streamId);
    send({ type: "stream_unsubscribe", source_channel_id: channelId, stream_id: streamId });
  }, [viewerRef]);

  const openedStreams: ActiveStream[] = opened;
  const openedIds = useMemo(() => new Set(opened.map((s) => s.stream_id)), [opened]);

  return { hubStreams, openedStreams, openedIds, openStream, closeStream };
}
