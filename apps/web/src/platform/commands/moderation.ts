import { hubFetch } from "../http";
import type {
  Report,
  ModerationSettings,
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
  await hubFetch("/admin/settings/banlist/sources", {
    method: "POST",
    body: JSON.stringify({ url, policy }),
  });
}

export async function removeBanlistSource(url: string): Promise<void> {
  await hubFetch("/admin/settings/banlist/sources", {
    method: "DELETE",
    body: JSON.stringify({ url }),
  });
}

export async function updateBanlistSourcePolicy(
  url: string,
  policy: "hard-reject" | "soft-flag",
): Promise<void> {
  await hubFetch("/admin/settings/banlist/sources", {
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
  await hubFetch("/admin/settings/banlist/publish", {
    method: "PATCH",
    body: JSON.stringify({ publish_banlist: publish }),
  });
}
