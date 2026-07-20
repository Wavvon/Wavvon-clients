import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import type { SoundboardClip } from "../types";
import type { SoundboardAdminSectionActions } from "@wavvon/ui";

function arrayBufferToBase64(buf: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Soundboard: hub clip library + mixing a clip into the active voice
 *  session's outbound stream (soundboard.md §1). Decode/mix happens
 *  entirely on the Rust side (`soundboard_play_clip`); this hook only
 *  proxies the hub routes and tracks the "something is playing" UI lock. */
export function useSoundboard(voiceChannelId: string | null) {
  const [playingClipId, setPlayingClipId] = useState<string | null>(null);

  function listClips(): Promise<SoundboardClip[]> {
    return invoke<SoundboardClip[]>("soundboard_list_clips");
  }

  function triggerClip(clip: SoundboardClip) {
    if (playingClipId || !voiceChannelId) return;
    setPlayingClipId(clip.id);
    invoke("soundboard_play_clip", { clipId: clip.id, channelId: voiceChannelId }).catch(() => {
      setPlayingClipId((cur) => (cur === clip.id ? null : cur));
    });
    // ponytail: the audio pipeline has no "clip finished" callback back to
    // JS, so the playing-lock clears on a timer sized to the clip's own
    // duration rather than a real end-of-playback event. Upgrade: emit a
    // Tauri event from the send task when it drains the clip.
    setTimeout(() => {
      setPlayingClipId((cur) => (cur === clip.id ? null : cur));
    }, clip.duration_ms + 250);
  }

  const soundboardActions: SoundboardAdminSectionActions = {
    listSoundboardClips: listClips,
    uploadSoundboardClip: async (name, emoji, audio) => {
      const buf = await audio.arrayBuffer();
      return invoke<SoundboardClip>("soundboard_upload_clip", {
        name,
        emoji,
        audioB64: arrayBufferToBase64(buf),
      });
    },
    deleteSoundboardClip: (id) => invoke("soundboard_delete_clip", { clipId: id }),
    fetchSoundboardAudioBytes: async (clipId) => {
      const b64 = await invoke<string>("soundboard_fetch_audio", { clipId });
      return base64ToArrayBuffer(b64);
    },
  };

  return { listClips, triggerClip, playingClipId, soundboardActions };
}
