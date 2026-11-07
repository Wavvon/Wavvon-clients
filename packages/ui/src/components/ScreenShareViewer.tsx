import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type { ActiveStream } from "../types";

export interface ScreenShareViewerRef {
  appendChunk: (streamId: string, isInit: boolean, data: ArrayBuffer) => void;
  stopStream: (streamId: string) => void;
  /** Attaches a MediaStream received over a lower-latency WebRTC path
   *  (bypassing the MSE chunk relay below) directly to the video element. */
  attachStream: (streamId: string, stream: MediaStream) => void;
}

interface Props {
  streams: ActiveStream[];
  /** Routes playback through a non-default audio output device. */
  mediaOutputDeviceId?: string;
  /** Native OS pop-out window — a Tauri-only capability. All five are
   *  supplied together or not at all; omit to hide the affordance entirely
   *  (the browser-native Picture-in-Picture button above it still works). */
  onOpenOsPipWindow?: () => Promise<void>;
  onCloseOsPipWindow?: () => Promise<void>;
  onOsPipChunk?: (data: ArrayBuffer) => void;
  onOsPipStop?: () => void;
  onListenOsPipClose?: (onClosed: () => void) => () => void;
  /** Closes a stream for this viewer (the voice room's "stop watching"). */
  onStopWatch?: (streamId: string) => void;
}

type MediaSourceCtor = typeof MediaSource;

/** The MSE constructor this browser offers. iPhone Safari has no
 *  `MediaSource`, only `ManagedMediaSource` (iOS 17.1+); calling the missing
 *  one threw inside an effect and took the whole app down with it. */
export function pickMediaSource(scope: object = globalThis): MediaSourceCtor | null {
  const g = scope as { MediaSource?: MediaSourceCtor; ManagedMediaSource?: MediaSourceCtor };
  return g.MediaSource ?? g.ManagedMediaSource ?? null;
}

interface StreamState {
  mediaSource: MediaSource;
  sourceBuffer: SourceBuffer | null;
  queue: ArrayBuffer[];
  busy: boolean;
  objectUrl: string;
}

const ScreenShareViewer = forwardRef<ScreenShareViewerRef, Props>(
  (
    {
      streams,
      mediaOutputDeviceId,
      onOpenOsPipWindow,
      onCloseOsPipWindow,
      onOsPipChunk,
      onOsPipStop,
      onListenOsPipClose,
      onStopWatch,
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const streamStates = useRef<Map<string, StreamState>>(new Map());
    const videoRefs = useRef<Map<string, HTMLVideoElement | null>>(new Map());
    const webrtcStreams = useRef<Map<string, MediaStream>>(new Map());
    const [volumes, setVolumes] = useState<Record<string, number>>({});
    const [pipStreamId, setPipStreamId] = useState<string | null>(null);
    const [osPipOpen, setOsPipOpen] = useState(false);
    const osPipOpenRef = useRef(false);
    const osPipStreamId = useRef<string | null>(null);
    const unlistenOsPipClose = useRef<(() => void) | null>(null);
    const MediaSourceImpl = pickMediaSource();
    // attachStream fills a ref; this re-renders so a WebRTC stream replaces
    // the "can't play" notice on a browser without MSE.
    const [, setRtcVersion] = useState(0);

    const osPipSupported = !!onOpenOsPipWindow && !!onCloseOsPipWindow;
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

    const toggleOsPip = useCallback(async (streamId: string) => {
      if (osPipOpenRef.current) {
        await onCloseOsPipWindow?.().catch(() => {});
        setOsPipOpen(false);
        osPipOpenRef.current = false;
        osPipStreamId.current = null;
        return;
      }

      try {
        await onOpenOsPipWindow?.();
        setOsPipOpen(true);
        osPipOpenRef.current = true;
        osPipStreamId.current = streamId;
      } catch {
        return;
      }

      unlistenOsPipClose.current?.();
      unlistenOsPipClose.current = onListenOsPipClose?.(() => {
        setOsPipOpen(false);
        osPipOpenRef.current = false;
        osPipStreamId.current = null;
      }) ?? null;
    }, [onOpenOsPipWindow, onCloseOsPipWindow, onListenOsPipClose]);

    useEffect(() => {
      return () => { unlistenOsPipClose.current?.(); };
    }, []);

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
        const s = streamStates.current.get(streamId);
        if (!s) return;

        if (isInit && s.sourceBuffer) {
          s.queue = [data];
          s.busy = false;
          drainQueue(streamId);
          return;
        }

        s.queue.push(data);
        drainQueue(streamId);

        if (osPipStreamId.current === streamId && osPipOpenRef.current) {
          onOsPipChunk?.(data);
        }
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

        if (osPipStreamId.current === streamId) {
          onOsPipStop?.();
        }
      },

      attachStream(streamId, stream) {
        webrtcStreams.current.set(streamId, stream);
        setRtcVersion((v) => v + 1);
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
        if (!MediaSourceImpl) continue;

        const ms = new MediaSourceImpl();
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
            const mimeType = MediaSourceImpl.isTypeSupported(stream.mime)
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
    }, [streams, MediaSourceImpl]);

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

    // Group streams by sharer so each concurrent sharer gets their own panel.
    const sharerMap = new Map<string, { screen: ActiveStream | null; webcam: ActiveStream | null }>();
    for (const s of streams) {
      const entry = sharerMap.get(s.sharer_pubkey) ?? { screen: null, webcam: null };
      if (s.kind === "screen" && !entry.screen) entry.screen = s;
      else if (s.kind === "webcam" && !entry.webcam) entry.webcam = s;
      else if (s.kind !== "webcam" && !entry.screen) entry.screen = s;
      sharerMap.set(s.sharer_pubkey, entry);
    }
    const sharers = [...sharerMap.entries()];

    function renderVideo(stream: ActiveStream, className: string) {
      if (!MediaSourceImpl && !webrtcStreams.current.has(stream.stream_id)) {
        return (
          <p key={stream.stream_id} className={`muted ${className}`}>
            {t("voice.share.unsupported")}
          </p>
        );
      }
      return (
        <video
          key={stream.stream_id}
          className={className}
          autoPlay
          muted
          playsInline
          // ManagedMediaSource plays only when remote playback (AirPlay) is
          // off or explicitly wired up; a screen share has no use for it.
          disableRemotePlayback
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
      <div className="screen-share-panel">
        {sharers.map(([sharerPubkey, { screen: screenStream, webcam: webcamStream }]) => {
          const mainStream = screenStream ?? null;
          if (!mainStream) return null;
          const audioStream = streams.find(
            (s) => s.sharer_pubkey === sharerPubkey && s.has_audio
          );
          return (
            <div key={sharerPubkey} className="screen-share-main-wrap">
              <div className="screen-share-tile-actions">
                <button
                  type="button"
                  className="btn-small"
                  onClick={(e) => { void (e.currentTarget.closest(".screen-share-main-wrap") as HTMLElement | null)?.requestFullscreen?.(); }}
                >
                  {t("voice.share.fullscreen")}
                </button>
                {onStopWatch && (
                  <button
                    type="button"
                    className="btn-small btn-secondary"
                    onClick={() => { onStopWatch(mainStream.stream_id); if (webcamStream) onStopWatch(webcamStream.stream_id); }}
                  >
                    {t("voice.share.stop_watching")}
                  </button>
                )}
              </div>
              {renderVideo(mainStream, "main-stream")}
              {webcamStream && renderVideo(webcamStream, "webcam-overlay")}
              {pipSupported && (MediaSourceImpl || webrtcStreams.current.has(mainStream.stream_id)) && (
                <button
                  className="pip-btn"
                  title={pipStreamId === mainStream.stream_id ? t("voice.share.pip_exit") : t("voice.share.pip_enter")}
                  onClick={() => enterPip(mainStream.stream_id)}
                >
                  {pipStreamId === mainStream.stream_id ? "⊞" : "⧉"}
                </button>
              )}
              {osPipSupported && (
                <button
                  className="pip-btn pip-btn--os"
                  style={{
                    right: pipSupported ? "calc(var(--space-2) + 34px)" : "var(--space-2)",
                    opacity: osPipOpen ? 1 : undefined,
                  }}
                  title={osPipOpen ? t("voice.share.window_exit") : t("voice.share.window_enter")}
                  onClick={() => toggleOsPip(mainStream.stream_id)}
                >
                  {osPipOpen ? "⬇" : "⬆"}
                </button>
              )}
              {audioStream && (
                <div className="screen-share-volume">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    title={t("voice.share.volume")}
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
