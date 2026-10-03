import { useState, useEffect, useRef } from "react";
import type { RefObject } from "react";
import { activeSession } from "@platform";
import { WebVideoSession } from "../platform/video";
import { BackgroundProcessor, loadBgMode, loadBgSource } from "@wavvon/ui";

export interface UseVideoParams {
  voiceChannelId: string | null;
  showHubError: (msg: string) => void;
  publicKeyRef: RefObject<string | null>;
}

// Camera video (full-mesh WebRTC over the main voice-hub WebSocket). The
// session itself is created by useVoice at voice-join time (createVideoSession)
// so it catches the hub's video_participants roster; this hook only owns the
// camera on/off toggle, the local/remote streams, and background-effect wiring.
export function useVideo({ voiceChannelId, showHubError, publicKeyRef }: UseVideoParams) {
  const videoSessionRef = useRef<WebVideoSession | null>(null);
  const backgroundProcessorRef = useRef<BackgroundProcessor | null>(null);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const videoEnabledRef = useRef(videoEnabled);
  videoEnabledRef.current = videoEnabled;
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const [remoteVideoStreams, setRemoteVideoStreams] = useState<Map<string, MediaStream>>(new Map());

  // Per-instance teardown on unmount (key-remounted account switch etc.);
  // module-level WS sessions are reset separately by AccountRoot.
  useEffect(() => {
    return () => {
      videoSessionRef.current?.dispose();
      backgroundProcessorRef.current?.stop();
    };
  }, []);

  // Created on voice-join (camera off) so it catches the hub's
  // video_participants roster pushed at join time.
  function createVideoSession(channelId: string) {
    const vws = activeSession().ws;
    const myPk = publicKeyRef.current;
    if (vws && myPk) {
      videoSessionRef.current = new WebVideoSession(vws, channelId, myPk, {
        onRemoteStream: (pk, s) => setRemoteVideoStreams((prev) => new Map(prev).set(pk, s)),
        onPeerGone: (pk) => setRemoteVideoStreams((prev) => { const n = new Map(prev); n.delete(pk); return n; }),
      });
    }
  }

  // Ref-only teardown (no React state reset) — used when switching voice
  // channels, where the state gets set fresh by the new session anyway.
  function stopVideoSessionOnly() {
    videoSessionRef.current?.dispose();
    videoSessionRef.current = null;
    backgroundProcessorRef.current?.stop();
    backgroundProcessorRef.current = null;
  }

  // Full teardown (session + state) — used on voice-session close/leave.
  function disposeVideo() {
    stopVideoSessionOnly();
    setLocalVideoStream(null);
    setRemoteVideoStreams(new Map());
    setVideoEnabled(false);
  }

  function handleVideoMessage(raw: Record<string, unknown>) {
    void videoSessionRef.current?.handle(raw);
  }

  async function handleToggleVideo(deviceId?: string) {
    if (videoEnabled) { handleStopVideo(); return; }
    // Video is scoped to the voice channel you're in; the session was created
    // on voice-join so it already knows the participant roster.
    if (!voiceChannelId || !videoSessionRef.current) {
      showHubError("Join voice first to turn on your camera.");
      return;
    }
    try {
      // A device passed by the caller (e.g. the sidebar's quick-toggle,
      // which auto-picks a camera) wins over the one saved in Settings.
      let camId: string | null = deviceId ?? null;
      if (!camId) { try { camId = localStorage.getItem("wavvon.videoInputDevice"); } catch { /* ignore */ } }
      const raw = await navigator.mediaDevices.getUserMedia({
        video: camId ? { deviceId: { exact: camId } } : true,
        audio: false,
      });
      // Apply the chosen background effect (blur/image/video), if any, by
      // routing the raw camera through the segmentation compositor and sending
      // its processed stream instead.
      let stream = raw;
      const mode = loadBgMode();
      if (mode !== "none") {
        try {
          const proc = new BackgroundProcessor(raw);
          stream = await proc.start(mode, loadBgSource());
          backgroundProcessorRef.current = proc;
        } catch {
          stream = raw; // effect failed to init — fall back to the plain camera
        }
      }
      videoSessionRef.current.enable(stream);
      setLocalVideoStream(stream);
      setVideoEnabled(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/denied|not allowed|dismiss/i.test(msg)) showHubError("Camera: " + msg);
    }
  }

  function handleStopVideo() {
    // Keep the session alive (it tracks the roster) — just turn the camera off.
    videoSessionRef.current?.disable();
    backgroundProcessorRef.current?.stop();
    backgroundProcessorRef.current = null;
    setLocalVideoStream(null);
    setRemoteVideoStreams(new Map());
    setVideoEnabled(false);
  }

  // Live background-effect changes from Settings while the camera is on:
  // re-run the capture pipeline so the new effect (or none) takes hold.
  useEffect(() => {
    const onChange = () => {
      if (videoEnabledRef.current) {
        handleStopVideo();
        void handleToggleVideo();
      }
    };
    window.addEventListener("wavvon:bgchange", onChange);
    return () => window.removeEventListener("wavvon:bgchange", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    videoEnabled,
    localVideoStream,
    remoteVideoStreams,
    handleToggleVideo,
    handleStopVideo,
    handleVideoMessage,
    createVideoSession,
    disposeVideo,
    stopVideoSessionOnly,
  };
}
