import { hubFetch, HubApiError } from "../http";
import { activeSession } from "../session";
import type { SoundboardClip } from "../../types";

export async function listSoundboardClips(): Promise<SoundboardClip[]> {
  const res = await hubFetch("/soundboard");
  return res.json() as Promise<SoundboardClip[]>;
}

export async function uploadSoundboardClip(
  name: string,
  emoji: string | null,
  audio: File | Blob,
): Promise<SoundboardClip> {
  const { hub_url, token } = activeSession();
  const form = new FormData();
  form.append("name", name);
  if (emoji) form.append("emoji", emoji);
  form.append("audio", audio, audio instanceof File ? audio.name : "clip.ogg");
  const res = await fetch(`${hub_url}/soundboard`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new HubApiError(res.status, text || res.statusText);
  }
  return res.json() as Promise<SoundboardClip>;
}

export async function deleteSoundboardClip(id: string): Promise<void> {
  await hubFetch(`/soundboard/${id}`, { method: "DELETE" });
}

export async function markSoundboardPlayed(clipId: string, channelId: string): Promise<void> {
  await hubFetch(`/soundboard/${clipId}/played`, {
    method: "POST",
    body: JSON.stringify({ channel_id: channelId }),
  });
}

/** Relative API path for a clip's audio bytes. `GET` requires the same
 *  Bearer auth as every other hub route, so it can't be used directly as an
 *  `<audio src>` — fetch it with `fetchSoundboardAudioBytes` instead. */
export function soundboardAudioPath(clipId: string): string {
  return `/soundboard/${clipId}/audio`;
}

export async function fetchSoundboardAudioBytes(clipId: string): Promise<ArrayBuffer> {
  const res = await hubFetch(soundboardAudioPath(clipId));
  return res.arrayBuffer();
}
