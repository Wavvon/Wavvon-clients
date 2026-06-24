import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ScreenShareOpts } from "../types";

interface WsInfo {
  hub_url: string;
  token: string;
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

export function useScreenShare(channelId: string | null) {
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kbps, setKbps] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const recordersRef = useRef<MediaRecorder[]>([]);
  const streamsRef = useRef<MediaStream[]>([]);
  const streamIdsRef = useRef<string[]>([]);
  // Rolling byte counter for bandwidth display. Reset on each startShare.
  const bytesInWindowRef = useRef(0);
  const kbpsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function startShare(opts: ScreenShareOpts) {
    if (!channelId) return;
    setError(null);

    let wsInfo: WsInfo;
    try {
      wsInfo = await invoke<WsInfo>("get_hub_ws_info");
    } catch (e) {
      setError(String(e));
      return;
    }

    const ws = new WebSocket(buildWsUrl(wsInfo.hub_url, wsInfo.token));
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "subscribe", channel_id: channelId }));
    };

    ws.onerror = () => setError("Screen share connection failed");

    const mime = pickMime();

    let displayStream: MediaStream;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 30, max: 60 },
          width: { max: 1920 },
          height: { max: 1080 },
        },
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
      }));
    }

    startRecorder(ws, displayStream, channelId, screenStreamId, mime);

    if (opts.includeWebcam) {
      try {
        const webcamStream = await navigator.mediaDevices.getUserMedia({
          video: opts.webcamDeviceId ? { deviceId: opts.webcamDeviceId } : true,
          audio: false,
        });
        const webcamStreamId = crypto.randomUUID();
        streamIdsRef.current.push(webcamStreamId);
        streamsRef.current.push(webcamStream);

        ws.send(JSON.stringify({
          type: "screen_share_start",
          channel_id: channelId,
          stream_id: webcamStreamId,
          kind: "webcam",
          mime,
          has_audio: false,
        }));

        startRecorder(ws, webcamStream, channelId, webcamStreamId, mime);
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
    channelId: string,
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
        channel_id: channelId,
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
