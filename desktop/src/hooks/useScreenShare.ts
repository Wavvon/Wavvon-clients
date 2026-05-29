import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ScreenShareOpts } from "../types";

interface WsInfo {
  hub_url: string;
  token: string;
  hub_pubkey: string;
  screen_share_v2?: boolean;
  turn_url?: string;
  turn_username?: string;
  turn_credential?: string;
}

function pickMime(): string {
  const candidates = [
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
  ];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "video/webm";
}

function buildWsUrl(hubUrl: string, token: string): string {
  return `${hubUrl.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(token)}`;
}

const DEFAULT_STUN = "stun:stun.l.google.com:19302";

export function useScreenShare(channelId: string | null) {
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kbps, setKbps] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const recordersRef = useRef<MediaRecorder[]>([]);
  const streamsRef = useRef<MediaStream[]>([]);
  const streamIdsRef = useRef<string[]>([]);
  const bytesInWindowRef = useRef(0);
  const kbpsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const myPubkeyRef = useRef<string | null>(null);
  const wsInfoRef = useRef<WsInfo | null>(null);

  const canUseWebRtc = typeof RTCPeerConnection !== "undefined";

  function buildIceConfig(info: WsInfo): RTCConfiguration {
    const iceServers: RTCIceServer[] = [{ urls: DEFAULT_STUN }];
    if (info.turn_url) {
      iceServers.push({
        urls: info.turn_url,
        username: info.turn_username,
        credential: info.turn_credential,
      });
    }
    return { iceServers };
  }

  async function startShare(opts: ScreenShareOpts) {
    if (!channelId) return;
    setError(null);

    let wsInfo: WsInfo;
    try {
      wsInfo = await invoke<WsInfo>("get_hub_ws_info");
      wsInfoRef.current = wsInfo;
    } catch (e) {
      setError(String(e));
      return;
    }

    myPubkeyRef.current = await invoke<string>("get_my_pubkey").catch(() => null);

    const useWebRtc = canUseWebRtc && !!wsInfo.screen_share_v2;
    const transport: "webrtc" | "chunks" = useWebRtc ? "webrtc" : "chunks";

    const ws = new WebSocket(buildWsUrl(wsInfo.hub_url, wsInfo.token));
    wsRef.current = ws;

    ws.onerror = () => setError("Screen share connection failed");

    const mime = pickMime();

    let displayStream: MediaStream;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 60 }, width: { max: 1920 }, height: { max: 1080 } },
        audio: opts.includeAudio,
      });
    } catch (e) {
      ws.close();
      wsRef.current = null;
      setError("Could not capture screen: " + String(e));
      return;
    }

    const screenStreamId = crypto.randomUUID();
    streamIdsRef.current = [screenStreamId];
    streamsRef.current = [displayStream];

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "subscribe", channel_id: channelId }));
      ws.send(JSON.stringify({
        type: "screen_share_start",
        channel_id: channelId,
        stream_id: screenStreamId,
        kind: "screen",
        mime,
        has_audio: opts.includeAudio,
        transport,
      }));
    };

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "subscribe", channel_id: channelId }));
      ws.send(JSON.stringify({
        type: "screen_share_start",
        channel_id: channelId,
        stream_id: screenStreamId,
        kind: "screen",
        mime,
        has_audio: opts.includeAudio,
        transport,
      }));
    }

    if (useWebRtc) {
      ws.onmessage = async (event) => {
        if (typeof event.data !== "string") return;
        let msg: { type: string; [k: string]: unknown };
        try { msg = JSON.parse(event.data); } catch { return; }

        if (msg.type === "screen_share_viewer_joined") {
          const viewerPubkey = msg.viewer_pubkey as string;
          const streamId = msg.stream_id as string;

          const pc = new RTCPeerConnection(buildIceConfig(wsInfo));
          peerConnectionsRef.current.set(viewerPubkey, pc);

          displayStream.getTracks().forEach((track) => pc.addTrack(track, displayStream));

          pc.onicecandidate = (e) => {
            if (e.candidate && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "screen_share_ice",
                channel_id: channelId,
                to_pubkey: viewerPubkey,
                from_pubkey: myPubkeyRef.current,
                candidate: JSON.stringify(e.candidate),
                stream_id: streamId,
              }));
            }
          };

          pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === "failed") {
              pc.close();
              peerConnectionsRef.current.delete(viewerPubkey);
              if (ws.readyState === WebSocket.OPEN) {
                startRecorder(ws, displayStream, channelId, screenStreamId, mime);
              }
            }
          };

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "screen_share_offer",
              channel_id: channelId,
              to_pubkey: viewerPubkey,
              from_pubkey: myPubkeyRef.current,
              sdp: offer.sdp,
              stream_id: streamId,
            }));
          }
        }

        if (msg.type === "screen_share_answer") {
          const viewerPubkey = msg.from_pubkey as string;
          const pc = peerConnectionsRef.current.get(viewerPubkey);
          if (pc) {
            await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp as string });
          }
        }

        if (msg.type === "screen_share_ice") {
          const senderPubkey = msg.from_pubkey as string;
          const pc = peerConnectionsRef.current.get(senderPubkey);
          if (pc) {
            try {
              await pc.addIceCandidate(JSON.parse(msg.candidate as string));
            } catch {
              // ignore stale candidates
            }
          }
        }
      };
    } else {
      startRecorder(ws, displayStream, channelId, screenStreamId, mime);
    }

    if (opts.includeWebcam) {
      try {
        const webcamStream = await navigator.mediaDevices.getUserMedia({
          video: opts.webcamDeviceId ? { deviceId: opts.webcamDeviceId } : true,
          audio: false,
        });
        const webcamStreamId = crypto.randomUUID();
        streamIdsRef.current.push(webcamStreamId);
        streamsRef.current.push(webcamStream);

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "screen_share_start",
            channel_id: channelId,
            stream_id: webcamStreamId,
            kind: "webcam",
            mime,
            has_audio: false,
            transport,
          }));
        }

        if (!useWebRtc) {
          startRecorder(ws, webcamStream, channelId, webcamStreamId, mime);
        }
      } catch {
        // webcam optional — screen share continues without it
      }
    }

    displayStream.getVideoTracks()[0]?.addEventListener("ended", () => {
      stopShare();
    });

    bytesInWindowRef.current = 0;
    kbpsIntervalRef.current = setInterval(() => {
      const bytes = bytesInWindowRef.current;
      bytesInWindowRef.current = 0;
      setKbps(Math.round((bytes * 8) / 1000));
    }, 1000);

    setSharing(true);
  }

  function startRecorder(
    ws: WebSocket,
    stream: MediaStream,
    cid: string,
    streamId: string,
    mime: string
  ) {
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 2_500_000,
    });

    let seq = 0;
    let isFirstChunk = true;

    recorder.ondataavailable = async (e) => {
      if (e.data.size === 0 || ws.readyState !== WebSocket.OPEN) return;
      const buf = await e.data.arrayBuffer();
      bytesInWindowRef.current += buf.byteLength;
      ws.send(JSON.stringify({
        type: "screen_share_chunk",
        channel_id: cid,
        stream_id: streamId,
        seq: seq++,
        is_init: isFirstChunk,
      }));
      ws.send(buf);
      isFirstChunk = false;
    };

    recorder.start(250);
    recordersRef.current.push(recorder);
  }

  function stopShare() {
    const ws = wsRef.current;
    const ids = streamIdsRef.current;
    const channel = channelId;

    for (const recorder of recordersRef.current) {
      try { recorder.stop(); } catch {}
    }
    for (const stream of streamsRef.current) {
      for (const track of stream.getTracks()) track.stop();
    }
    for (const [, pc] of peerConnectionsRef.current) {
      try { pc.close(); } catch {}
    }
    peerConnectionsRef.current.clear();

    if (ws && ws.readyState === WebSocket.OPEN && channel) {
      for (const id of ids) {
        ws.send(JSON.stringify({
          type: "screen_share_stop",
          channel_id: channel,
          stream_id: id,
        }));
      }
      ws.close();
    }

    if (kbpsIntervalRef.current !== null) {
      clearInterval(kbpsIntervalRef.current);
      kbpsIntervalRef.current = null;
    }
    bytesInWindowRef.current = 0;
    wsRef.current = null;
    recordersRef.current = [];
    streamsRef.current = [];
    streamIdsRef.current = [];
    setSharing(false);
    setKbps(0);
  }

  return { sharing, startShare, stopShare, error, kbps };
}
