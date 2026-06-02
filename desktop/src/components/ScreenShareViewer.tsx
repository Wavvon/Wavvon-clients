import React, {
  forwardRef,
  useCallback,
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
  mediaOutputDeviceId?: string;
}

interface StreamState {
  mediaSource: MediaSource;
  sourceBuffer: SourceBuffer | null;
  queue: ArrayBuffer[];
  busy: boolean;
  objectUrl: string;
}

const ScreenShareViewer = forwardRef<ScreenShareViewerRef, Props>(
  ({ streams, mediaOutputDeviceId }, ref) => {
    const streamStates = useRef<Map<string, StreamState>>(new Map());
    const videoRefs = useRef<Map<string, HTMLVideoElement | null>>(new Map());
    const webrtcStreams = useRef<Map<string, MediaStream>>(new Map());
    const [volumes, setVolumes] = useState<Record<string, number>>({});
    const [pipStreamId, setPipStreamId] = useState<string | null>(null);

    const pipSupported =
      typeof document !== "undefined" && "pictureInPictureEnabled" in document;

    const enterPip = useCallback(async (streamId: string) => {
      const el = videoRefs.current.get(streamId);
      if (!el || !pipSupported) return;
      try {
        if (document.pictureInPictureElement === el) {
          await document.exitPictureInPicture();
        } else {
          await el.requestPictureInPicture();
          setPipStreamId(streamId);
          el.addEventListener("leavepictureinpicture", () => setPipStreamId(null), { once: true });
        }
      } catch {
        // Browser denied PiP (not playing yet, or feature not available) — ignore
      }
    }, [pipSupported]);

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

    // Apply the selected audio output device to all video elements whenever it changes.
    useEffect(() => {
      if (!mediaOutputDeviceId) return;
      for (const [, el] of videoRefs.current) {
        if (el && "setSinkId" in el) {
          // setSinkId is a non-standard extension; cast to any to avoid TS complaints.
          (el as HTMLVideoElement & { setSinkId(id: string): Promise<void> })
            .setSinkId(mediaOutputDeviceId)
            .catch(() => {});
        }
      }
    }, [mediaOutputDeviceId, streams]);

    // Group streams by sharer so each sharer gets their own panel.
    const sharerMap = new Map<string, { screen: ActiveStream | null; webcam: ActiveStream | null }>();
    for (const s of streams) {
      const entry = sharerMap.get(s.sharer_pubkey) ?? { screen: null, webcam: null };
      if (s.kind === "screen" && !entry.screen) entry.screen = s;
      else if (s.kind === "webcam" && !entry.webcam) entry.webcam = s;
      else if (s.kind !== "webcam" && !entry.screen) entry.screen = s;
      sharerMap.set(s.sharer_pubkey, entry);
    }
    const sharers = [...sharerMap.entries()];
    const multiSharer = sharers.length > 1;

    function renderVideo(stream: ActiveStream, className: string) {
      return (
        <video
          key={stream.stream_id}
          className={className}
          autoPlay
          muted
          playsInline
          ref={(el) => {
            videoRefs.current.set(stream.stream_id, el);
            if (el) {
              const rtcStream = webrtcStreams.current.get(stream.stream_id);
              if (rtcStream) {
                if (el.srcObject !== rtcStream) { el.srcObject = rtcStream; el.play().catch(() => {}); }
              } else {
                const s = streamStates.current.get(stream.stream_id);
                if (s && el.src !== s.objectUrl) { el.src = s.objectUrl; el.play().catch(() => {}); }
              }
            }
          }}
        />
      );
    }

    return (
      <div className={`screen-share-panel${multiSharer ? " screen-share-panel--multi" : ""}`}>
        {sharers.map(([sharerPubkey, { screen: screenStream, webcam: webcamStream }]) => {
          const mainStream = screenStream ?? null;
          if (!mainStream) return null;
          const audioStream = streams.find(
            (s) => s.sharer_pubkey === sharerPubkey && s.has_audio
          );
          return (
            <div key={sharerPubkey} className="screen-share-main-wrap">
              {renderVideo(mainStream, "main-stream")}
              {webcamStream && renderVideo(webcamStream, "webcam-overlay")}
              {pipSupported && (
                <button
                  className="pip-btn"
                  title={pipStreamId === mainStream.stream_id ? "Exit picture-in-picture" : "Pop out (picture-in-picture)"}
                  onClick={() => enterPip(mainStream.stream_id)}
                >
                  {pipStreamId === mainStream.stream_id ? "⊠" : "⧉"}
                </button>
              )}
              {audioStream && (
                <div className="screen-share-volume">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    title="Volume"
                    value={volumes[audioStream.stream_id] ?? 1}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setVolumes((prev) => ({ ...prev, [audioStream.stream_id]: v }));
                      const el = videoRefs.current.get(audioStream.stream_id);
                      if (el) { el.volume = v; el.muted = v === 0; }
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }
);

ScreenShareViewer.displayName = "ScreenShareViewer";

export { ScreenShareViewer };
