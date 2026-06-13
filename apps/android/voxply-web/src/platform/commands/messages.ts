import { hubFetch } from "../http";
import type { Message, Attachment } from "@shared/types";

export async function getMessages(
  channel_id: string,
  before?: string,
  limit = 50,
): Promise<Message[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set("before", before);
  const res = await hubFetch(`/channels/${channel_id}/messages?${params}`);
  return res.json() as Promise<Message[]>;
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
    `/channels/${channel_id}/messages/${message_id}/reactions/${encodeURIComponent(emoji)}`,
    { method: "PUT" },
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
  const res = await hubFetch(`/channels/${channel_id}/messages/search?${params}`);
  return res.json() as Promise<Message[]>;
}

export async function subscribeChannel(channel_id: string): Promise<void> {
  await hubFetch(`/channels/${channel_id}/subscribe`, { method: "POST" });
}

export async function unsubscribeChannel(channel_id: string): Promise<void> {
  await hubFetch(`/channels/${channel_id}/unsubscribe`, { method: "POST" });
}
