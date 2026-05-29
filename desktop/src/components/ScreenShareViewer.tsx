import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { ActiveStream } from "../types";

export interface ScreenShareViewerRef {
  appendChunk: (streamId: string, isInit: boolean, data: ArrayBuffer) => void;
  stopStream: (streamId: string) => void;
  attachStream: (streamId: string, stream: MediaStream) => void;
}

interface Props {
  streams: ActiveStream[];
}

interface StreamState {
  mediaSource: MediaSource;
  sourceBuffer: SourceBuffer | null;
  queue: ArrayBuffer[];
  busy: boolean;
  objectUrl: string;
}

const ScreenShareViewer = forwardRef<ScreenShareViewerRef, Props>(
  ({ streams }, ref) => {
    const streamStates = useRef<Map<string, StreamState>>(new Map());
    const videoRefs = useRef<Map<string, HTMLVideoElement | null>>(new Map());
    const webrtcStreams = useRef<Map<string, MediaStream>>(new Map());
    const [volumes, setVolumes] = useState<Record<string, number>>({});

    function drainQueue(streamId: string) {
      const s = streamStates.current.get(streamId);
      if (!s || !s.sourceBuffer || s.busy || s.queue.length === 0) return;
      const chunk = s.queue.shift()!;
      s.busy = true;
      try {
        s.sourceBuffer.appendBuffer(chunk);
      } catch {
        s.busy = false;
        drainQueue(streamId);
      }
    }

    useImperativeHandle(ref, () => ({
      appendChunk(streamId, isInit, data) {
        let s = streamStates.current.get(streamId);
        if (!s) return;

        if (isInit && s.sourceBuffer) {
          s.queue = [data];
          s.busy = false;
          drainQueue(streamId);
          return;
        }

        s.queue.push(data);
        drainQueue(streamId);
      },

      stopStream(streamId) {
        const s = streamStates.current.get(streamId);
        if (s) {
          try {
            if (s.mediaSource.readyState === "open") s.mediaSource.endOfStream();
          } catch {}
          URL.revokeObjectURL(s.objectUrl);
          streamStates.current.delete(streamId);
        }
        webrtcStreams.current.delete(streamId);
        const el = videoRefs.current.get(streamId);
        if (el) { el.srcObject = null; }
      },

      attachStream(streamId, stream) {
        webrtcStreams.current.set(streamId, stream);
        const el = videoRefs.current.get(streamId);
        if (el) {
          el.srcObject = stream;
          el.play().catch(() => {});
        }
      },
    }));

    useEffect(() => {
      const currentIds = new Set(streams.map((s) => s.stream_id));

      for (const [id, state] of streamStates.current) {
        if (!currentIds.has(id)) {
          try {
            if (state.mediaSource.readyState === "open") state.mediaSource.endOfStream();
          } catch {}
          URL.revokeObjectURL(state.objectUrl);
          streamStates.current.delete(id);
        }
      }

      for (const stream of streams) {
        if (streamStates.current.has(stream.stream_id)) continue;

        const ms = new MediaSource();
        const objectUrl = URL.createObjectURL(ms);
        const state: StreamState = {
          mediaSource: ms,
          sourceBuffer: null,
          queue: [],
          busy: false,
          objectUrl,
        };
        streamStates.current.set(stream.stream_id, state);

        ms.addEventListener("sourceopen", () => {
          try {
            const mimeType = MediaSource.isTypeSupported(stream.mime)
              ? stream.mime
              : "video/webm";
            const sb = ms.addSourceBuffer(mimeType);
            state.sourceBuffer = sb;
            sb.addEventListener("updateend", () => {
              state.busy = false;
              drainQueue(stream.stream_id);
            });
          } catch {}
        });

        const videoEl = videoRefs.current.get(stream.stream_id);
        if (videoEl) {
          videoEl.src = objectUrl;
          videoEl.play().catch(() => {});
        }
      }
    }, [streams]);

    const mainStream = streams.find((s) => s.kind === "screen") ?? streams[0] ?? null;
    const webcamStream = streams.find((s) => s.kind === "webcam") ?? null;

    return (
      <div className="screen-share-panel">
        {mainStream && (
          <video
            key={mainStream.stream_id}
            className="main-stream"
            autoPlay
            muted
            playsInline
            ref={(el) => {
              videoRefs.current.set(mainStream.stream_id, el);
              if (el) {
                const rtcStream = webrtcStreams.current.get(mainStream.stream_id);
                if (rtcStream) {
                  if (el.srcObject !== rtcStream) { el.srcObject = rtcStream; el.play().catch(() => {}); }
                } else {
                  const s = streamStates.current.get(mainStream.stream_id);
                  if (s && el.src !== s.objectUrl) { el.src = s.objectUrl; el.play().catch(() => {}); }
                }
              }
            }}
          />
        )}

        {webcamStream && (
          <video
            key={webcamStream.stream_id}
            className="webcam-overlay"
            autoPlay
            muted
            playsInline
            ref={(el) => {
              videoRefs.current.set(webcamStream.stream_id, el);
              if (el) {
                const rtcStream = webrtcStreams.current.get(webcamStream.stream_id);
                if (rtcStream) {
                  if (el.srcObject !== rtcStream) { el.srcObject = rtcStream; el.play().catch(() => {}); }
                } else {
                  const s = streamStates.current.get(webcamStream.stream_id);
                  if (s && el.src !== s.objectUrl) { el.src = s.objectUrl; el.play().catch(() => {}); }
                }
              }
            }}
          />
        )}

        {streams.filter((s) => s.has_audio).map((s) => (
          <div key={s.stream_id} className="screen-share-volume">
            <label>Volume</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volumes[s.stream_id] ?? 1}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolumes((prev) => ({ ...prev, [s.stream_id]: v }));
                const el = videoRefs.current.get(s.stream_id);
                if (el) {
                  el.volume = v;
                  el.muted = v === 0;
                }
              }}
            />
          </div>
        ))}
      </div>
    );
  }
);

ScreenShareViewer.displayName = "ScreenShareViewer";

export { ScreenShareViewer };
