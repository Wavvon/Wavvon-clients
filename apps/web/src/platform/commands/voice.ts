import { hubFetch } from "../http";
import type { VoiceParticipant } from "../../types";

export async function fetchVoiceRoster(): Promise<Record<string, VoiceParticipant[]>> {
  const res = await hubFetch("/voice/participants");
  return res.json() as Promise<Record<string, VoiceParticipant[]>>;
}

// The floor in a room with a talk-power threshold (moderation.md, raise hand).
export async function raiseHand(channelId: string): Promise<void> {
  await hubFetch(`/channels/${channelId}/raise-hand`, { method: "POST" });
}

/** Your own hand, or (with moderation.mute) anyone's. */
export async function lowerHand(channelId: string, publicKey: string): Promise<void> {
  await hubFetch(`/channels/${channelId}/raise-hand/${publicKey}`, { method: "DELETE" });
}

export async function grantTalk(channelId: string, publicKey: string): Promise<void> {
  await hubFetch(`/channels/${channelId}/talk-grants/${publicKey}`, { method: "POST" });
}

export async function listRaisedHands(channelId: string): Promise<string[]> {
  const res = await hubFetch(`/channels/${channelId}/raise-hands`);
  return ((await res.json()) as { pubkey: string }[]).map((h) => h.pubkey);
}
