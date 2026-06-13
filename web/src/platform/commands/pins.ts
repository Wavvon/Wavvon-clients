import { hubFetch } from "../http";
import type { PinnedMessage } from "@shared/types";

export async function pinMessage(channelId: string, messageId: string): Promise<void> {
  await hubFetch(`/channels/${channelId}/pins/${messageId}`, { method: "POST" });
}

export async function unpinMessage(channelId: string, messageId: string): Promise<void> {
  await hubFetch(`/channels/${channelId}/pins/${messageId}`, { method: "DELETE" });
}

export async function getPins(channelId: string): Promise<PinnedMessage[]> {
  const res = await hubFetch(`/channels/${channelId}/pins`);
  return res.json() as Promise<PinnedMessage[]>;
}
