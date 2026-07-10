import { hubFetch } from "../http";
import { activeSession, allSessions, getSession } from "../session";
import type { Message, Attachment } from "@shared/types";

export async function getMessages(
  channel_id: string,
  before?: string,
  limit = 50,
): Promise<Message[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set("before", before);
  const res = await hubFetch(`/channels/${channel_id}/messages?${params}`);
  const msgs = await res.json() as Message[];
  return [...msgs].reverse();
}

export async function sendMessage(
  channel_id: string,
  content: string,
  attachments?: Attachment[],
  reply_to?: string,
): Promise<void> {
  await hubFetch(`/channels/${channel_id}/messages`, {
    method: "POST",
    body: JSON.stringify({ content, attachments, reply_to }),
  });
}

export async function editMessage(
  channel_id: string,
  message_id: string,
  content: string,
): Promise<void> {
  await hubFetch(`/channels/${channel_id}/messages/${message_id}`, {
    method: "PATCH",
    body: JSON.stringify({ content }),
  });
}

export async function deleteMessage(
  channel_id: string,
  message_id: string,
): Promise<void> {
  await hubFetch(`/channels/${channel_id}/messages/${message_id}`, {
    method: "DELETE",
  });
}

export async function addReaction(
  channel_id: string,
  message_id: string,
  emoji: string,
): Promise<void> {
  await hubFetch(
    `/channels/${channel_id}/messages/${message_id}/reactions`,
    { method: "POST", body: JSON.stringify({ emoji }) },
  );
}

export async function removeReaction(
  channel_id: string,
  message_id: string,
  emoji: string,
): Promise<void> {
  await hubFetch(
    `/channels/${channel_id}/messages/${message_id}/reactions/${encodeURIComponent(emoji)}`,
    { method: "DELETE" },
  );
}

export async function searchMessages(
  channel_id: string,
  query: string,
  limit = 20,
): Promise<Message[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const res = await hubFetch(`/channels/${channel_id}/messages?${params}`);
  return res.json() as Promise<Message[]>;
}

// Live-event subscription is a WebSocket frame, not an HTTP endpoint: the
// hub auto-subscribes each connection to channels readable at connect time,
// so channels created later deliver no chat events until subscribed.
export async function subscribeChannel(channel_id: string): Promise<void> {
  activeSession().ws?.subscribeChannel(channel_id);
}

export async function unsubscribeChannel(channel_id: string): Promise<void> {
  activeSession().ws?.unsubscribeChannel(channel_id);
}

export interface UnreadCount {
  channel_id: string;
  unread_count: number;
}

export async function getUnreadCounts(): Promise<UnreadCount[]> {
  const r = await hubFetch("/channels/unread");
  return r.json() as Promise<UnreadCount[]>;
}

export async function markChannelRead(channel_id: string): Promise<void> {
  await hubFetch(`/channels/${channel_id}/read`, { method: "POST" });
}

export function sendTypingEvent(channel_id: string, typing: boolean): void {
  const s = activeSession();
  s.ws?.send({ type: "typing", channel_id, typing });
}

export function sendDmTypingEvent(conversation_id: string, typing: boolean): void {
  const s = activeSession();
  s.ws?.send({ type: "dm_typing", conversation_id, typing });
}

/** Set own presence status on every connected hub — presence is global,
 * not per-hub. "online" clears, "away"/"dnd" set it; custom is an
 * optional short status text. Each hub persists it across reconnects;
 * sendSetStatusTo covers hubs that (re)connect later. */
export function sendSetStatus(status: "online" | "away" | "dnd", custom?: string | null): void {
  for (const s of allSessions()) {
    s.ws?.send({ type: "set_status", status, custom: custom ?? null });
  }
}

/** Re-apply the device's presence to a single hub on (re)connect. */
export function sendSetStatusTo(hubId: string, status: "online" | "away" | "dnd", custom?: string | null): void {
  getSession(hubId)?.ws?.send({ type: "set_status", status, custom: custom ?? null });
}

export async function getAllianceChannelMessages(
  allianceId: string,
  channelId: string,
): Promise<Message[]> {
  const r = await hubFetch(`/alliances/${allianceId}/channels/${channelId}/messages`);
  const msgs = await r.json() as Message[];
  return [...msgs].reverse();
}

export async function sendAllianceChannelMessage(
  allianceId: string,
  channelId: string,
  content: string,
): Promise<void> {
  await hubFetch(`/alliances/${allianceId}/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}
