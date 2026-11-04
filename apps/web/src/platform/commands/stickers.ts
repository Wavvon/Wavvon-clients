import type { SavedSticker } from "@wavvon/core";
import { hubFetch, HubApiError } from "../http";
import { activeSession } from "../session";
import type {
  AdminSticker,
  Sticker,
  StickerBlockEntry,
  StickerPack,
  StickerSettings,
  StickerUsage,
} from "@wavvon/ui";

const json = (body: unknown) => ({ body: JSON.stringify(body) });

export async function listStickerPacks(): Promise<StickerPack[]> {
  return (await hubFetch("/stickers/packs")).json() as Promise<StickerPack[]>;
}

export async function createStickerPack(name: string): Promise<StickerPack> {
  return (await hubFetch("/stickers/packs", { method: "POST", ...json({ name }) })).json() as Promise<StickerPack>;
}

export async function renameStickerPack(packId: string, name: string): Promise<void> {
  await hubFetch(`/stickers/packs/${packId}`, { method: "PATCH", ...json({ name }) });
}

export async function deleteStickerPack(packId: string): Promise<void> {
  await hubFetch(`/stickers/packs/${packId}`, { method: "DELETE" });
}

export async function uploadStickerToPack(packId: string, name: string, file: File): Promise<Sticker> {
  const { hub_url, token } = activeSession();
  const form = new FormData();
  form.append("name", name);
  form.append("file", file, file.name);
  const res = await fetch(`${hub_url}/stickers/packs/${packId}/stickers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new HubApiError(res.status, (await res.text().catch(() => "")) || res.statusText);
  return res.json() as Promise<Sticker>;
}

export async function addCopyToStickerPack(packId: string, sha256: string): Promise<Sticker> {
  return (await hubFetch(`/stickers/packs/${packId}/stickers`, { method: "POST", ...json({ sha256 }) })).json() as Promise<Sticker>;
}

export async function removeStickerFromPack(packId: string, stickerId: string): Promise<void> {
  await hubFetch(`/stickers/packs/${packId}/stickers/${stickerId}`, { method: "DELETE" });
}

/** Makes this hub hold the sticker so a message can reference it. The client
 *  sends a hash and an origin, never bytes. */
export async function ensureChannelSticker(channelId: string, entry: SavedSticker): Promise<Sticker> {
  const res = await hubFetch(`/channels/${channelId}/stickers`, {
    method: "POST",
    ...json({ sha256: entry.sha256, origin_hub_url: entry.origin_hub_url, name: entry.name.slice(0, 32) }),
  });
  return res.json() as Promise<Sticker>;
}

export async function listStoredStickers(query: {
  sort: "created" | "used" | "size";
  limit: number;
  cursor?: string;
}): Promise<AdminSticker[]> {
  const p = new URLSearchParams({ sort: query.sort, limit: String(query.limit) });
  if (query.cursor) p.set("cursor", query.cursor);
  return (await hubFetch(`/admin/stickers?${p}`)).json() as Promise<AdminSticker[]>;
}

export async function getStickerUsage(): Promise<StickerUsage> {
  return (await hubFetch("/admin/stickers/usage")).json() as Promise<StickerUsage>;
}

export async function deleteStoredSticker(id: string, block: boolean): Promise<void> {
  await hubFetch(`/admin/stickers/${id}${block ? "?block=true" : ""}`, { method: "DELETE" });
}

export async function listStickerBlocklist(): Promise<StickerBlockEntry[]> {
  return (await hubFetch("/admin/stickers/blocklist")).json() as Promise<StickerBlockEntry[]>;
}

export async function unblockSticker(sha256: string): Promise<void> {
  await hubFetch(`/admin/stickers/blocklist/${sha256}`, { method: "DELETE" });
}

export async function getStickerSettings(): Promise<StickerSettings> {
  return (await hubFetch("/hub/settings")).json() as Promise<StickerSettings>;
}

export async function saveStickerSettings(patch: Partial<StickerSettings>): Promise<void> {
  await hubFetch("/hub", { method: "PATCH", ...json(patch) });
}
