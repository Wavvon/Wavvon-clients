import { hubFetch } from "../http";
import { activeSession } from "../session";
import type { WebhookInfo, WebhookCreatedResult } from "@wavvon/ui";
import type { GameLaunchCard } from "@wavvon/core";

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

export interface AppCommandSummary {
  name: string;
  description: string;
}

export interface AppListEntry {
  pubkey: string;
  name: string;
  avatar_url?: string | null;
  description?: string | null;
  /** Profile-declared game descriptor: drives a Play affordance without a
   *  launch-card message in view. Absent = none declared. */
  game?: GameLaunchCard | null;
  commands: AppCommandSummary[];
}

/** GET /apps — the apps registered on this hub. Any member may read it; what
 *  it returns is what each app says about itself. */
export async function listApps(): Promise<AppListEntry[]> {
  const res = await hubFetch("/apps");
  return res.json() as Promise<AppListEntry[]>;
}

/** The slash commands offered while typing, flattened across every app. */
export async function listAppCommands(): Promise<
  Array<{ command: string; description: string; app_name: string }>
> {
  const apps = await listApps();
  return apps.flatMap((a) =>
    a.commands.map((c) => ({ command: c.name, description: c.description, app_name: a.name })),
  );
}

/** Joins an app's mini-app / game-modal session. */
export function sendAppJoin(appId: string, channelId: string): void {
  const { ws } = activeSession();
  if (ws) {
    ws.send({ type: "app_join", app_id: appId, channel_id: channelId });
  }
}
