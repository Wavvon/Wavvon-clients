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
  hub_pubkey: string;
  screen_share_v2?: boolean;
  turn_url?: string;
  turn_username?: string;
  turn_credential?: string;
}

function buildWsUrl(hubUrl: string, token: string): string {
  return `${hubUrl.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(token)}`;
}

const DEFAULT_STUN = "stun:stun.l.google.com:19302";

export function useScreenShareViewer(channelId: string | null) {
  const [streams, setStreams] = useState<ActiveStream[]>([]);
  const viewerRef = useRef<ScreenShareViewerRef | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());

  const canUseWebRtc = typeof RTCPeerConnection !== "undefined";

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

      function buildIceConfig(): RTCConfiguration {
        const iceServers: RTCIceServer[] = [{ urls: DEFAULT_STUN }];
        if (info.turn_url) {
          iceServers.push({ urls: info.turn_url, username: info.turn_username, credential: info.turn_credential });
        }
        return { iceServers };
      }

      ws.onopen = () => {
        ws!.send(JSON.stringify({ type: "subscribe", channel_id: channelId }));
      };

      ws.onmessage = async (event) => {
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

        let msg: WsScreenShareStarted | WsScreenShareChunkOut | WsScreenShareStopped | { type: string; [k: string]: unknown };
        try {
          msg = JSON.parse(event.data as string);
        } catch {
          return;
        }

        if (msg.type === "screen_share_started") {
          const ev = msg as WsScreenShareStarted & { transport?: string };
          if (ev.channel_id !== channelId) return;

          const useWebRtc = canUseWebRtc && ev.transport === "webrtc" && !!info.screen_share_v2;

          setStreams((prev) => {
            if (prev.some((s) => s.stream_id === ev.stream_id)) return prev;
            return [...prev, { stream_id: ev.stream_id, sharer_pubkey: ev.sharer_pubkey, kind: ev.kind, mime: ev.mime, has_audio: ev.has_audio }];
          });

          if (useWebRtc) {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "screen_share_viewer_join",
                channel_id: channelId,
                stream_id: ev.stream_id,
                viewer_pubkey: null,
              }));
            }
          }

        } else if (msg.type === "screen_share_chunk") {
          pendingEnvelope = msg as WsScreenShareChunkOut;

        } else if (msg.type === "screen_share_stopped") {
          const ev = msg as WsScreenShareStopped;
          if (ev.channel_id !== channelId) return;
          setStreams((prev) => prev.filter((s) => s.stream_id !== ev.stream_id));
          viewerRef.current?.stopStream(ev.stream_id);
          const pc = peerConnectionsRef.current.get(ev.sharer_pubkey);
          if (pc) { try { pc.close(); } catch {} peerConnectionsRef.current.delete(ev.sharer_pubkey); }

        } else if (msg.type === "screen_share_offer") {
          const sharerPubkey = msg.from_pubkey as string;
          const streamId = msg.stream_id as string;
          const sdp = msg.sdp as string;

          const pc = new RTCPeerConnection(buildIceConfig());
          peerConnectionsRef.current.set(sharerPubkey, pc);

          pc.ontrack = (e) => {
            if (viewerRef.current) {
              const stream = e.streams[0];
              if (stream) viewerRef.current.attachStream(streamId, stream);
            }
          };

          pc.onicecandidate = (e) => {
            if (e.candidate && ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "screen_share_ice",
                channel_id: channelId,
                to_pubkey: sharerPubkey,
                from_pubkey: null,
                candidate: JSON.stringify(e.candidate),
                stream_id: streamId,
              }));
            }
          };

          pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === "failed") {
              pc.close();
              peerConnectionsRef.current.delete(sharerPubkey);
            }
          };

          await pc.setRemoteDescription({ type: "offer", sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "screen_share_answer",
              channel_id: channelId,
              to_pubkey: sharerPubkey,
              from_pubkey: null,
              sdp: answer.sdp,
              stream_id: streamId,
            }));
          }

        } else if (msg.type === "screen_share_ice") {
          const senderPubkey = msg.from_pubkey as string;
          const pc = peerConnectionsRef.current.get(senderPubkey);
          if (pc) {
            try { await pc.addIceCandidate(JSON.parse(msg.candidate as string)); } catch {}
          }
        }
      };
    }).catch(() => {});

    return () => {
      cancelled = true;
      for (const [, pc] of peerConnectionsRef.current) {
        try { pc.close(); } catch {}
      }
      peerConnectionsRef.current.clear();
      if (ws) {
        ws.close();
        wsRef.current = null;
      }
      setStreams([]);
    };
  }, [channelId]);

  return { streams, viewerRef };
}
