import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { BackgroundProcessor } from "../utils/backgroundProcessor";
import type { BackgroundMode } from "../utils/backgroundProcessor";

const MAX_ACTIVE = 3;
const LINGER_MS = 3000;
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

interface PeerEntry {
  conn: RTCPeerConnection;
  stream: MediaStream | null;
}

interface UseVideoParams {
  activeHubId: string | null;
  voiceChannelId: string | null;
  publicKey: string | null;
  voiceSpeakingPubkeys: Set<string>;
}

export function useVideo({ activeHubId, voiceChannelId, publicKey, voiceSpeakingPubkeys }: UseVideoParams) {
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [rawStream, setRawStream] = useState<MediaStream | null>(null);
  const [processedStream, setProcessedStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [videoPubkeys, setVideoPubkeys] = useState<Set<string>>(new Set());
  const [pinnedPubkey, setPinnedPubkey] = useState<string | null>(null);
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>("none");
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);

  const peers = useRef<Map<string, PeerEntry>>(new Map());
  const speakerTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const activeSpeakers = useRef<Set<string>>(new Set());
  const bgProcessor = useRef<BackgroundProcessor | null>(null);

  const pinnedPubkeyRef = useRef<string | null>(null);
  pinnedPubkeyRef.current = pinnedPubkey;

  const updateActiveVideo = useCallback(() => {
    const active = new Set<string>();
    if (pinnedPubkeyRef.current) active.add(pinnedPubkeyRef.current);
    for (const pk of activeSpeakers.current) {
      if (active.size >= MAX_ACTIVE) break;
      active.add(pk);
    }
    for (const [pk, entry] of peers.current) {
      const remote = entry.conn.getReceivers().find(r => r.track.kind === "video");
      if (remote) remote.track.enabled = active.has(pk);
    }
  }, []);

  useEffect(() => {
    for (const pk of voiceSpeakingPubkeys) {
      const existing = speakerTimers.current.get(pk);
      if (existing) clearTimeout(existing);
      speakerTimers.current.delete(pk);
      activeSpeakers.current.add(pk);
    }
    updateActiveVideo();

    for (const pk of activeSpeakers.current) {
      if (!voiceSpeakingPubkeys.has(pk) && !speakerTimers.current.has(pk)) {
        const t = setTimeout(() => {
          activeSpeakers.current.delete(pk);
          speakerTimers.current.delete(pk);
          updateActiveVideo();
        }, LINGER_MS);
        speakerTimers.current.set(pk, t);
      }
    }
  }, [voiceSpeakingPubkeys, updateActiveVideo]);

  function sendWs(payload: object) {
    invoke("send_hub_ws_raw", { payload: JSON.stringify(payload) }).catch(console.warn);
  }

  const processedStreamRef = useRef<MediaStream | null>(null);
  processedStreamRef.current = processedStream;

  const voiceChannelIdRef = useRef<string | null>(null);
  voiceChannelIdRef.current = voiceChannelId;

  function createPeer(remotePubkey: string): RTCPeerConnection {
    const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    conn.onicecandidate = (e) => {
      if (e.candidate && voiceChannelIdRef.current) {
        sendWs({
          type: "video_ice",
          channel_id: voiceChannelIdRef.current,
          to_pubkey: remotePubkey,
          candidate: JSON.stringify(e.candidate),
        });
      }
    };

    conn.ontrack = (e) => {
      setRemoteStreams(prev => new Map(prev).set(remotePubkey, e.streams[0]));
      updateActiveVideo();
    };

    conn.onconnectionstatechange = () => {
      if (conn.connectionState === "failed" || conn.connectionState === "closed") {
        peers.current.delete(remotePubkey);
        setRemoteStreams(prev => {
          const m = new Map(prev);
          m.delete(remotePubkey);
          return m;
        });
      }
    };

    const stream = processedStreamRef.current;
    if (stream) {
      stream.getTracks().forEach(t => conn.addTrack(t, stream));
    }

    peers.current.set(remotePubkey, { conn, stream: null });
    return conn;
  }

  async function initiateOffer(remotePubkey: string) {
    if (!voiceChannelIdRef.current || peers.current.has(remotePubkey)) return;
    const conn = createPeer(remotePubkey);
    const offer = await conn.createOffer();
    await conn.setLocalDescription(offer);
    sendWs({
      type: "video_offer",
      channel_id: voiceChannelIdRef.current,
      to_pubkey: remotePubkey,
      sdp: offer.sdp,
    });
  }

  useEffect(() => {
    if (!activeHubId) return;
    const unsubs: Array<() => void> = [];

    listen<{ hub_id: string; channel_id: string; pubkey: string }>("video-participant-enabled", async (e) => {
      if (e.payload.hub_id !== activeHubId) return;
      const pk = e.payload.pubkey;
      setVideoPubkeys(prev => new Set(prev).add(pk));
      if (publicKey && pk !== publicKey && publicKey < pk) {
        await initiateOffer(pk);
      }
    }).then(u => unsubs.push(u));

    listen<{ hub_id: string; channel_id: string; pubkey: string }>("video-participant-disabled", (e) => {
      if (e.payload.hub_id !== activeHubId) return;
      const pk = e.payload.pubkey;
      setVideoPubkeys(prev => {
        const s = new Set(prev);
        s.delete(pk);
        return s;
      });
      const entry = peers.current.get(pk);
      if (entry) {
        entry.conn.close();
        peers.current.delete(pk);
      }
      setRemoteStreams(prev => {
        const m = new Map(prev);
        m.delete(pk);
        return m;
      });
    }).then(u => unsubs.push(u));

    listen<{ hub_id: string; channel_id: string; pubkeys: string[] }>("video-participants", async (e) => {
      if (e.payload.hub_id !== activeHubId) return;
      const pks = e.payload.pubkeys;
      setVideoPubkeys(new Set(pks));
      if (videoEnabled && publicKey) {
        for (const pk of pks) {
          if (pk !== publicKey && publicKey < pk) await initiateOffer(pk);
        }
      }
    }).then(u => unsubs.push(u));

    listen<{ hub_id: string; from_pubkey: string; to_pubkey: string; sdp: string }>("video-offer-in", async (e) => {
      if (e.payload.hub_id !== activeHubId || e.payload.to_pubkey !== publicKey) return;
      const from = e.payload.from_pubkey;
      if (!peers.current.has(from)) createPeer(from);
      const entry = peers.current.get(from)!;
      await entry.conn.setRemoteDescription({ type: "offer", sdp: e.payload.sdp });
      const answer = await entry.conn.createAnswer();
      await entry.conn.setLocalDescription(answer);
      if (voiceChannelIdRef.current) {
        sendWs({
          type: "video_answer",
          channel_id: voiceChannelIdRef.current,
          to_pubkey: from,
          sdp: answer.sdp,
        });
      }
    }).then(u => unsubs.push(u));

    listen<{ hub_id: string; from_pubkey: string; to_pubkey: string; sdp: string }>("video-answer-in", async (e) => {
      if (e.payload.hub_id !== activeHubId || e.payload.to_pubkey !== publicKey) return;
      const entry = peers.current.get(e.payload.from_pubkey);
      if (entry) await entry.conn.setRemoteDescription({ type: "answer", sdp: e.payload.sdp });
    }).then(u => unsubs.push(u));

    listen<{ hub_id: string; from_pubkey: string; to_pubkey: string; candidate: string }>("video-ice-in", async (e) => {
      if (e.payload.hub_id !== activeHubId || e.payload.to_pubkey !== publicKey) return;
      const entry = peers.current.get(e.payload.from_pubkey);
      if (entry) {
        try {
          await entry.conn.addIceCandidate(JSON.parse(e.payload.candidate) as RTCIceCandidateInit);
        } catch {}
      }
    }).then(u => unsubs.push(u));

    return () => unsubs.forEach(u => u());
  }, [activeHubId, voiceChannelId, publicKey, videoEnabled, processedStream]);

  async function enableVideo(deviceId?: string) {
    if (!voiceChannelIdRef.current) return;
    try {
      const videoConstraint = deviceId ? { deviceId: { exact: deviceId } } : true;
      const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraint, audio: false });
      setRawStream(stream);
      const proc = new BackgroundProcessor(stream);
      bgProcessor.current = proc;
      const out = await proc.start(backgroundMode, backgroundImage);
      setProcessedStream(out);
      setVideoEnabled(true);
      sendWs({ type: "video_enable", channel_id: voiceChannelIdRef.current });
    } catch (e) {
      console.error("Camera access denied:", e);
    }
  }

  async function disableVideo() {
    if (!voiceChannelIdRef.current) return;
    sendWs({ type: "video_disable", channel_id: voiceChannelIdRef.current });
    rawStream?.getTracks().forEach(t => t.stop());
    bgProcessor.current?.stop();
    bgProcessor.current = null;
    setRawStream(null);
    setProcessedStream(null);
    setVideoEnabled(false);
    for (const [, entry] of peers.current) entry.conn.close();
    peers.current.clear();
    setRemoteStreams(new Map());
  }

  useEffect(() => {
    if (!voiceChannelId && videoEnabled) {
      disableVideo();
    }
  }, [voiceChannelId]);

  async function switchCamera(deviceId: string) {
    if (!voiceChannelIdRef.current) return;
    rawStream?.getTracks().forEach(t => t.stop());
    bgProcessor.current?.stop();
    bgProcessor.current = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } }, audio: false });
      setRawStream(stream);
      const proc = new BackgroundProcessor(stream);
      bgProcessor.current = proc;
      const out = await proc.start(backgroundMode, backgroundImage);
      setProcessedStream(out);
      for (const [, entry] of peers.current) {
        const sender = entry.conn.getSenders().find(s => s.track?.kind === "video");
        if (sender) sender.replaceTrack(out.getVideoTracks()[0]);
      }
    } catch (e) {
      console.error("Camera switch failed:", e);
    }
  }

  async function changeBackground(mode: BackgroundMode, image?: string | null) {
    setBackgroundMode(mode);
    if (image !== undefined) setBackgroundImage(image);
    if (bgProcessor.current) {
      await bgProcessor.current.setMode(mode, image ?? backgroundImage);
    }
  }

  return {
    videoEnabled,
    processedStream,
    remoteStreams,
    videoPubkeys,
    pinnedPubkey,
    setPinnedPubkey,
    backgroundMode,
    backgroundImage,
    enableVideo,
    disableVideo,
    switchCamera,
    changeBackground,
  };
}
