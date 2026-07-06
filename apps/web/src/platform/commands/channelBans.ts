import { hubFetch } from "../http";

export interface ChannelBan {
  channel_id: string;
  pubkey: string;
  banned_by: string;
  banned_at: string;
}

// Per-channel bans (v2, keyed by pubkey; requires BAN_MEMBERS).
export async function listChannelBans(channelId: string): Promise<ChannelBan[]> {
  const r = await hubFetch(`/channels/${channelId}/bans`);
  return r.json() as Promise<ChannelBan[]>;
}

export async function banFromChannel(channelId: string, pubkey: string): Promise<void> {
  await hubFetch(`/channels/${channelId}/bans`, {
    method: "POST",
    body: JSON.stringify({ pubkey }),
  });
}

export async function unbanFromChannel(channelId: string, pubkey: string): Promise<void> {
  await hubFetch(`/channels/${channelId}/bans/${pubkey}`, { method: "DELETE" });
}
