import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  ActiveStream,
  WsScreenShareStarted,
  WsScreenShareChunkOut,
  WsScreenShareStopped,
} from "../types";
import type { ScreenShareViewerRef } from "../components/ScreenShareViewer";

interface WsInfo {
  hub_url: string;
  token: string;
}

function buildWsUrl(hubUrl: string, token: string): string {
  return `${hubUrl.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(token)}`;
}

export function useScreenShareViewer(channelId: string | null) {
  const [streams, setStreams] = useState<ActiveStream[]>([]);
  const viewerRef = useRef<ScreenShareViewerRef | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!channelId) {
      setStreams([]);
      return;
    }

    let cancelled = false;
    let ws: WebSocket | null = null;

    invoke<WsInfo>("get_hub_ws_info").then((info) => {
      if (cancelled) return;

      ws = new WebSocket(buildWsUrl(info.hub_url, info.token));
      wsRef.current = ws;

      let pendingEnvelope: WsScreenShareChunkOut | null = null;

      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        ws!.send(JSON.stringify({ type: "subscribe", channel_id: channelId }));
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

        let msg: WsScreenShareStarted | WsScreenShareChunkOut | WsScreenShareStopped | { type: string };
        try {
          msg = JSON.parse(event.data as string);
        } catch {
          return;
        }

        if (msg.type === "screen_share_started") {
          const ev = msg as WsScreenShareStarted;
          if (ev.channel_id !== channelId) return;
          setStreams((prev) => {
            if (prev.some((s) => s.stream_id === ev.stream_id)) return prev;
            return [
              ...prev,
              {
                stream_id: ev.stream_id,
                sharer_pubkey: ev.sharer_pubkey,
                kind: ev.kind,
                mime: ev.mime,
                has_audio: ev.has_audio,
              },
            ];
          });
        } else if (msg.type === "screen_share_chunk") {
          pendingEnvelope = msg as WsScreenShareChunkOut;
        } else if (msg.type === "screen_share_stopped") {
          const ev = msg as WsScreenShareStopped;
          if (ev.channel_id !== channelId) return;
          setStreams((prev) => prev.filter((s) => s.stream_id !== ev.stream_id));
          viewerRef.current?.stopStream(ev.stream_id);
        }
      };
    }).catch(() => {});

    return () => {
      cancelled = true;
      if (ws) {
        ws.close();
        wsRef.current = null;
      }
      setStreams([]);
    };
  }, [channelId]);

  return { streams, viewerRef };
}
