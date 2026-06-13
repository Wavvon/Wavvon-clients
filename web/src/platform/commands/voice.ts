import { hubFetch } from "../http";
import type { VoiceParticipant } from "../../types";

export async function fetchVoiceRoster(): Promise<Record<string, VoiceParticipant[]>> {
  const res = await hubFetch("/voice/participants");
  return res.json() as Promise<Record<string, VoiceParticipant[]>>;
}
