import { hubFetch } from "../http";
import { activeHubCapabilities } from "../session";
import { fetchAllPages, LIST_CURSOR_CAP, LIST_MAX_PAGES, LIST_PAGE_SIZE } from "./paged";
import type { MemberHistoryEntry } from "@wavvon/ui";
import type {
  Report,
  ModerationSettings,
  BanInfo,
  BanlistSource,
  FederatedBanEntry,
  BanlistOverride,
} from "../../types";

export async function reportMessage(messageId: string, reason: string): Promise<void> {
  await hubFetch(`/messages/${messageId}/report`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function listReports(status?: string): Promise<Report[]> {
  const params = status ? `?status=${encodeURIComponent(status)}` : "";
  const r = await hubFetch(`/admin/reports${params}`);
  return r.json() as Promise<Report[]>;
}

export async function reviewReport(
  reportId: string,
  action: "dismiss" | "delete_message" | "ban_user",
  note?: string,
): Promise<void> {
  await hubFetch(`/admin/reports/${reportId}/review`, {
    method: "POST",
    body: JSON.stringify({ action, note }),
  });
}

export async function getModerationSettings(): Promise<ModerationSettings> {
  const r = await hubFetch("/admin/settings/moderation");
  return r.json() as Promise<ModerationSettings>;
}

export async function patchModerationSettings(
  webhookUrl?: string,
  webhookSecret?: string,
): Promise<void> {
  await hubFetch("/admin/settings/moderation", {
    method: "PATCH",
    body: JSON.stringify({ webhook_url: webhookUrl, webhook_secret: webhookSecret }),
  });
}

export async function getBanlistSettings(): Promise<{
  publish_banlist: boolean;
  sources: BanlistSource[];
}> {
  const r = await hubFetch("/admin/settings/banlist");
  return r.json() as Promise<{ publish_banlist: boolean; sources: BanlistSource[] }>;
}

export async function addBanlistSource(
  url: string,
  policy: "hard-reject" | "soft-flag",
): Promise<void> {
  await hubFetch("/admin/banlist/sources", {
    method: "POST",
    body: JSON.stringify({ url, policy }),
  });
}

export async function removeBanlistSource(url: string): Promise<void> {
  await hubFetch("/admin/banlist/sources", {
    method: "DELETE",
    body: JSON.stringify({ url }),
  });
}

export async function updateBanlistSourcePolicy(
  url: string,
  policy: "hard-reject" | "soft-flag",
): Promise<void> {
  await hubFetch("/admin/banlist/sources", {
    method: "PATCH",
    body: JSON.stringify({ url, policy }),
  });
}

export async function getBanlistEntries(source?: string): Promise<FederatedBanEntry[]> {
  const params = source ? `?source=${encodeURIComponent(source)}` : "";
  const r = await hubFetch(`/admin/banlist/entries${params}`);
  return r.json() as Promise<FederatedBanEntry[]>;
}

export async function getBanlistOverrides(): Promise<BanlistOverride[]> {
  const r = await hubFetch("/admin/banlist/overrides");
  return r.json() as Promise<BanlistOverride[]>;
}

export async function addBanlistOverride(
  targetPubkey: string,
  overrideType: "whitelist" | "blacklist",
  reason?: string,
): Promise<void> {
  await hubFetch("/admin/banlist/overrides", {
    method: "POST",
    body: JSON.stringify({ target_pubkey: targetPubkey, override_type: overrideType, reason }),
  });
}

export async function removeBanlistOverride(targetPubkey: string): Promise<void> {
  await hubFetch(`/admin/banlist/overrides/${encodeURIComponent(targetPubkey)}`, {
    method: "DELETE",
  });
}

export async function setBanlistPublish(publish: boolean): Promise<void> {
  await hubFetch("/admin/settings/banlist", {
    method: "PATCH",
    body: JSON.stringify({ publish_banlist: publish }),
  });
}

// ---- Per-member moderation actions (mute / timeout / voice-mute) ----

export async function muteMember(targetPublicKey: string, reason: string | null): Promise<void> {
  await hubFetch("/moderation/mutes", {
    method: "POST",
    body: JSON.stringify({ target_public_key: targetPublicKey, reason }),
  });
}

export async function timeoutMember(
  targetPublicKey: string,
  durationSeconds: number,
  reason: string | null,
): Promise<void> {
  await hubFetch("/moderation/timeout", {
    method: "POST",
    body: JSON.stringify({ target_public_key: targetPublicKey, duration_seconds: durationSeconds, reason }),
  });
}

export interface VoiceMuteInfo {
  target_public_key: string;
  muted_by: string;
  reason: string | null;
  created_at: number;
}

export async function voiceMuteMember(targetPublicKey: string, reason: string | null): Promise<void> {
  await hubFetch("/moderation/voice-mutes", {
    method: "POST",
    body: JSON.stringify({ target_public_key: targetPublicKey, reason }),
  });
}

export async function voiceUnmuteMember(targetPublicKey: string): Promise<void> {
  await hubFetch(`/moderation/voice-mutes/${targetPublicKey}`, { method: "DELETE" });
}

export async function listVoiceMutes(): Promise<VoiceMuteInfo[]> {
  const r = await hubFetch("/moderation/voice-mutes");
  return r.json() as Promise<VoiceMuteInfo[]>;
}

/**
 * What other hubs have said about a member.
 *
 * The read side of `soft-flag`: a subscribed hub banned this person, this hub
 * let them in, and a moderator deciding what to do gets to know. Requires the
 * ban permission, same as the actions it informs.
 */
export async function fetchMemberHistory(pubkey: string): Promise<MemberHistoryEntry[]> {
  const res = await hubFetch(`/moderation/history/${encodeURIComponent(pubkey)}`);
  const body = (await res.json()) as { entries?: MemberHistoryEntry[] };
  return body.entries ?? [];
}

/**
 * Every ban on this hub, walked to exhaustion.
 *
 * The admin table wants the whole list — showing the first page of bans and
 * saying nothing would read as "this member is not banned" to whoever is
 * deciding whether to unban them.
 */
export async function listBans(): Promise<BanInfo[]> {
  return fetchAllPages<BanInfo>({
    capabilities: activeHubCapabilities(),
    capability: LIST_CURSOR_CAP,
    pageSize: LIST_PAGE_SIZE,
    maxPages: LIST_MAX_PAGES,
    cursorOf: (b) => b.target_public_key,
    fetchPage: async (params) =>
      (await (
        await hubFetch(params ? `/moderation/bans?${params}` : "/moderation/bans")
      ).json()) as BanInfo[],
    label: "listBans",
  });
}
