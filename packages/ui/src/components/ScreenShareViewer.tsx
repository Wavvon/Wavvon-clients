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
  /** Native OS pop-out windows, one per stream — a Tauri-only capability.
   *  The five are supplied together or not at all; omit to hide the
   *  affordance entirely (the browser's Picture-in-Picture still works). */
  onOpenOsPipWindow?: (streamId: string) => Promise<void>;
  onCloseOsPipWindow?: (streamId: string) => Promise<void>;
  onOsPipChunk?: (streamId: string, data: ArrayBuffer) => void;
  onOsPipStop?: (streamId: string) => void;
  onListenOsPipClose?: (streamId: string, onClosed: () => void) => () => void;
  /** Turns click-through off on a stream's pop-out: a window that lets the
   *  mouse through cannot be clicked to undo it. */
  onOsPipRestoreCursor?: (streamId: string) => void;
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

type CapturableVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

interface DocumentPictureInPicture {
  requestWindow: (options: { width: number; height: number }) => Promise<Window>;
}

/** The Document Picture-in-Picture entry point, where the browser has one. */
export function documentPictureInPicture(scope: object = globalThis): DocumentPictureInPicture | null {
  return (scope as { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture ?? null;
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
      onOsPipRestoreCursor,
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
    // Stream ids with a pop-out window open; the ref is what the chunk path
    // reads, the state what renders.
    const [osPipOpen, setOsPipOpen] = useState<ReadonlySet<string>>(new Set());
    const osPipOpenRef = useRef<Set<string>>(new Set());
    const unlistenOsPipClose = useRef<Map<string, () => void>>(new Map());
    // A window opened mid-stream needs the init segment before any chunk
    // after it will decode.
    const initChunks = useRef<Map<string, ArrayBuffer>>(new Map());
    const [docPipOpen, setDocPipOpen] = useState(false);
    const MediaSourceImpl = pickMediaSource();
    // attachStream fills a ref; this re-renders so a WebRTC stream replaces
    // the "can't play" notice on a browser without MSE.
    const [, setRtcVersion] = useState(0);

    const osPipSupported = !!onOpenOsPipWindow && !!onCloseOsPipWindow;
    const pipSupported =
      typeof document !== "undefined" && "pictureInPictureEnabled" in document;

    const docPipWindow = useRef<Window | null>(null);
    const docPip = documentPictureInPicture();

    // Document Picture-in-Picture (Chrome/Edge 116+, Firefox 151+): one
    // floating window holding every watched screen share, where `<video>`
    // PiP allows a single stream per page. The window shows copies captured
    // from the players here, so the page's own players stay where React put
    // them.
    const toggleFloatAll = useCallback(async () => {
      if (!docPip) return;
      if (docPipWindow.current) {
        docPipWindow.current.close();
        return;
      }
      const captured: MediaStream[] = [];
      for (const s of streams) {
        if (s.kind === "webcam") continue;
        const el = videoRefs.current.get(s.stream_id) as CapturableVideo | null | undefined;
        const ms = el?.captureStream?.() ?? el?.mozCaptureStream?.();
        if (ms) captured.push(ms);
      }
      if (captured.length === 0) return;
      let win: Window;
      try {
        win = await docPip.requestWindow({ width: 480, height: 270 });
      } catch {
        return;
      }
      docPipWindow.current = win;
      const doc = win.document;
      doc.body.style.cssText =
        "margin:0;background:#000;height:100vh;display:grid;gap:2px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr))";
      for (const ms of captured) {
        const v = doc.createElement("video");
        v.autoplay = true;
        v.muted = true;
        v.playsInline = true;
        v.srcObject = ms;
        v.style.cssText = "width:100%;height:100%;min-height:0;object-fit:contain";
        doc.body.appendChild(v);
      }
      setDocPipOpen(true);
      win.addEventListener("pagehide", () => {
        for (const ms of captured) ms.getTracks().forEach((tr) => tr.stop());
        docPipWindow.current = null;
        setDocPipOpen(false);
      }, { once: true });
    }, [docPip, streams]);

    useEffect(() => () => { docPipWindow.current?.close(); }, []);

    const enterPip = useCallback(async (streamId: string) => {
      if (docPip) {
        await toggleFloatAll();
        return;
      }
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
    }, [pipSupported, docPip, toggleFloatAll]);

    const markOsPipClosed = useCallback((streamId: string) => {
      osPipOpenRef.current.delete(streamId);
      setOsPipOpen(new Set(osPipOpenRef.current));
      unlistenOsPipClose.current.get(streamId)?.();
      unlistenOsPipClose.current.delete(streamId);
    }, []);

    const toggleOsPip = useCallback(async (streamId: string) => {
      if (osPipOpenRef.current.has(streamId)) {
        await onCloseOsPipWindow?.(streamId).catch(() => {});
        markOsPipClosed(streamId);
        return;
      }

      try {
        await onOpenOsPipWindow?.(streamId);
      } catch {
        return;
      }
      osPipOpenRef.current.add(streamId);
      setOsPipOpen(new Set(osPipOpenRef.current));
      const init = initChunks.current.get(streamId);
      if (init) onOsPipChunk?.(streamId, init);

      unlistenOsPipClose.current.get(streamId)?.();
      const unlisten = onListenOsPipClose?.(streamId, () => markOsPipClosed(streamId));
      if (unlisten) unlistenOsPipClose.current.set(streamId, unlisten);
    }, [onOpenOsPipWindow, onCloseOsPipWindow, onListenOsPipClose, onOsPipChunk, markOsPipClosed]);

    useEffect(() => {
      const listeners = unlistenOsPipClose.current;
      return () => { for (const u of listeners.values()) u(); };
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

        if (isInit) initChunks.current.set(streamId, data);
        if (osPipOpenRef.current.has(streamId)) onOsPipChunk?.(streamId, data);

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

        initChunks.current.delete(streamId);
        if (osPipOpenRef.current.has(streamId)) onOsPipStop?.(streamId);
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
              {(pipSupported || docPip) && (MediaSourceImpl || webrtcStreams.current.has(mainStream.stream_id)) && (
                <button
                  className="pip-btn"
                  title={
                    docPip
                      ? (docPipOpen ? t("voice.share.pip_exit") : t("voice.share.pip_all"))
                      : (pipStreamId === mainStream.stream_id ? t("voice.share.pip_exit") : t("voice.share.pip_enter"))
                  }
                  onClick={() => enterPip(mainStream.stream_id)}
                >
                  {(docPip ? docPipOpen : pipStreamId === mainStream.stream_id) ? "⊞" : "⧉"}
                </button>
              )}
              {osPipSupported && (
                <button
                  className="pip-btn pip-btn--os"
                  style={{
                    right: pipSupported ? "calc(var(--space-2) + 34px)" : "var(--space-2)",
                    opacity: osPipOpen.has(mainStream.stream_id) ? 1 : undefined,
                  }}
                  title={osPipOpen.has(mainStream.stream_id) ? t("voice.share.window_exit") : t("voice.share.window_enter")}
                  onClick={() => toggleOsPip(mainStream.stream_id)}
                >
                  {osPipOpen.has(mainStream.stream_id) ? "⬇" : "⬆"}
                </button>
              )}
              {onOsPipRestoreCursor && osPipOpen.has(mainStream.stream_id) && (
                <button
                  className="pip-btn pip-btn--os"
                  style={{ right: pipSupported ? "calc(var(--space-2) + 68px)" : "calc(var(--space-2) + 34px)" }}
                  title={t("voice.share.window_restore_cursor")}
                  aria-label={t("voice.share.window_restore_cursor")}
                  onClick={() => onOsPipRestoreCursor(mainStream.stream_id)}
                >
                  ↖
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
