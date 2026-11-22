import { hubFetch, HubApiError } from "../http";
import { activeHubCapabilities, activeSession } from "../session";
import { fetchAllPages } from "./paged";
import type { SoundboardClip } from "../../types";

/** The whole clip library. A hub has no cap on clips, so `/soundboard` pages
 *  (Wavvon-server#448); a hub from before that answers with every clip, at
 *  most 50, which is a short first page and ends the walk. */
export async function listSoundboardClips(): Promise<SoundboardClip[]> {
  return fetchAllPages<SoundboardClip>({
    capabilities: activeHubCapabilities(),
    capability: "list.cursor",
    pageSize: 100,
    maxPages: 100,
    cursorOf: (c) => c.id,
    fetchPage: async (params) =>
      (await (await hubFetch(params ? `/soundboard?${params}` : "/soundboard")).json()) as SoundboardClip[],
    label: "listSoundboardClips",
  });
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
