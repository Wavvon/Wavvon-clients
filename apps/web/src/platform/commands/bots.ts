import { hubFetch } from "../http";
import { activeSession } from "../session";
import type {
  BotProfile,
  ExternalBotRow,
  ExternalBotInviteResult,
  WebhookInfo,
  WebhookCreatedResult,
} from "@shared/types";
import type { BotCapabilityGrants } from "@wavvon/core";

export async function getBotProfile(pubkey: string): Promise<BotProfile> {
  const res = await hubFetch(`/bots/${pubkey}`);
  return res.json() as Promise<BotProfile>;
}

export async function adminListExternalBots(): Promise<ExternalBotRow[]> {
  const res = await hubFetch("/admin/bots/external");
  return res.json() as Promise<ExternalBotRow[]>;
}

export async function adminAddExternalBot(
  pubkey: string,
  localNote: string | null,
): Promise<ExternalBotInviteResult> {
  const res = await hubFetch("/admin/bots/external", {
    method: "POST",
    body: JSON.stringify({ pubkey, local_note: localNote }),
  });
  return res.json() as Promise<ExternalBotInviteResult>;
}

export async function adminRemoveExternalBot(pubkey: string): Promise<void> {
  await hubFetch(`/admin/bots/external/${pubkey}`, { method: "DELETE" });
}

export async function adminSetBotChannelScope(
  pubkey: string,
  channelIds: string[],
): Promise<void> {
  await hubFetch(`/admin/bots/${pubkey}/channels`, {
    method: "PUT",
    body: JSON.stringify({ channel_ids: channelIds }),
  });
}

/** GET /admin/bots/:pubkey/capabilities (bot-capability-layer.md §1). */
export async function adminGetBotCapabilities(pubkey: string): Promise<BotCapabilityGrants> {
  const res = await hubFetch(`/admin/bots/${pubkey}/capabilities`);
  return res.json() as Promise<BotCapabilityGrants>;
}

/** PUT /admin/bots/:pubkey/capabilities -- replaces the granted set atomically. */
export async function adminSetBotCapabilities(pubkey: string, capabilities: string[]): Promise<void> {
  await hubFetch(`/admin/bots/${pubkey}/capabilities`, {
    method: "PUT",
    body: JSON.stringify({ capabilities }),
  });
}

export async function adminListWebhooks(): Promise<WebhookInfo[]> {
  const res = await hubFetch("/admin/webhooks");
  return res.json() as Promise<WebhookInfo[]>;
}

export async function adminCreateWebhook(
  channelId: string,
  displayName: string,
  avatarUrl: string | null,
): Promise<WebhookCreatedResult> {
  const res = await hubFetch("/admin/webhooks", {
    method: "POST",
    body: JSON.stringify({ channel_id: channelId, display_name: displayName, avatar_url: avatarUrl }),
  });
  return res.json() as Promise<WebhookCreatedResult>;
}

export async function adminRegenerateWebhook(webhookId: string): Promise<WebhookCreatedResult> {
  const res = await hubFetch(`/admin/webhooks/${webhookId}`, {
    method: "PATCH",
    body: JSON.stringify({}),
  });
  return res.json() as Promise<WebhookCreatedResult>;
}

export async function adminDeleteWebhook(webhookId: string): Promise<void> {
  await hubFetch(`/admin/webhooks/${webhookId}`, { method: "DELETE" });
}

export interface BotCommandSummary {
  name: string;
  description: string;
}

export interface BotListEntry {
  pubkey: string;
  name: string;
  commands: BotCommandSummary[];
}

export async function listBotCommands(): Promise<Array<{ command: string; description: string; bot_name: string }>> {
  const res = await hubFetch("/bots");
  const bots = (await res.json()) as BotListEntry[];
  return bots.flatMap((b) =>
    b.commands.map((c) => ({ command: c.name, description: c.description, bot_name: b.name }))
  );
}

export function sendComponentInteraction(
  messageId: string,
  customId: string,
  values: string[],
): void {
  const { ws } = activeSession();
  if (ws) {
    ws.send({ type: "component_interaction", message_id: messageId, custom_id: customId, values });
  }
}

/** Joins a bot's mini-app / game-modal session (bot-mini-apps.md, bot-capability-layer.md §2). */
export function sendBotAppJoin(botId: string, channelId: string): void {
  const { ws } = activeSession();
  if (ws) {
    ws.send({ type: "bot_app_join", bot_id: botId, channel_id: channelId });
  }
}
