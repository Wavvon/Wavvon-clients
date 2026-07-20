import { hubFetch, rawFetch } from "../http";
import type {
  HubSelfTagSettings,
  HubBadge,
  PendingBadgeOffer,
  RecoverySettings,
  RecoveryAdminRequest,
  RecoveryRequestBundle,
  InviteInfo,
} from "../../types";
import type { CertIssuance, CertAdmissionSettings } from "@wavvon/ui";
import { signRecoveryRequest, signRecoveryAttestation, masterSeedHex, masterPublicKeyHex } from "@wavvon/core";
import { loadIdentity } from "../../identity/store";

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

export async function listAdminRecoveryRequests(): Promise<RecoveryAdminRequest[]> {
  const r = await hubFetch("/admin/recovery/pending");
  return r.json() as Promise<RecoveryAdminRequest[]>;
}

export async function approveRecoveryRequest(requestId: string): Promise<void> {
  await hubFetch(`/admin/recovery/${requestId}/approve`, { method: "POST" });
}

export async function denyRecoveryRequest(requestId: string): Promise<void> {
  await hubFetch(`/admin/recovery/${requestId}/deny`, { method: "POST" });
}

// ---- Recovery: rotation-request open/status/attest. Unauthenticated on the
// hub (the requester/a contact may hold no session there at all) — plain
// rawFetch rather than hubFetch's active-session auth. ----

async function hubPublicKey(hubUrl: string): Promise<string> {
  const r = await rawFetch(`${hubUrl.replace(/\/$/, "")}/info`);
  const info = (await r.json()) as { public_key: string };
  return info.public_key;
}

/** This device's active identity always opens the request as the new key
 *  (identity-recovery.md — "O-new opens the request"); `oldPubkey` is the
 *  lost identity the caller remembers or was told out-of-band. */
export async function openRotationRequest(
  hubUrl: string,
  oldPubkey: string,
  reason?: string,
): Promise<RecoveryRequestBundle> {
  const identity = await loadIdentity();
  if (!identity) throw new Error("No local identity");
  const newSeed = masterSeedHex(identity.seed_hex);
  const newPubkey = masterPublicKeyHex(identity.seed_hex);
  const base = hubUrl.replace(/\/$/, "");
  const hubPubkey = await hubPublicKey(base);
  const newKeySignature = signRecoveryRequest(newSeed, hubPubkey, oldPubkey, newPubkey);

  const r = await rawFetch(`${base}/recovery/rotate-key`, {
    method: "POST",
    body: JSON.stringify({
      old_pubkey: oldPubkey,
      new_pubkey: newPubkey,
      reason,
      new_key_signature: newKeySignature,
    }),
  });
  const created = (await r.json()) as { id: string };
  return getRotationRequestBundle(hubUrl, created.id);
}

export async function getRotationRequestBundle(hubUrl: string, id: string): Promise<RecoveryRequestBundle> {
  const r = await rawFetch(`${hubUrl.replace(/\/$/, "")}/recovery/rotation-request/${id}`);
  return r.json() as Promise<RecoveryRequestBundle>;
}

/** Signs the bundle as this device's active identity (the attesting contact)
 *  and submits it. Crypto stays client-side but never leaves this function —
 *  callers only ever see the fetched bundle, never raw key material. */
export async function attestRotationRequest(hubUrl: string, bundle: RecoveryRequestBundle): Promise<void> {
  const identity = await loadIdentity();
  if (!identity) throw new Error("No local identity");
  const contactSeed = masterSeedHex(identity.seed_hex);
  const attester = masterPublicKeyHex(identity.seed_hex);
  const signature = signRecoveryAttestation(
    contactSeed,
    bundle.hub_pubkey,
    bundle.old_pubkey,
    bundle.new_pubkey,
    bundle.nonce,
  );
  await rawFetch(`${hubUrl.replace(/\/$/, "")}/recovery/rotation-request/${bundle.id}/attest`, {
    method: "POST",
    body: JSON.stringify({ attester, signature }),
  });
}

// ---- Block / DM-blocks ----

export async function updateDmBlocks(blockedPubkeys: string[]): Promise<void> {
  // Server contract (identity.rs DmBlocksRequest) names the field `pubkeys`;
  // the old `blocked_pubkeys` body 422'd on every block and the caller's
  // empty catch hid it — blocks never persisted.
  await hubFetch("/identity/dm-blocks", {
    method: "PUT",
    body: JSON.stringify({ pubkeys: blockedPubkeys }),
  });
}

export async function getDmBlocks(): Promise<string[]> {
  const res = await hubFetch("/identity/dm-blocks");
  const body = (await res.json()) as { pubkeys: string[] };
  return body.pubkeys;
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
  welcome_label?: string;
  welcome_invite_url?: string;
  /** Role auto-granted at invite redemption when the invite carries no
   *  explicit grant_role_id. null clears it (newcomers get only @everyone). */
  default_invite_role_id?: string | null;
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
  welcome_label: string;
  welcome_invite_url: string;
  default_invite_role_id: string | null;
}> {
  const [settingsRes, infoRes] = await Promise.all([
    hubFetch("/hub/settings").then((r) => r.json() as Promise<{
      require_approval: boolean;
      invite_only: boolean;
      min_security_level: number;
      max_channel_depth: number;
      default_invite_role_id?: string | null;
    }>),
    hubFetch("/info").then((r) => r.json() as Promise<{
      name: string;
      description?: string | null;
      icon?: string | null;
      welcome_label?: string | null;
      welcome_invite_url?: string | null;
    }>),
  ]);
  return {
    hub_name: infoRes.name,
    hub_description: infoRes.description ?? "",
    hub_icon: infoRes.icon ?? "",
    require_approval: settingsRes.require_approval,
    min_security_level: settingsRes.min_security_level,
    max_channel_depth: settingsRes.max_channel_depth,
    welcome_label: infoRes.welcome_label ?? "",
    welcome_invite_url: infoRes.welcome_invite_url ?? "",
    default_invite_role_id: settingsRes.default_invite_role_id ?? null,
  };
}

// ---- Invites ----

/** Creates an invite. Self-contained (not routed through the admin invite
 *  list state) for lightweight callers like the member quick-invite flow. */
export async function createInvite(
  maxUses: number | null,
  expiresInSeconds: number | null,
  grantRoleId: string | null,
): Promise<InviteInfo> {
  const r = await hubFetch("/invites", {
    method: "POST",
    body: JSON.stringify({
      max_uses: maxUses,
      expires_in_seconds: expiresInSeconds,
      grant_role_id: grantRoleId,
    }),
  });
  return r.json() as Promise<InviteInfo>;
}

// ---- Public listing (/federation/listing itself is unauthenticated, but
// hubFetch's auth header is harmless against it; the admin toggle lives at
// /admin/settings/listing) ----

export async function getHubListingStatus(): Promise<boolean> {
  const r = await hubFetch("/federation/listing");
  const body = (await r.json()) as { listed?: boolean };
  return body.listed ?? false;
}

export async function setHubListed(listed: boolean): Promise<void> {
  await hubFetch("/admin/settings/listing", {
    method: "PATCH",
    body: JSON.stringify({ listed }),
  });
}
