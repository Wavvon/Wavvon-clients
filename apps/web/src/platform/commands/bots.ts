import { hubFetch } from "../http";
import { activeSession } from "../session";
import type { BotProfile } from "@shared/types";
import type {
  ExternalBotRow,
  ExternalBotInviteResult,
  WebhookInfo,
  WebhookCreatedResult,
} from "@wavvon/ui";
import type { BotCapabilityGrants, GameLaunchCard } from "@wavvon/core";

/** GET /admin/bots/external -- admin management view (bots.md §4): every
 *  external bot row (pending invite, active, removed), not just the
 *  member-facing directory `GET /bots` returns. */
export async function adminListExternalBots(): Promise<ExternalBotRow[]> {
  const res = await hubFetch("/admin/bots/external");
  return res.json() as Promise<ExternalBotRow[]>;
}

/** POST /bots -- the real invite-by-pubkey route (bots.md §2, exercised by
 *  ttt-bot/README.md). Maps the hub's `{ invite_token }` response onto the
 *  richer `ExternalBotInviteResult` shape this panel renders. */
export async function adminAddExternalBot(
  pubkey: string,
  localNote: string | null,
): Promise<ExternalBotInviteResult> {
  const res = await hubFetch("/bots", {
    method: "POST",
    body: JSON.stringify({ pubkey, note: localNote }),
  });
  const body = (await res.json()) as { invite_token: string };
  return { bot_invite_token: body.invite_token, pubkey };
}

/** DELETE /bots/:pubkey -- the real bot-removal route (bots.md §2). */
export async function adminRemoveExternalBot(pubkey: string): Promise<void> {
  await hubFetch(`/bots/${pubkey}`, { method: "DELETE" });
}

/** PUT /admin/bots/:pubkey/channels -- replaces channel scope atomically
 *  (bots.md §14). Empty list resets to hub-wide access. */
export async function adminSetBotChannelScope(
  pubkey: string,
  channelIds: string[],
): Promise<void> {
  await hubFetch(`/admin/bots/${pubkey}/channels`, {
    method: "PUT",
    body: JSON.stringify({ channel_ids: channelIds }),
  });
}

/** GET /admin/bots/:pubkey/channels -- current channel scope (bots.md §14).
 *  Empty list means hub-wide access. */
export async function adminGetBotChannelScope(pubkey: string): Promise<string[]> {
  const res = await hubFetch(`/admin/bots/${pubkey}/channels`);
  const body = (await res.json()) as { channel_ids: string[] };
  return body.channel_ids;
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
  avatar_url?: string | null;
  description?: string | null;
  /** Profile-declared game descriptor (bot-capability-layer.md §11): drives
   *  the directory card's Play affordance. Absent = bot never declared one. */
  game?: GameLaunchCard | null;
  commands: BotCommandSummary[];
}

export async function listBots(): Promise<BotListEntry[]> {
  const res = await hubFetch("/bots");
  return res.json() as Promise<BotListEntry[]>;
}

export async function listBotCommands(): Promise<Array<{ command: string; description: string; bot_name: string }>> {
  const bots = await listBots();
  return bots.flatMap((b) =>
    b.commands.map((c) => ({ command: c.name, description: c.description, bot_name: b.name }))
  );
}

/** Directory-card lookup for the hover/click bot card (bots.md §10). Sourced
 *  from the same `GET /bots` directory list -- there is no single-bot
 *  profile route, so this filters client-side. */
export async function getBotProfile(pubkey: string): Promise<BotProfile> {
  const bots = await listBots();
  const bot = bots.find((b) => b.pubkey === pubkey);
  if (!bot) throw new Error("Bot not found");
  return {
    pubkey: bot.pubkey,
    name: bot.name,
    avatar_url: bot.avatar_url ?? null,
    description: bot.description ?? null,
    commands: bot.commands,
    game: bot.game ?? null,
  };
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
