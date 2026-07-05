import { hubFetch } from "../http";

export interface Alliance {
  id: string;
  name: string;
  created_by: string;
  created_at: number;
}

export interface AllianceMember {
  hub_public_key: string;
  hub_name: string;
  hub_url: string;
  joined_at: number;
}

export interface AllianceDetail extends Alliance {
  members: AllianceMember[];
}

export interface PendingAllianceInvite {
  id: string;
  alliance_id: string;
  alliance_name: string;
  from_hub_url: string;
  from_hub_name: string;
  from_hub_public_key: string;
  invite_token: string;
  created_at: number;
  message: string | null;
}

export async function listAlliances(): Promise<Alliance[]> {
  const r = await hubFetch("/alliances");
  return r.json() as Promise<Alliance[]>;
}

export async function createAlliance(name: string): Promise<Alliance> {
  const r = await hubFetch("/alliances", { method: "POST", body: JSON.stringify({ name }) });
  return r.json() as Promise<Alliance>;
}

export async function getAlliance(allianceId: string): Promise<AllianceDetail> {
  const r = await hubFetch(`/alliances/${allianceId}`);
  return r.json() as Promise<AllianceDetail>;
}

export async function leaveAlliance(allianceId: string): Promise<void> {
  await hubFetch(`/alliances/${allianceId}/leave`, { method: "DELETE" });
}

export async function listPendingAllianceInvites(): Promise<PendingAllianceInvite[]> {
  const r = await hubFetch("/alliances/pending-invites");
  return r.json() as Promise<PendingAllianceInvite[]>;
}

export async function acceptAllianceInvite(inviteId: string, ownHubUrl: string): Promise<AllianceDetail> {
  const r = await hubFetch(`/alliances/pending-invites/${inviteId}/accept`, {
    method: "POST",
    body: JSON.stringify({ own_hub_url: ownHubUrl }),
  });
  return r.json() as Promise<AllianceDetail>;
}

export async function declineAllianceInvite(inviteId: string): Promise<void> {
  await hubFetch(`/alliances/pending-invites/${inviteId}`, { method: "DELETE" });
}

export interface SharedChannel {
  channel_id: string;
  channel_name: string;
  hub_public_key: string;
  hub_name: string;
  channel_type: "text" | "forum" | "banner" | "spawner";
  parent_id: string | null;
  is_category: boolean;
}

export async function listAllianceSharedChannels(allianceId: string): Promise<SharedChannel[]> {
  const r = await hubFetch(`/alliances/${allianceId}/channels`);
  return r.json() as Promise<SharedChannel[]>;
}

export async function shareChannelWithAlliance(
  allianceId: string,
  channelId: string,
  includeDescendants = false,
): Promise<void> {
  await hubFetch(`/alliances/${allianceId}/channels`, {
    method: "POST",
    body: JSON.stringify({ channel_id: channelId, include_descendants: includeDescendants }),
  });
}

export async function unshareChannelFromAlliance(allianceId: string, channelId: string): Promise<void> {
  await hubFetch(`/alliances/${allianceId}/channels/${channelId}`, { method: "DELETE" });
}
