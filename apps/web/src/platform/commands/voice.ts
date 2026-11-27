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

// The room's stage (`voice.pins`): the same for everyone in the room.
/** `can_pin` is your own `voice.stage` in this channel. */
export async function listVoicePins(channelId: string): Promise<{ public_keys: string[]; can_pin: boolean }> {
  const res = await hubFetch(`/channels/${channelId}/voice-pins`);
  return (await res.json()) as { public_keys: string[]; can_pin: boolean };
}

export async function pinVoice(channelId: string, publicKey: string): Promise<void> {
  await hubFetch(`/channels/${channelId}/voice-pins/${publicKey}`, { method: "POST" });
}

/** Anyone off the stage (moderation.mute), or yourself. */
export async function unpinVoice(channelId: string, publicKey: string): Promise<void> {
  await hubFetch(`/channels/${channelId}/voice-pins/${publicKey}`, { method: "DELETE" });
}
