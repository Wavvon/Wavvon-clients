import { hubFetch } from "../http";
import { activeHubCapabilities } from "../session";
import { fetchAllPages, LIST_CURSOR_CAP, LIST_MAX_PAGES, LIST_PAGE_SIZE } from "./paged";
import type { PinnedMessage } from "@shared/types";

export async function pinMessage(channelId: string, messageId: string): Promise<void> {
  await hubFetch(`/channels/${channelId}/pins/${messageId}`, { method: "POST" });
}

export async function unpinMessage(channelId: string, messageId: string): Promise<void> {
  await hubFetch(`/channels/${channelId}/pins/${messageId}`, { method: "DELETE" });
}

export async function getPins(channelId: string): Promise<PinnedMessage[]> {
  return fetchAllPages<PinnedMessage>({
    capabilities: activeHubCapabilities(),
    capability: LIST_CURSOR_CAP,
    pageSize: LIST_PAGE_SIZE,
    maxPages: LIST_MAX_PAGES,
    cursorOf: (p) => p.message_id,
    fetchPage: async (params) =>
      (await (
        await hubFetch(`/channels/${channelId}/pins${params ? `?${params}` : ""}`)
      ).json()) as PinnedMessage[],
    label: "getPins",
  });
}
