import { hubFetch, rawFetch } from "../http";
import type {
  HubSelfTagSettings,
  HubBadge,
  PendingBadgeOffer,
  CertIssuance,
  CertAdmissionSettings,
  RecoverySettings,
  RecoveryRotationRequest,
} from "../../types";

// ---- Discovery / self-tags ----

export async function getDiscoveryTags(): Promise<HubSelfTagSettings> {
  const r = await hubFetch("/admin/discovery/tags");
  return r.json() as Promise<HubSelfTagSettings>;
}

export async function setDiscoveryTags(tags: string[], nsfw: boolean): Promise<void> {
  await hubFetch("/admin/discovery", {
    method: "PATCH",
    body: JSON.stringify({ self_tags: tags, nsfw }),
  });
}

export async function submitToDirectory(
  directoryUrl: string,
  tags: string[],
  language: string,
  bio: string,
  inviteCode: string | null,
): Promise<void> {
  const body: Record<string, unknown> = { tags, language, bio };
  if (inviteCode) body["invite_code"] = inviteCode;
  await rawFetch(`${directoryUrl}/api/hubs/submit`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ---- Badges ----

export async function listBadges(): Promise<HubBadge[]> {
  const r = await hubFetch("/admin/badges");
  return r.json() as Promise<HubBadge[]>;
}

export async function listPendingBadges(): Promise<PendingBadgeOffer[]> {
  const r = await hubFetch("/admin/badges/pending");
  return r.json() as Promise<PendingBadgeOffer[]>;
}

export async function acceptBadge(id: string): Promise<void> {
  await hubFetch(`/admin/badges/pending/${id}/accept`, { method: "POST", body: JSON.stringify({}) });
}

export async function declineBadge(id: string): Promise<void> {
  await hubFetch(`/admin/badges/pending/${id}/decline`, { method: "POST", body: JSON.stringify({}) });
}

export async function removeBadge(id: string): Promise<void> {
  await hubFetch(`/admin/badges/${id}`, { method: "DELETE" });
}

export async function grantBadge(targetHubUrl: string, label: string): Promise<void> {
  await hubFetch("/admin/badges/grant", {
    method: "POST",
    body: JSON.stringify({ target_hub_url: targetHubUrl, label }),
  });
}

// ---- Hub certifications ----

export async function listCertIssuances(): Promise<CertIssuance[]> {
  const r = await hubFetch("/admin/certs");
  return r.json() as Promise<CertIssuance[]>;
}

export async function getCertSettings(): Promise<CertAdmissionSettings> {
  const r = await hubFetch("/admin/settings/certs");
  return r.json() as Promise<CertAdmissionSettings>;
}

export async function saveCertSettings(settings: Partial<CertAdmissionSettings>): Promise<void> {
  await hubFetch("/admin/settings/certs", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

export async function issueCertManual(subjectPubkey: string): Promise<void> {
  await hubFetch(`/admin/certs/${subjectPubkey}`, { method: "POST" });
}

export async function revokeCert(subjectPubkey: string): Promise<void> {
  await hubFetch(`/admin/certs/${subjectPubkey}/revoke`, { method: "POST" });
}

export async function fetchMyCert(hubUrl: string): Promise<unknown> {
  const r = await rawFetch(`${hubUrl}/certs/me`);
  return r.json();
}

// ---- Recovery contacts ----

export async function getRecoveryContacts(): Promise<RecoverySettings> {
  const r = await hubFetch("/recovery/contacts");
  return r.json() as Promise<RecoverySettings>;
}

export async function setRecoveryContacts(threshold: number, contactPubkeys: string[]): Promise<void> {
  await hubFetch("/recovery/contacts", {
    method: "PUT",
    body: JSON.stringify({ threshold, contacts: contactPubkeys }),
  });
}

export async function removeRecoveryContact(pubkey: string): Promise<void> {
  await hubFetch(`/recovery/contacts/${encodeURIComponent(pubkey)}`, { method: "DELETE" });
}

export async function listAdminRecoveryRequests(): Promise<RecoveryRotationRequest[]> {
  const r = await hubFetch("/admin/recovery/pending");
  return r.json() as Promise<RecoveryRotationRequest[]>;
}

export async function approveRecoveryRequest(requestId: string): Promise<void> {
  await hubFetch(`/admin/recovery/${requestId}/approve`, { method: "POST" });
}

export async function denyRecoveryRequest(requestId: string): Promise<void> {
  await hubFetch(`/admin/recovery/${requestId}/deny`, { method: "POST" });
}

// ---- Block / DM-blocks ----

export async function updateDmBlocks(blockedPubkeys: string[]): Promise<void> {
  await hubFetch("/identity/dm-blocks", {
    method: "PUT",
    body: JSON.stringify({ blocked_pubkeys: blockedPubkeys }),
  });
}

// ---- Channel reorder / reparent ----

export async function moveChannel(channelId: string, parentId: string | null): Promise<void> {
  await hubFetch(`/channels/${channelId}`, {
    method: "PATCH",
    body: JSON.stringify({ parent_id: parentId }),
  });
}

export async function reorderChannels(channelIds: string[]): Promise<void> {
  await hubFetch("/channels/reorder", {
    method: "POST",
    body: JSON.stringify({ channel_ids: channelIds }),
  });
}

// ---- Hub overview settings ----

export async function saveHubSettings(settings: {
  name?: string;
  description?: string;
  icon?: string;
  require_approval?: boolean;
  min_security_level?: number;
  max_channel_depth?: number;
}): Promise<void> {
  await hubFetch("/hub", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

export async function getHubSettings(): Promise<{
  hub_name: string;
  hub_description: string;
  hub_icon: string;
  require_approval: boolean;
  min_security_level: number;
  max_channel_depth: number;
}> {
  const [settingsRes, infoRes] = await Promise.all([
    hubFetch("/hub/settings").then((r) => r.json() as Promise<{
      require_approval: boolean;
      invite_only: boolean;
      min_security_level: number;
      max_channel_depth: number;
    }>),
    hubFetch("/info").then((r) => r.json() as Promise<{
      name: string;
      description?: string | null;
      icon?: string | null;
    }>),
  ]);
  return {
    hub_name: infoRes.name,
    hub_description: infoRes.description ?? "",
    hub_icon: infoRes.icon ?? "",
    require_approval: settingsRes.require_approval,
    min_security_level: settingsRes.min_security_level,
    max_channel_depth: settingsRes.max_channel_depth,
  };
}
