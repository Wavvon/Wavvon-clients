import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useState, useEffect, useMemo } from "react";
import type { Channel, VoiceParticipant, VoiceMuteInfo, ScreenShareOpts } from "../types";
import { useScreenShare } from "./useScreenShare";
import { useScreenShareViewer } from "./useScreenShareViewer";
import { playVoiceTone } from "@voxply/core";

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
  const [micTesting, setMicTesting] = useState(false);
  const [micLevel, setMicLevel] = useState<number>(0);
  const [audioInputs, setAudioInputs] = useState<string[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<string[]>([]);
  const [adminVoiceMutes, setAdminVoiceMutes] = useState<VoiceMuteInfo[]>([]);
  const voiceMutedKeys = useMemo(
    () => new Set(adminVoiceMutes.map((v) => v.target_public_key)),
    [adminVoiceMutes],
  );
  const [showSharePicker, setShowSharePicker] = useState(false);

  const { sharing, startShare, stopShare, kbps: shareKbps } = useScreenShare(voiceChannelId);
  const { streams: activeScreenShares, viewerRef: screenShareViewerRef } =
    useScreenShareViewer(voiceChannelId);

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
    let unlistenJoined: (() => void) | undefined;
    let unlistenLeft: (() => void) | undefined;
    listen("voice-participant-joined", () => { if (!cancelled) tick(); }).then((fn) => { unlistenJoined = fn; });
    listen("voice-participant-left", () => { if (!cancelled) tick(); }).then((fn) => { unlistenLeft = fn; });

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
      unlistenJoined?.();
      unlistenLeft?.();
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
      }>("get_voice_settings");
      setVoiceInputDevice(saved.input_device || "");
      setVoiceOutputDevice(saved.output_device || "");
      setVadThreshold(saved.vad_threshold ?? 0.02);
      setVoiceMode(saved.voice_mode === "ptt" ? "ptt" : "vad");
      setPttKey(saved.ptt_key || "Space");
    } catch (e) {
      console.error("Failed to load voice settings:", e);
    }
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
    screenShareViewerRef,
    loadVoiceSettings,
    persistVoiceSettings,
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
  };
}
