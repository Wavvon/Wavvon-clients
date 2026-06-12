import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  ActiveStream,
  HubStreamInfo,
  WsScreenShareChunkOut,
  WsStreamSubscribed,
  WsStreamSubscriptionEnded,
  WsHubStreams,
} from "../types";
import type { ScreenShareViewerRef } from "../components/ScreenShareViewer";

interface WsInfo {
  hub_url: string;
  token: string;
}

function buildWsUrl(hubUrl: string, token: string): string {
  return `${hubUrl.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(token)}`;
}

/**
 * Hub-scoped hook: discovers all active streams across visible channels and
 * manages cross-channel stream subscriptions. Stays alive across channel changes.
 *
 * Streams received via cross-channel subscriptions are forwarded to the shared
 * `viewerRef` (same ScreenShareViewer instance used by the channel viewer).
 */
export function useHubStreams(
  activeHubId: string | null,
  viewerRef: React.RefObject<ScreenShareViewerRef | null>
) {
  const [hubStreams, setHubStreams] = useState<HubStreamInfo[]>([]);
  const [crossChannelStreams, setCrossChannelStreams] = useState<ActiveStream[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const subscribedStreamIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!activeHubId) {
      setHubStreams([]);
      setCrossChannelStreams([]);
      subscribedStreamIds.current.clear();
      return;
    }

    let cancelled = false;
    let ws: WebSocket | null = null;

    invoke<WsInfo>("get_hub_ws_info").then((info) => {
      if (cancelled) return;

      ws = new WebSocket(buildWsUrl(info.hub_url, info.token));
      wsRef.current = ws;
      if (cancelled) {
        ws.close();
        wsRef.current = null;
        return;
      }
      ws.binaryType = "arraybuffer";

      let pendingEnvelope: WsScreenShareChunkOut | null = null;

      ws.onopen = () => {
        // Request snapshot of all active hub streams on connect.
        ws!.send(JSON.stringify({ type: "stream_list" }));
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          if (pendingEnvelope && viewerRef.current) {
            viewerRef.current.appendChunk(
              pendingEnvelope.stream_id,
              pendingEnvelope.is_init,
              event.data
            );
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
          const ev = msg as unknown as WsHubStreams;
          setHubStreams(ev.streams);

        } else if (msg.type === "screen_share_started") {
          // A new stream started somewhere on the hub — update discovery list.
          const ev = msg as unknown as { channel_id: string; stream_id: string; sharer_pubkey: string; kind: string; mime: string; has_audio: boolean };
          setHubStreams((prev) => {
            if (prev.some((s) => s.stream_id === ev.stream_id)) return prev;
            return [...prev, {
              channel_id: ev.channel_id,
              stream_id: ev.stream_id,
              sharer_pubkey: ev.sharer_pubkey,
              kind: ev.kind,
              mime: ev.mime,
              has_audio: ev.has_audio,
            }];
          });

        } else if (msg.type === "screen_share_stopped") {
          const ev = msg as unknown as { stream_id: string };
          setHubStreams((prev) => prev.filter((s) => s.stream_id !== ev.stream_id));

        } else if (msg.type === "stream_subscribed") {
          const ev = msg as unknown as WsStreamSubscribed;
          subscribedStreamIds.current.add(ev.stream_id);
          setCrossChannelStreams((prev) => {
            if (prev.some((s) => s.stream_id === ev.stream_id)) return prev;
            return [
              ...prev,
              {
                stream_id: ev.stream_id,
                sharer_pubkey: ev.sharer_pubkey,
                kind: (ev.kind === "webcam" ? "webcam" : "screen") as "screen" | "webcam",
                mime: ev.mime,
                has_audio: ev.has_audio,
              },
            ];
          });

        } else if (msg.type === "stream_subscription_ended") {
          const ev = msg as unknown as WsStreamSubscriptionEnded;
          subscribedStreamIds.current.delete(ev.stream_id);
          setCrossChannelStreams((prev) => prev.filter((s) => s.stream_id !== ev.stream_id));
          viewerRef.current?.stopStream(ev.stream_id);

        } else if (msg.type === "screen_share_chunk") {
          // Only buffer chunks for streams we've subscribed to.
          const ev = msg as unknown as WsScreenShareChunkOut;
          if (subscribedStreamIds.current.has(ev.stream_id)) {
            pendingEnvelope = ev;
          }
        }
      };

      ws.onclose = () => { wsRef.current = null; };
    }).catch(() => {});

    return () => {
      cancelled = true;
      subscribedStreamIds.current.clear();
      setCrossChannelStreams([]);
      setHubStreams([]);
      if (ws) {
        ws.close();
        wsRef.current = null;
      }
    };
  }, [activeHubId]);

  const subscribeToStream = useCallback((sourceChannelId: string, streamId: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      type: "stream_subscribe",
      source_channel_id: sourceChannelId,
      stream_id: streamId,
    }));
  }, []);

  const unsubscribeFromStream = useCallback((sourceChannelId: string, streamId: string) => {
    subscribedStreamIds.current.delete(streamId);
    setCrossChannelStreams((prev) => prev.filter((s) => s.stream_id !== streamId));
    viewerRef.current?.stopStream(streamId);

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      type: "stream_unsubscribe",
      source_channel_id: sourceChannelId,
      stream_id: streamId,
    }));
  }, []);

  return {
    hubStreams,
    crossChannelStreams,
    subscribeToStream,
    unsubscribeFromStream,
    subscribedStreamIds,
  };
}
