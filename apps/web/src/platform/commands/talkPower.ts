import { hubFetch } from "../http";

interface TalkPowerResponse {
  channel_id: string;
  min_talk_power: number;
}

// Minimum role talk_power required to speak in a voice channel (ADMIN to set).
export async function getTalkPower(channelId: string): Promise<number> {
  const r = await hubFetch(`/channels/${channelId}/talk-power`);
  const body = (await r.json()) as TalkPowerResponse;
  return body.min_talk_power;
}

export async function setTalkPower(channelId: string, minTalkPower: number): Promise<void> {
  await hubFetch(`/channels/${channelId}/talk-power`, {
    method: "POST",
    body: JSON.stringify({ min_talk_power: minTalkPower }),
  });
}
