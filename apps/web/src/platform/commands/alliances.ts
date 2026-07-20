import { hubFetch } from "../http";
import type { Alliance, AllianceMember, AllianceDetail, AllianceInvite, PendingAllianceInvite, SharedChannel } from "@wavvon/ui";

export type { Alliance, AllianceMember, AllianceDetail, AllianceInvite, PendingAllianceInvite, SharedChannel };

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

/** Mints a signed invite token for this alliance (admin-only). `hub_url` in
 *  the response is always "self" from the issuing hub's point of view — the
 *  caller pairs the token with its own known hub URL. */
export async function createAllianceInvite(allianceId: string): Promise<AllianceInvite> {
  const r = await hubFetch(`/alliances/${allianceId}/invite`, { method: "POST" });
  return r.json() as Promise<AllianceInvite>;
}

/** Pushes a direct invite to another hub's federation endpoint (admin-only). */
export async function sendAlliancePushInvite(
  allianceId: string,
  targetHubUrl: string,
  ownHubUrl: string,
  message: string | null,
): Promise<void> {
  await hubFetch(`/alliances/${allianceId}/push-invite`, {
    method: "POST",
    body: JSON.stringify({ target_hub_url: targetHubUrl, own_hub_url: ownHubUrl, message }),
  });
}

/** Joins an alliance from a pasted share code: calls out to the inviter to
 *  register, then mirrors the alliance locally (`join_alliance_local` on the
 *  hub — note this is `POST /alliances/join`, not `/alliances/{id}/join`;
 *  the latter is a federation-only, hub-to-hub endpoint). */
export async function joinAllianceByCode(
  inviterHubUrl: string,
  allianceId: string,
  inviteToken: string,
  ownHubUrl: string,
): Promise<AllianceDetail> {
  const r = await hubFetch("/alliances/join", {
    method: "POST",
    body: JSON.stringify({
      inviter_hub_url: inviterHubUrl,
      alliance_id: allianceId,
      invite_token: inviteToken,
      own_hub_url: ownHubUrl,
    }),
  });
  return r.json() as Promise<AllianceDetail>;
}
