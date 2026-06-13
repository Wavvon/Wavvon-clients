import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useState, useEffect, useMemo } from "react";
import type { Channel, VoiceParticipant, VoiceMuteInfo, ScreenShareOpts } from "../types";
import { useScreenShare } from "./useScreenShare";
import { useScreenShareViewer } from "./useScreenShareViewer";
import { useHubStreams } from "./useHubStreams";
import { playVoiceTone } from "../utils/audio";

interface UseVoiceParams {
  activeHubId: string | null;
  selectedChannel: Channel | null;
  setError: (msg: string) => void;
  setToast: (msg: string) => void;
}

export function useVoice({ activeHubId, selectedChannel, setError, setToast }: UseVoiceParams) {
  const [voiceChannelId, setVoiceChannelId] = useState<string | null>(null);
  const [selfMuted, setSelfMuted] = useState(false);
  const [selfDeafened, setSelfDeafened] = useState(false);
  const [speakingPubkeys, setSpeakingPubkeys] = useState<Set<string>>(new Set());
  const [voicePartByChannel, setVoicePartByChannel] = useState<Record<string, VoiceParticipant[]>>({});
  const [voiceActiveUsers, setVoiceActiveUsers] = useState<Set<string>>(new Set());
  const [voiceInputDevice, setVoiceInputDevice] = useState<string>("");
  const [voiceOutputDevice, setVoiceOutputDevice] = useState<string>("");
  const [vadThreshold, setVadThreshold] = useState<number>(0.02);
  const [voiceMode, setVoiceMode] = useState<"vad" | "ptt">("vad");
  const [pttKey, setPttKey] = useState<string>("Space");
  const [audioProfile, setAudioProfile] = useState<"standard" | "music" | "custom">("standard");
  const [customBitrate, setCustomBitrate] = useState<number | null>(null);
  const [customApp, setCustomApp] = useState<"voip" | "audio" | "lowdelay">("voip");
  const [customNoiseSuppress, setCustomNoiseSuppress] = useState(true);
  const [customVad, setCustomVad] = useState(true);
  const [customVadThreshold, setCustomVadThreshold] = useState(0.02);
  const [customChannels, setCustomChannels] = useState<1 | 2>(1);
  const [customFrameMs, setCustomFrameMs] = useState<20 | 40 | 60>(20);
  const [customComplexity, setCustomComplexity] = useState(5);
  const [micTesting, setMicTesting] = useState(false);
  const [micLevel, setMicLevel] = useState<number>(0);
  const [audioInputs, setAudioInputs] = useState<string[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<string[]>([]);
  // Browser-enumerated audio output devices (for setSinkId on <video> elements).
  const [mediaOutputDevices, setMediaOutputDevices] = useState<{ deviceId: string; label: string }[]>([]);
  const [mediaOutputDeviceId, setMediaOutputDeviceIdState] = useState<string>(
    () => localStorage.getItem("voxply.mediaOutputDeviceId") ?? ""
  );
  const [adminVoiceMutes, setAdminVoiceMutes] = useState<VoiceMuteInfo[]>([]);
  const voiceMutedKeys = useMemo(
    () => new Set(adminVoiceMutes.map((v) => v.target_public_key)),
    [adminVoiceMutes],
  );
  const [showSharePicker, setShowSharePicker] = useState(false);

  const [voiceGains, setVoiceGainsState] = useState<Record<string, number>>(() => {
    try {
      const stored = localStorage.getItem("voxply.voiceGains");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  async function setVoiceGain(publicKey: string, gainPct: number) {
    const gain = Math.max(0, Math.min(200, gainPct)) / 100;
    const next = { ...voiceGains, [publicKey]: gainPct };
    if (gainPct === 100) delete next[publicKey];
    setVoiceGainsState(next);
    try {
      localStorage.setItem("voxply.voiceGains", JSON.stringify(next));
      await invoke("set_voice_gain", { publicKey, gain });
    } catch (e) {
      console.error("set_voice_gain failed:", e);
    }
  }

  const { sharing, startShare, stopShare, kbps: shareKbps } = useScreenShare(voiceChannelId);
  const { streams: activeScreenShares, viewerRef: screenShareViewerRef } =
    useScreenShareViewer(voiceChannelId);
  const {
    hubStreams,
    crossChannelStreams,
    subscribeToStream,
    unsubscribeFromStream,
    subscribedStreamIds,
  } = useHubStreams(activeHubId, screenShareViewerRef);

  useEffect(() => {
    if (!activeHubId) {
      setVoicePartByChannel({});
      setVoiceActiveUsers(new Set());
      return;
    }
    let cancelled = false;
    async function tick() {
      try {
        const [parts, active] = await Promise.all([
          invoke<Record<string, VoiceParticipant[]>>("voice_channel_participants"),
          invoke<string[]>("voice_active_users"),
        ]);
        if (!cancelled) {
          setVoicePartByChannel(parts);
          setVoiceActiveUsers(new Set(active));
        }
      } catch {}
    }
    tick();
    const handle = setInterval(tick, 1500);
    let unlisten: (() => void) | undefined;
    listen<void>("voice-update", () => { if (!cancelled) tick(); }).then((fn) => { unlisten = fn; });

    let unlistenSpeaking: (() => void) | undefined;
    listen<{ public_key: string; speaking: boolean }>("voice-participant-speaking", (e) => {
      if (cancelled) return;
      const { public_key, speaking } = e.payload;
      setSpeakingPubkeys(prev => {
        const next = new Set(prev);
        if (speaking) next.add(public_key);
        else next.delete(public_key);
        return next;
      });
    }).then((fn) => { unlistenSpeaking = fn; });

    return () => {
      cancelled = true;
      clearInterval(handle);
      unlisten?.();
      unlistenSpeaking?.();
    };
  }, [activeHubId]);

  useEffect(() => {
    if (voiceMode !== "ptt" || voiceChannelId === null) return;

    function isInputTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable;
    }

    function down(e: KeyboardEvent) {
      if (e.code !== pttKey || e.repeat || isInputTarget(e.target)) return;
      e.preventDefault();
      invoke("voice_set_muted", { muted: false }).catch(() => {});
      setSelfMuted(false);
    }
    function up(e: KeyboardEvent) {
      if (e.code !== pttKey || isInputTarget(e.target)) return;
      e.preventDefault();
      invoke("voice_set_muted", { muted: true }).catch(() => {});
      setSelfMuted(true);
    }

    invoke("voice_set_muted", { muted: true }).catch(() => {});
    setSelfMuted(true);

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [voiceMode, voiceChannelId, pttKey]);

  async function loadVoiceSettings() {
    try {
      const devices = await invoke<{ inputs: string[]; outputs: string[] }>(
        "list_audio_devices",
      );
      setAudioInputs(devices.inputs);
      setAudioOutputs(devices.outputs);

      const saved = await invoke<{
        input_device?: string;
        output_device?: string;
        vad_threshold?: number;
        voice_mode?: string;
        ptt_key?: string;
        audio_profile?: string;
        custom_bitrate?: number | null;
        custom_app?: string;
        custom_noise_suppress?: boolean;
        custom_vad?: boolean;
        custom_vad_threshold?: number;
        custom_channels?: number;
        custom_frame_ms?: number;
        custom_complexity?: number;
      }>("get_voice_settings");
      setVoiceInputDevice(saved.input_device || "");
      setVoiceOutputDevice(saved.output_device || "");
      setVadThreshold(saved.vad_threshold ?? 0.02);
      setVoiceMode(saved.voice_mode === "ptt" ? "ptt" : "vad");
      setPttKey(saved.ptt_key || "Space");
      const prof = saved.audio_profile;
      setAudioProfile(prof === "music" ? "music" : prof === "custom" ? "custom" : "standard");
      setCustomBitrate(saved.custom_bitrate ?? null);
      setCustomApp(saved.custom_app === "audio" ? "audio" : saved.custom_app === "lowdelay" ? "lowdelay" : "voip");
      setCustomNoiseSuppress(saved.custom_noise_suppress ?? true);
      setCustomVad(saved.custom_vad ?? true);
      setCustomVadThreshold(saved.custom_vad_threshold ?? 0.02);
      setCustomChannels(saved.custom_channels === 2 ? 2 : 1);
      setCustomFrameMs(saved.custom_frame_ms === 40 ? 40 : saved.custom_frame_ms === 60 ? 60 : 20);
      setCustomComplexity(saved.custom_complexity ?? 5);
    } catch (e) {
      console.error("Failed to load voice settings:", e);
    }

    // Enumerate browser audio output devices for screen share audio routing.
    try {
      if (navigator.mediaDevices?.enumerateDevices) {
        const all = await navigator.mediaDevices.enumerateDevices();
        const outputs = all
          .filter((d) => d.kind === "audiooutput" && d.deviceId !== "")
          .map((d) => ({ deviceId: d.deviceId, label: d.label || d.deviceId }));
        setMediaOutputDevices(outputs);
      }
    } catch {
      // enumerateDevices not available — silently skip
    }
  }

  function setMediaOutputDeviceId(id: string) {
    setMediaOutputDeviceIdState(id);
    localStorage.setItem("voxply.mediaOutputDeviceId", id);
  }

  async function persistVoiceSettings(
    input: string,
    output: string,
    threshold: number,
    mode: "vad" | "ptt" = voiceMode,
    key: string = pttKey,
  ) {
    try {
      await invoke("save_voice_settings", {
        settings: {
          input_device: input || null,
          output_device: output || null,
          vad_threshold: threshold,
          voice_mode: mode,
          ptt_key: key,
          audio_profile: audioProfile,
          custom_bitrate: customBitrate,
          custom_app: customApp,
          custom_noise_suppress: customNoiseSuppress,
          custom_vad: customVad,
          custom_vad_threshold: customVadThreshold,
          custom_channels: customChannels,
          custom_frame_ms: customFrameMs,
          custom_complexity: customComplexity,
        },
      });
    } catch (e) {
      setError(String(e));
    }
  }

  async function persistAudioSettings(
    profile: "standard" | "music" | "custom" = audioProfile,
    bitrate: number | null = customBitrate,
    app: "voip" | "audio" | "lowdelay" = customApp,
    noiseSuppress: boolean = customNoiseSuppress,
    vad: boolean = customVad,
    vadThr: number = customVadThreshold,
    channels: 1 | 2 = customChannels,
    frameMs: 20 | 40 | 60 = customFrameMs,
    complexity: number = customComplexity,
  ) {
    try {
      await invoke("save_voice_settings", {
        settings: {
          input_device: voiceInputDevice || null,
          output_device: voiceOutputDevice || null,
          vad_threshold: vadThreshold,
          voice_mode: voiceMode,
          ptt_key: pttKey,
          audio_profile: profile,
          custom_bitrate: bitrate,
          custom_app: app,
          custom_noise_suppress: noiseSuppress,
          custom_vad: vad,
          custom_vad_threshold: vadThr,
          custom_channels: channels,
          custom_frame_ms: frameMs,
          custom_complexity: complexity,
        },
      });
    } catch (e) {
      setError(String(e));
    }
  }

  async function toggleMicTest() {
    try {
      if (micTesting) {
        await invoke("mic_test_stop");
        setMicTesting(false);
      } else {
        await invoke("mic_test_start");
        setMicTesting(true);
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function toggleSelfMute() {
    const next = !selfMuted;
    setSelfMuted(next);
    try {
      await invoke("voice_set_muted", { muted: next });
    } catch (e) {
      setError(String(e));
      setSelfMuted(!next);
    }
  }

  async function toggleSelfDeafen() {
    const next = !selfDeafened;
    setSelfDeafened(next);
    if (next && !selfMuted) setSelfMuted(true);
    try {
      await invoke("voice_set_deafened", { deafened: next });
    } catch (e) {
      setError(String(e));
      setSelfDeafened(!next);
    }
  }

  async function handleVoiceLeave() {
    try {
      await invoke("voice_leave");
      setVoiceChannelId(null);
      setSelfMuted(false);
      setSelfDeafened(false);
      playVoiceTone("down");
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleVoiceJoin(channel?: Channel) {
    const target = channel ?? selectedChannel;
    if (!target || target.is_category) return;
    try {
      await invoke("voice_join", { channelId: target.id });
      playVoiceTone("up");
    } catch (e) {
      setError(String(e));
    }
  }

  async function refreshVoiceMutes() {
    try {
      const v = await invoke<VoiceMuteInfo[]>("list_voice_mutes");
      setAdminVoiceMutes(v);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleVoiceMuteMember(publicKey: string) {
    const reason = prompt("Reason for voice mute (optional)") ?? "";
    try {
      await invoke("voice_mute_user_cmd", {
        targetPublicKey: publicKey,
        reason: reason.trim() || null,
      });
      setToast("Voice muted");
      await refreshVoiceMutes();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleVoiceUnmuteMember(publicKey: string) {
    try {
      await invoke("voice_unmute_user_cmd", { targetPublicKey: publicKey });
      setToast("Voice unmuted");
      await refreshVoiceMutes();
    } catch (e) {
      setError(String(e));
    }
  }

  function handleScreenShare() {
    if (sharing) {
      stopShare();
    } else {
      setShowSharePicker(true);
    }
  }

  async function handleShareStart(opts: ScreenShareOpts) {
    setShowSharePicker(false);
    await startShare(opts);
  }

  function onVoiceJoined(channelId: string, participants: VoiceParticipant[]) {
    setVoiceChannelId(channelId);
    setVoicePartByChannel((prev) => ({ ...prev, [channelId]: participants }));
  }

  function onParticipantJoined(channelId: string, participant: VoiceParticipant) {
    setVoicePartByChannel((prev) => {
      const existing = prev[channelId] ?? [];
      if (existing.some((p) => p.public_key === participant.public_key)) return prev;
      return { ...prev, [channelId]: [...existing, participant] };
    });
    setVoiceActiveUsers((prev) => {
      if (prev.has(participant.public_key)) return prev;
      const next = new Set(prev);
      next.add(participant.public_key);
      return next;
    });
  }

  function onParticipantLeft(channelId: string, publicKey: string) {
    setVoicePartByChannel((prev) => {
      const existing = prev[channelId];
      if (!existing) return prev;
      const next = existing.filter((p) => p.public_key !== publicKey);
      if (next.length === 0) {
        const { [channelId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [channelId]: next };
    });
    setVoiceActiveUsers((prev) => {
      if (!prev.has(publicKey)) return prev;
      const next = new Set(prev);
      next.delete(publicKey);
      return next;
    });
  }

  function onMicLevel(level: number) {
    setMicLevel(level);
  }

  async function onHubErrorVoiceJoin() {
    try {
      await invoke("voice_leave");
    } catch {}
    setVoiceChannelId(null);
  }

  return {
    voiceChannelId,
    selfMuted,
    selfDeafened,
    speakingPubkeys,
    voicePartByChannel,
    voiceActiveUsers,
    voiceInputDevice,
    voiceOutputDevice,
    vadThreshold,
    voiceMode,
    pttKey,
    audioInputs,
    audioOutputs,
    mediaOutputDevices,
    mediaOutputDeviceId,
    setMediaOutputDeviceId,
    micTesting,
    micLevel,
    adminVoiceMutes,
    voiceMutedKeys,
    showSharePicker,
    setShowSharePicker,
    sharing,
    startShare,
    stopShare,
    shareKbps,
    activeScreenShares,
    crossChannelStreams,
    screenShareViewerRef,
    hubStreams,
    subscribeToStream,
    unsubscribeFromStream,
    subscribedStreamIds,
    audioProfile,
    setAudioProfile,
    customBitrate,
    setCustomBitrate,
    customApp,
    setCustomApp,
    customNoiseSuppress,
    setCustomNoiseSuppress,
    customVad,
    setCustomVad,
    customVadThreshold,
    setCustomVadThreshold,
    customChannels,
    setCustomChannels,
    customFrameMs,
    setCustomFrameMs,
    customComplexity,
    setCustomComplexity,
    loadVoiceSettings,
    persistVoiceSettings,
    persistAudioSettings,
    toggleMicTest,
    toggleSelfMute,
    toggleSelfDeafen,
    handleVoiceJoin,
    handleVoiceLeave,
    refreshVoiceMutes,
    handleVoiceMuteMember,
    handleVoiceUnmuteMember,
    handleScreenShare,
    handleShareStart,
    setVoiceInputDevice,
    setVoiceOutputDevice,
    setVadThreshold,
    setVoiceMode,
    setPttKey,
    setMicTesting,
    onVoiceJoined,
    onParticipantJoined,
    onParticipantLeft,
    onMicLevel,
    onHubErrorVoiceJoin,
    voiceGains,
    setVoiceGain,
  };
}
